#!/usr/bin/env bash
# Crea todo en Azure y hace el primer despliegue de Field Shift.
# Uso (desde la raíz del repo, con Azure CLI y `az login` hecho):
#   QUICKSTATS_KEY=tu_clave bash infra/azure/setup.sh
# Todo se puede cambiar con variables de entorno (RG, LOCATION, ACR, STORAGE...).
set -euo pipefail

# Sufijo estable sacado de la suscripción, para que los nombres globales no choquen.
SUFFIX=$(az account show --query id -o tsv | tr -d '-' | cut -c1-6)
RG=${RG:-rg-fieldshift}
LOCATION=${LOCATION:-eastus2}
ACR=${ACR:-acrfieldshift$SUFFIX}
STORAGE=${STORAGE:-stfieldshift$SUFFIX}
ENV_NAME=${ENV_NAME:-env-fieldshift}
PG=${PG:-pg-fieldshift$SUFFIX}
PG_USER=${PG_USER:-fsadmin}
PG_DB=${PG_DB:-fieldshift}
# Solo letras y números (no hay que escaparla en la URL); "Fs1" asegura mayúscula, minúscula y dígito.
PG_PASSWORD=${PG_PASSWORD:-Fs1$(openssl rand -hex 16)}
API_APP=${API_APP:-fieldshift-api}
WEB_APP=${WEB_APP:-fieldshift-web}
TAG=${TAG:-$(git rev-parse --short HEAD)}
# Container Apps no acepta secretos vacíos: "-" significa "sin clave del servidor".
QUICKSTATS_KEY=${QUICKSTATS_KEY:--}
HERE=$(cd "$(dirname "$0")" && pwd)

echo "==> Grupo de recursos $RG ($LOCATION)"
az extension add --name containerapp --upgrade --only-show-errors
az provider register -n Microsoft.App --wait
az provider register -n Microsoft.OperationalInsights --wait
az group create -n "$RG" -l "$LOCATION" -o none

echo "==> Container Registry $ACR"
az acr create -g "$RG" -n "$ACR" --sku Basic --admin-enabled true -o none
ACR_PASSWORD=$(az acr credential show -n "$ACR" --query "passwords[0].value" -o tsv)

echo "==> Entorno de Container Apps $ENV_NAME"
az containerapp env create -g "$RG" -n "$ENV_NAME" -l "$LOCATION" -o none
ENV_ID=$(az containerapp env show -g "$RG" -n "$ENV_NAME" --query id -o tsv)

echo "==> Azure Files para la caché del backend"
az storage account create -g "$RG" -n "$STORAGE" -l "$LOCATION" --sku Standard_LRS --kind StorageV2 -o none
az storage share-rm create -g "$RG" --storage-account "$STORAGE" -n cache --quota 5 -o none
STORAGE_KEY=$(az storage account keys list -g "$RG" -n "$STORAGE" --query "[0].value" -o tsv)
az containerapp env storage set -g "$RG" -n "$ENV_NAME" --storage-name cache \
  --azure-file-account-name "$STORAGE" --azure-file-account-key "$STORAGE_KEY" \
  --azure-file-share-name cache --access-mode ReadWrite -o none

echo "==> PostgreSQL Flexible Server $PG (tarda unos minutos)"
# --public-access 0.0.0.0 abre el firewall solo a servicios de Azure. Para aislarlo del todo, usa una red virtual.
az postgres flexible-server create -g "$RG" -n "$PG" -l "$LOCATION"   --tier Burstable --sku-name Standard_B1ms --storage-size 32 --version 16   --admin-user "$PG_USER" --admin-password "$PG_PASSWORD" --public-access 0.0.0.0 --yes -o none
az postgres flexible-server db create -g "$RG" -s "$PG" -d "$PG_DB" -o none
DATABASE_URL="postgresql+psycopg://$PG_USER:$PG_PASSWORD@$PG.postgres.database.azure.com:5432/$PG_DB?sslmode=require"

echo "==> Imagen del backend"
az acr build -r "$ACR" -t "fieldshift-api:$TAG" ./backend -o none

echo "==> Container App del backend"
TMP=$(mktemp)
sed -e "s|__LOCATION__|$LOCATION|" -e "s|__ENV_ID__|$ENV_ID|" -e "s|__ACR__|$ACR|g" \
    -e "s|__ACR_PASSWORD__|$ACR_PASSWORD|" -e "s|__QUICKSTATS_KEY__|$QUICKSTATS_KEY|" \
    -e "s|__DATABASE_URL__|$DATABASE_URL|" -e "s|__TAG__|$TAG|" "$HERE/api.yaml" > "$TMP"
az containerapp create -g "$RG" -n "$API_APP" --yaml "$TMP" -o none
rm -f "$TMP"
API_URL="https://$(az containerapp show -g "$RG" -n "$API_APP" --query properties.configuration.ingress.fqdn -o tsv)"
echo "    API: $API_URL"

echo "==> Imagen del frontend (con la URL del API dentro)"
az acr build -r "$ACR" -t "fieldshift-web:$TAG" --build-arg "NEXT_PUBLIC_API_URL=$API_URL" ./frontend -o none

echo "==> Container App del frontend"
az containerapp create -g "$RG" -n "$WEB_APP" --environment "$ENV_NAME" \
  --image "$ACR.azurecr.io/fieldshift-web:$TAG" \
  --registry-server "$ACR.azurecr.io" --registry-username "$ACR" --registry-password "$ACR_PASSWORD" \
  --ingress external --target-port 3000 --cpu 0.5 --memory 1Gi \
  --min-replicas 0 --max-replicas 2 -o none
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
