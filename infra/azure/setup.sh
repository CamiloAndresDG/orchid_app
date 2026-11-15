#!/usr/bin/env bash
# Crea todo en Azure y hace el primer despliegue de Orchid.
# Uso (desde la raíz del repo, con Azure CLI y `az login` hecho):
#   QUICKSTATS_KEY=tu_clave bash infra/azure/setup.sh
# Todo se puede cambiar con variables de entorno (RG, LOCATION, ACR, STORAGE...).
set -euo pipefail

# Todo va dentro de { ... } para que bash lea el script completo antes de ejecutarlo: en Windows los
# procesos hijos (az) pueden mover la posición de lectura del archivo y bash leería basura.
{

# Windows (Git Bash) con Azure CLI instalado por pip: ese "az" se relanza con os.execl y devuelve el control
# antes de terminar, así que $(az ...) queda vacío. Se llama a su Python directamente.
if [[ "${OSTYPE:-}" == msys* || "${OSTYPE:-}" == cygwin* ]]; then
  AZ_PY=$(head -1 "$(command -v az)" | sed -n 's/^#!//p' | tr -d '\r\n')
  if [[ -n "$AZ_PY" && "$AZ_PY" == *python* && -x "$(cygpath -u "$AZ_PY")" ]]; then
    AZ_PY=$(cygpath -u "$AZ_PY")
    az() { "$AZ_PY" -m azure.cli "$@"; }
  fi
fi

# Sufijo estable sacado de la suscripción, para que los nombres globales no choquen.
SUFFIX=$(az account show --query id -o tsv | tr -d '-' | cut -c1-6)
RG=${RG:-rg-orchid}
LOCATION=${LOCATION:-eastus2}
ACR=${ACR:-acrorchid$SUFFIX}
STORAGE=${STORAGE:-storchid$SUFFIX}
ENV_NAME=${ENV_NAME:-env-orchid}
PG=${PG:-pg-orchid$SUFFIX}
# Algunas suscripciones no permiten PostgreSQL Flexible Server en todas las regiones (p. ej. eastus2).
PG_LOCATION=${PG_LOCATION:-centralus}
PG_USER=${PG_USER:-fsadmin}
PG_DB=${PG_DB:-orchid}
# Solo letras y números (no hay que escaparla en la URL); "Fs1" asegura mayúscula, minúscula y dígito.
PG_PASSWORD=${PG_PASSWORD:-Fs1$(openssl rand -hex 16)}
# Guía de IA en Microsoft Foundry. Por defecto gpt-5-mini (Azure OpenAI, con cuota en suscripciones nuevas).
# Con ASSISTANT_PROVIDER=foundry usa Claude: desplegar modelos de Anthropic pide datos de la organización (se
# envían a Anthropic al aceptar sus términos en Azure Marketplace) y cuota de Claude, que hay que solicitar.
FOUNDRY=${FOUNDRY:-orchid-ai-$SUFFIX}
ASSISTANT_PROVIDER=${ASSISTANT_PROVIDER:-azure_openai}
if [[ "$ASSISTANT_PROVIDER" == "azure_openai" ]]; then
  ASSISTANT_MODEL=${ASSISTANT_MODEL:-gpt-5-mini}
  ASSISTANT_MODEL_VERSION=${ASSISTANT_MODEL_VERSION:-2025-08-07}
  ASSISTANT_FALLBACK_MODEL=""
else
  ASSISTANT_MODEL=${ASSISTANT_MODEL:-claude-opus-5-5}
  ASSISTANT_FALLBACK_MODEL=${ASSISTANT_FALLBACK_MODEL:-claude-opus-4-8}
fi
ASSISTANT_DAILY_LIMIT=${ASSISTANT_DAILY_LIMIT:-30}
ORG_NAME=${ORG_NAME:-Orchid}
ORG_INDUSTRY=${ORG_INDUSTRY:-Agriculture}
ORG_COUNTRY=${ORG_COUNTRY:-CO}
API_APP=${API_APP:-orchid-api}
WEB_APP=${WEB_APP:-orchid-web}
TAG=${TAG:-$(git rev-parse --short HEAD)}
# Container Apps no acepta secretos vacíos: "-" significa "sin clave del servidor".
QUICKSTATS_KEY=${QUICKSTATS_KEY:--}
HERE=$(cd "$(dirname "$0")" && pwd)

echo "==> Grupo de recursos $RG ($LOCATION)"
az extension add --name containerapp --upgrade --only-show-errors
for ns in Microsoft.App Microsoft.OperationalInsights Microsoft.ContainerRegistry Microsoft.Storage Microsoft.DBforPostgreSQL Microsoft.CognitiveServices; do
  az provider register -n "$ns" --wait
done
az group create -n "$RG" -l "$LOCATION" -o none

# Cada paso revisa si el recurso ya existe: el script se puede volver a correr sin romper nada.
exists() { az "$@" -o none >/dev/null 2>&1; }

# Construye y sube una imagen. Con Docker disponible se construye en este equipo; si no, con ACR Tasks
# (az acr build), que algunas suscripciones nuevas o de prueba no permiten.
build_image() {  # nombre carpeta [build-arg]
  local img="$ACR.azurecr.io/$1:$TAG"
  if [[ "${BUILD:-auto}" != acr ]] && command -v docker >/dev/null && docker info >/dev/null 2>&1; then
    az acr login -n "$ACR" -o none
    docker build --platform linux/amd64 -t "$img" ${3:+--build-arg "$3"} "$2"
    docker push "$img"
  else
    az acr build -r "$ACR" -t "$1:$TAG" ${3:+--build-arg "$3"} "$2" -o none
  fi
}

echo "==> Container Registry $ACR"
exists acr show -n "$ACR" || az acr create -g "$RG" -n "$ACR" --sku Basic --admin-enabled true -o none
ACR_PASSWORD=$(az acr credential show -n "$ACR" --query "passwords[0].value" -o tsv)

echo "==> Entorno de Container Apps $ENV_NAME"
exists containerapp env show -g "$RG" -n "$ENV_NAME" || az containerapp env create -g "$RG" -n "$ENV_NAME" -l "$LOCATION" -o none
until [[ "$(az containerapp env show -g "$RG" -n "$ENV_NAME" --query properties.provisioningState -o tsv)" == "Succeeded" ]]; do
  echo "    esperando a que el entorno termine de crearse..."; sleep 15
done
ENV_ID=$(az containerapp env show -g "$RG" -n "$ENV_NAME" --query id -o tsv)

echo "==> Azure Files para la caché del backend"
exists storage account show -g "$RG" -n "$STORAGE" ||
  az storage account create -g "$RG" -n "$STORAGE" -l "$LOCATION" --sku Standard_LRS --kind StorageV2 -o none
exists storage share-rm show -g "$RG" --storage-account "$STORAGE" -n cache ||
  az storage share-rm create -g "$RG" --storage-account "$STORAGE" -n cache --quota 5 -o none
STORAGE_KEY=$(az storage account keys list -g "$RG" -n "$STORAGE" --query "[0].value" -o tsv)
az containerapp env storage set -g "$RG" -n "$ENV_NAME" --storage-name cache   --azure-file-account-name "$STORAGE" --azure-file-account-key "$STORAGE_KEY"   --azure-file-share-name cache --access-mode ReadWrite -o none

echo "==> PostgreSQL Flexible Server $PG en $PG_LOCATION (tarda unos minutos)"
if exists postgres flexible-server show -g "$RG" -n "$PG"; then
  # Ya existe: no conocemos su contraseña, así que se pone la nueva.
  az postgres flexible-server update -g "$RG" -n "$PG" --admin-password "$PG_PASSWORD" -o none
else
  # --public-access 0.0.0.0 abre el firewall solo a servicios de Azure. Para aislarlo del todo, usa una red virtual.
  az postgres flexible-server create -g "$RG" -n "$PG" -l "$PG_LOCATION"     --tier Burstable --sku-name Standard_B1ms --storage-size 32 --version 16     --admin-user "$PG_USER" --admin-password "$PG_PASSWORD" --public-access 0.0.0.0 --yes -o none
fi
exists postgres flexible-server db show -g "$RG" -s "$PG" -d "$PG_DB" ||
  az postgres flexible-server db create -g "$RG" -s "$PG" -d "$PG_DB" -o none
DATABASE_URL="postgresql+psycopg://$PG_USER:$PG_PASSWORD@$PG.postgres.database.azure.com:5432/$PG_DB?sslmode=require"

# Las URLs de Container Apps son <app>.<dominio del entorno>: se conocen antes de crear las apps, así el
# frontend se compila con la URL del API y el API nace con CORS para el frontend.
ENV_DOMAIN=$(az containerapp env show -g "$RG" -n "$ENV_NAME" --query properties.defaultDomain -o tsv)
API_URL="https://$API_APP.$ENV_DOMAIN"
WEB_URL="https://$WEB_APP.$ENV_DOMAIN"
SUB=$(az account show --query id -o tsv)

# Crea o actualiza una Container App con una plantilla JSON (PUT de ARM con api-version estable).
# Se usa en lugar de "az containerapp create --yaml", que con algunas versiones de la extensión falla con 400.
put_app() {  # nombre plantilla
  local body="$HERE/.$1.rendered.json"
  sed -e "s|__LOCATION__|$LOCATION|" -e "s|__ENV_ID__|$ENV_ID|" -e "s|__ACR__|$ACR|g"       -e "s|__ACR_PASSWORD__|$ACR_PASSWORD|" -e "s|__QUICKSTATS_KEY__|$QUICKSTATS_KEY|"       -e "s|__DATABASE_URL__|$DATABASE_URL|" -e "s|__ALLOWED_ORIGINS__|$WEB_URL,http://localhost:3000|"       -e "s|__ASSISTANT_PROVIDER__|$ASSISTANT_PROVIDER|" -e "s|__FOUNDRY_RESOURCE__|$FOUNDRY_RESOURCE|" -e "s|__ASSISTANT_MODEL__|$ASSISTANT_MODEL|"       -e "s|__ASSISTANT_FALLBACK_MODEL__|$ASSISTANT_FALLBACK_MODEL|" -e "s|__ASSISTANT_DAILY_LIMIT__|$ASSISTANT_DAILY_LIMIT|"       -e "s|__TAG__|$TAG|" "$HERE/$2" > "$body"
  command -v cygpath >/dev/null && body=$(cygpath -m "$body")
  az rest --method put -o none     --url "https://management.azure.com/subscriptions/$SUB/resourceGroups/$RG/providers/Microsoft.App/containerApps/$1?api-version=2024-03-01"     --body "@$body"
  rm -f "$HERE/.$1.rendered.json"
  local st=""
  until [[ "$st" == "Succeeded" ]]; do
    sleep 10
    st=$(az containerapp show -g "$RG" -n "$1" --query properties.provisioningState -o tsv)
    if [[ "$st" == "Failed" ]]; then echo "ERROR: la app $1 quedó en estado Failed" >&2; exit 1; fi
  done
}

echo "==> Microsoft Foundry $FOUNDRY (Guía de IA)"
exists cognitiveservices account show -g "$RG" -n "$FOUNDRY" ||
  az cognitiveservices account create -g "$RG" -n "$FOUNDRY" -l "$LOCATION" --kind AIServices --sku S0 --custom-domain "$FOUNDRY" --yes -o none
deploy_claude() {  # despliegue (= nombre del modelo) y versión; no detiene el script si falta cuota
  local url="https://management.azure.com/subscriptions/$(az account show --query id -o tsv)/resourceGroups/$RG/providers/Microsoft.CognitiveServices/accounts/$FOUNDRY/deployments/$1?api-version=2025-10-01-preview"
  exists rest --method get --url "$url" && return 0
  local body="$HERE/.deploy-$1.json"
  printf '{"sku":{"name":"GlobalStandard","capacity":1},"properties":{"model":{"format":"Anthropic","name":"%s","version":"%s"},"modelProviderData":{"industry":"%s","organizationName":"%s","countryCode":"%s"}}}'     "$1" "$2" "$ORG_INDUSTRY" "$ORG_NAME" "$ORG_COUNTRY" > "$body"
  local b="$body"; command -v cygpath >/dev/null && b=$(cygpath -m "$body")
  if az rest --method put --url "$url" --body "@$b" -o none; then echo "    $1 desplegado"; else echo "    AVISO: no se pudo desplegar $1 (¿cuota? ver infra/azure/README.md). La Guía queda desactivada."; fi
  rm -f "$body"
}
if [[ "$ASSISTANT_PROVIDER" == "azure_openai" ]]; then
  exists cognitiveservices account deployment show -g "$RG" -n "$FOUNDRY" --deployment-name "$ASSISTANT_MODEL" ||
    az cognitiveservices account deployment create -g "$RG" -n "$FOUNDRY" --deployment-name "$ASSISTANT_MODEL" \
      --model-name "$ASSISTANT_MODEL" --model-version "$ASSISTANT_MODEL_VERSION" --model-format OpenAI \
      --sku-name GlobalStandard --sku-capacity 100 -o none ||
    echo "    AVISO: no se pudo desplegar $ASSISTANT_MODEL. La Guía queda desactivada."
else
  deploy_claude "$ASSISTANT_MODEL" 2
  [[ -n "$ASSISTANT_FALLBACK_MODEL" ]] && deploy_claude "$ASSISTANT_FALLBACK_MODEL" 2
fi
# La Guía solo se activa si el modelo principal está desplegado (si no, el backend la muestra como no disponible).
DEPLOY_URL="https://management.azure.com/subscriptions/$(az account show --query id -o tsv)/resourceGroups/$RG/providers/Microsoft.CognitiveServices/accounts/$FOUNDRY/deployments/$ASSISTANT_MODEL?api-version=2025-10-01-preview"
if exists rest --method get --url "$DEPLOY_URL"; then FOUNDRY_RESOURCE="$FOUNDRY"; else FOUNDRY_RESOURCE=""; fi
[[ -n "$ASSISTANT_FALLBACK_MODEL" ]] && { exists rest --method get --url "${DEPLOY_URL/$ASSISTANT_MODEL/$ASSISTANT_FALLBACK_MODEL}" || ASSISTANT_FALLBACK_MODEL=""; }

echo "==> Imagen del backend"
build_image orchid-api ./backend

echo "==> Container App del backend ($API_URL)"
put_app "$API_APP" api.json

echo "==> Permiso del backend para usar Foundry (identidad administrada, sin claves)"
API_PRINCIPAL=$(az containerapp show -g "$RG" -n "$API_APP" --query identity.principalId -o tsv)
FOUNDRY_ID=$(az cognitiveservices account show -g "$RG" -n "$FOUNDRY" --query id -o tsv)
if [[ -z "$(az role assignment list --assignee "$API_PRINCIPAL" --scope "$FOUNDRY_ID" --role "Cognitive Services User" --query "[0].id" -o tsv)" ]]; then
  az role assignment create --assignee-object-id "$API_PRINCIPAL" --assignee-principal-type ServicePrincipal     --role "Cognitive Services User" --scope "$FOUNDRY_ID" -o none
fi

echo "==> Imagen del frontend (con la URL del API dentro)"
build_image orchid-web ./frontend "NEXT_PUBLIC_API_URL=$API_URL"

echo "==> Container App del frontend ($WEB_URL)"
put_app "$WEB_APP" web.json

echo "==> Comprobando que el backend responde"
for _ in $(seq 1 18); do
  [[ "$(curl -s -m 30 -o /dev/null -w '%{http_code}' "$API_URL/health")" == 200 ]] && { echo "    $API_URL/health OK"; break; }
  sleep 10
done

cat <<OUT

Listo.
  Frontend: $WEB_URL
  Backend:  $API_URL  (prueba $API_URL/health)
  Base de datos: $PG.postgres.database.azure.com / $PG_DB (usuario $PG_USER)
  Guía de IA: ${FOUNDRY_RESOURCE:+activa con $ASSISTANT_MODEL en $FOUNDRY}${FOUNDRY_RESOURCE:-desactivada (falta desplegar $ASSISTANT_MODEL en $FOUNDRY; ver README)}
  La contraseña de Postgres solo queda en el secreto "database-url" del backend.

Para el despliegue automático con GitHub Actions, crea estas *variables* del repositorio:
  AZURE_RG=$RG  ACR_NAME=$ACR  API_APP=$API_APP  WEB_APP=$WEB_APP
y los secretos AZURE_CLIENT_ID, AZURE_TENANT_ID y AZURE_SUBSCRIPTION_ID de una identidad administrada (ver infra/azure/README.md).
OUT

exit 0
}
