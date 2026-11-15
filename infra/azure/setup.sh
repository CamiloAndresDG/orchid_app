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
API_APP=${API_APP:-orchid-api}
WEB_APP=${WEB_APP:-orchid-web}
TAG=${TAG:-$(git rev-parse --short HEAD)}
# Container Apps no acepta secretos vacíos: "-" significa "sin clave del servidor".
QUICKSTATS_KEY=${QUICKSTATS_KEY:--}
HERE=$(cd "$(dirname "$0")" && pwd)

echo "==> Grupo de recursos $RG ($LOCATION)"
az extension add --name containerapp --upgrade --only-show-errors
for ns in Microsoft.App Microsoft.OperationalInsights Microsoft.ContainerRegistry Microsoft.Storage Microsoft.DBforPostgreSQL; do
  az provider register -n "$ns" --wait
done
az group create -n "$RG" -l "$LOCATION" -o none

# Cada paso revisa si el recurso ya existe: el script se puede volver a correr sin romper nada.
exists() { az "$@" -o none >/dev/null 2>&1; }

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

echo "==> Imagen del backend"
az acr build -r "$ACR" -t "orchid-api:$TAG" ./backend -o none

echo "==> Container App del backend"
TMP=$(mktemp)
sed -e "s|__LOCATION__|$LOCATION|" -e "s|__ENV_ID__|$ENV_ID|" -e "s|__ACR__|$ACR|g"     -e "s|__ACR_PASSWORD__|$ACR_PASSWORD|" -e "s|__QUICKSTATS_KEY__|$QUICKSTATS_KEY|"     -e "s|__DATABASE_URL__|$DATABASE_URL|" -e "s|__TAG__|$TAG|" "$HERE/api.yaml" > "$TMP"
if exists containerapp show -g "$RG" -n "$API_APP"; then
  az containerapp update -g "$RG" -n "$API_APP" --yaml "$TMP" -o none
else
  az containerapp create -g "$RG" -n "$API_APP" --yaml "$TMP" -o none
fi
rm -f "$TMP"
API_URL="https://$(az containerapp show -g "$RG" -n "$API_APP" --query properties.configuration.ingress.fqdn -o tsv)"
echo "    API: $API_URL"

echo "==> Imagen del frontend (con la URL del API dentro)"
az acr build -r "$ACR" -t "orchid-web:$TAG" --build-arg "NEXT_PUBLIC_API_URL=$API_URL" ./frontend -o none

echo "==> Container App del frontend"
if exists containerapp show -g "$RG" -n "$WEB_APP"; then
  az containerapp update -g "$RG" -n "$WEB_APP" --image "$ACR.azurecr.io/orchid-web:$TAG" -o none
else
  az containerapp create -g "$RG" -n "$WEB_APP" --environment "$ENV_NAME"     --image "$ACR.azurecr.io/orchid-web:$TAG"     --registry-server "$ACR.azurecr.io" --registry-username "$ACR" --registry-password "$ACR_PASSWORD"     --ingress external --target-port 3000 --cpu 0.5 --memory 1Gi     --min-replicas 0 --max-replicas 2 -o none
fi
WEB_URL="https://$(az containerapp show -g "$RG" -n "$WEB_APP" --query properties.configuration.ingress.fqdn -o tsv)"

echo "==> CORS: el backend acepta llamadas del frontend"
az containerapp update -g "$RG" -n "$API_APP" --set-env-vars "ALLOWED_ORIGINS=$WEB_URL,http://localhost:3000" -o none

cat <<OUT

Listo.
  Frontend: $WEB_URL
  Backend:  $API_URL  (prueba $API_URL/health)
  Base de datos: $PG.postgres.database.azure.com / $PG_DB (usuario $PG_USER)
  La contraseña de Postgres solo queda en el secreto "database-url" del backend.

Para el despliegue automático con GitHub Actions, crea estas *variables* del repositorio:
  AZURE_RG=$RG  ACR_NAME=$ACR  API_APP=$API_APP  WEB_APP=$WEB_APP
y los secretos AZURE_CLIENT_ID, AZURE_TENANT_ID y AZURE_SUBSCRIPTION_ID (ver infra/azure/README.md).
OUT

exit 0
}
