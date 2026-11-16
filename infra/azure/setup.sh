#!/usr/bin/env bash
# Creates everything on Azure and does ORCHID's first deployment.
# Usage (from the repo root, with Azure CLI and `az login` done):
#   QUICKSTATS_KEY=your_key bash infra/azure/setup.sh
# Everything can be changed with environment variables (RG, LOCATION, ACR, STORAGE...).
set -euo pipefail

# Everything goes inside { ... } so bash reads the whole script before running it: on Windows child
# processes (az) can move the file's read position and bash would read garbage.
{

# Windows (Git Bash) with Azure CLI installed via pip: that "az" relaunches itself with os.execl and returns control
# before it finishes, so $(az ...) comes back empty. Its Python is called directly.
if [[ "${OSTYPE:-}" == msys* || "${OSTYPE:-}" == cygwin* ]]; then
  AZ_PY=$(head -1 "$(command -v az)" | sed -n 's/^#!//p' | tr -d '\r\n')
  if [[ -n "$AZ_PY" && "$AZ_PY" == *python* && -x "$(cygpath -u "$AZ_PY")" ]]; then
    AZ_PY=$(cygpath -u "$AZ_PY")
    az() { "$AZ_PY" -m azure.cli "$@"; }
  fi
fi

# Stable suffix derived from the subscription, so global names don't collide.
SUFFIX=$(az account show --query id -o tsv | tr -d '-' | cut -c1-6)
RG=${RG:-rg-orchid}
LOCATION=${LOCATION:-eastus2}
ACR=${ACR:-acrorchid$SUFFIX}
STORAGE=${STORAGE:-storchid$SUFFIX}
ENV_NAME=${ENV_NAME:-env-orchid}
PG=${PG:-pg-orchid$SUFFIX}
# Some subscriptions don't allow PostgreSQL Flexible Server in every region (e.g. eastus2).
PG_LOCATION=${PG_LOCATION:-centralus}
PG_USER=${PG_USER:-fsadmin}
PG_DB=${PG_DB:-orchid}
# Letters and digits only (no URL escaping needed); "Fs1" guarantees an uppercase, a lowercase and a digit.
PG_PASSWORD=${PG_PASSWORD:-Fs1$(openssl rand -hex 16)}
# AI Guide on Microsoft Foundry. Defaults to gpt-5-mini (Azure OpenAI, with quota on new subscriptions).
# With ASSISTANT_PROVIDER=foundry it uses Claude: deploying Anthropic models asks for organization details (sent
# to Anthropic when accepting its terms on Azure Marketplace) and Claude quota, which must be requested.
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
# Server keys. If not passed and already set on Azure, they're kept (never shown).
# Container Apps doesn't accept empty secrets: "-" means "no key".
_keep() {
  local v
  v=$(az containerapp secret show -g "$RG" -n "$API_APP" --secret-name "$1" --query value -o tsv 2>/dev/null) || true
  if [[ -n "$v" ]]; then printf '%s' "$v"; else printf '%s' "-"; fi
}
QUICKSTATS_KEY=${QUICKSTATS_KEY:-$(_keep quickstats-key)}
# NASA Earthdata token (SMAP, IMERG, NLDAS and SRTM); expires after 60 days.
EARTHDATA_TOKEN=${EARTHDATA_TOKEN:-$(_keep earthdata-token)}
HERE=$(cd "$(dirname "$0")" && pwd)

echo "==> Resource group $RG ($LOCATION)"
az extension add --name containerapp --upgrade --only-show-errors
for ns in Microsoft.App Microsoft.OperationalInsights Microsoft.ContainerRegistry Microsoft.Storage Microsoft.DBforPostgreSQL Microsoft.CognitiveServices; do
  az provider register -n "$ns" --wait
done
az group create -n "$RG" -l "$LOCATION" -o none

# Each step checks whether the resource already exists: the script can be re-run without breaking anything.
exists() { az "$@" -o none >/dev/null 2>&1; }

# Builds and pushes an image. With Docker available it builds on this machine; otherwise with ACR Tasks
# (az acr build), which some new or trial subscriptions don't allow.
build_image() {  # name folder [build-arg]
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

echo "==> Container Apps environment $ENV_NAME"
exists containerapp env show -g "$RG" -n "$ENV_NAME" || az containerapp env create -g "$RG" -n "$ENV_NAME" -l "$LOCATION" -o none
until [[ "$(az containerapp env show -g "$RG" -n "$ENV_NAME" --query properties.provisioningState -o tsv)" == "Succeeded" ]]; do
  echo "    waiting for the environment to finish creating..."; sleep 15
done
ENV_ID=$(az containerapp env show -g "$RG" -n "$ENV_NAME" --query id -o tsv)

echo "==> Azure Files for the backend cache"
exists storage account show -g "$RG" -n "$STORAGE" ||
  az storage account create -g "$RG" -n "$STORAGE" -l "$LOCATION" --sku Standard_LRS --kind StorageV2 -o none
exists storage share-rm show -g "$RG" --storage-account "$STORAGE" -n cache ||
  az storage share-rm create -g "$RG" --storage-account "$STORAGE" -n cache --quota 5 -o none
STORAGE_KEY=$(az storage account keys list -g "$RG" -n "$STORAGE" --query "[0].value" -o tsv)
az containerapp env storage set -g "$RG" -n "$ENV_NAME" --storage-name cache   --azure-file-account-name "$STORAGE" --azure-file-account-key "$STORAGE_KEY"   --azure-file-share-name cache --access-mode ReadWrite -o none

echo "==> PostgreSQL Flexible Server $PG in $PG_LOCATION (takes a few minutes)"
if exists postgres flexible-server show -g "$RG" -n "$PG"; then
  # Already exists: we don't know its password, so the new one is set.
  az postgres flexible-server update -g "$RG" -n "$PG" --admin-password "$PG_PASSWORD" -o none
else
  # --public-access 0.0.0.0 opens the firewall only to Azure services. To isolate it fully, use a virtual network.
  az postgres flexible-server create -g "$RG" -n "$PG" -l "$PG_LOCATION"     --tier Burstable --sku-name Standard_B1ms --storage-size 32 --version 16     --admin-user "$PG_USER" --admin-password "$PG_PASSWORD" --public-access 0.0.0.0 --yes -o none
fi
exists postgres flexible-server db show -g "$RG" -s "$PG" -d "$PG_DB" ||
  az postgres flexible-server db create -g "$RG" -s "$PG" -d "$PG_DB" -o none
DATABASE_URL="postgresql+psycopg://$PG_USER:$PG_PASSWORD@$PG.postgres.database.azure.com:5432/$PG_DB?sslmode=require"

# Container Apps URLs are <app>.<environment domain>: they're known before creating the apps, so the
# frontend is built with the API URL and the API starts with CORS for the frontend.
ENV_DOMAIN=$(az containerapp env show -g "$RG" -n "$ENV_NAME" --query properties.defaultDomain -o tsv)
API_URL="https://$API_APP.$ENV_DOMAIN"
WEB_URL="https://$WEB_APP.$ENV_DOMAIN"
SUB=$(az account show --query id -o tsv)

# Creates or updates a Container App from a JSON template (ARM PUT with a stable api-version).
# Used instead of "az containerapp create --yaml", which fails with 400 on some versions of the extension.
put_app() {  # name template
  local body="$HERE/.$1.rendered.json"
  sed -e "s|__LOCATION__|$LOCATION|" -e "s|__ENV_ID__|$ENV_ID|" -e "s|__ACR__|$ACR|g"       -e "s|__ACR_PASSWORD__|$ACR_PASSWORD|" -e "s|__QUICKSTATS_KEY__|$QUICKSTATS_KEY|" -e "s|__EARTHDATA_TOKEN__|$EARTHDATA_TOKEN|"       -e "s|__DATABASE_URL__|$DATABASE_URL|" -e "s|__ALLOWED_ORIGINS__|$WEB_URL,http://localhost:3000|"       -e "s|__ASSISTANT_PROVIDER__|$ASSISTANT_PROVIDER|" -e "s|__FOUNDRY_RESOURCE__|$FOUNDRY_RESOURCE|" -e "s|__FOUNDRY_RESOURCE_ID__|${FOUNDRY_RESOURCE:+$FOUNDRY_ID}|" -e "s|__ASSISTANT_MODEL__|$ASSISTANT_MODEL|"       -e "s|__ASSISTANT_FALLBACK_MODEL__|$ASSISTANT_FALLBACK_MODEL|" -e "s|__ASSISTANT_DAILY_LIMIT__|$ASSISTANT_DAILY_LIMIT|"       -e "s|__TAG__|$TAG|" "$HERE/$2" > "$body"
  command -v cygpath >/dev/null && body=$(cygpath -m "$body")
  az rest --method put -o none     --url "https://management.azure.com/subscriptions/$SUB/resourceGroups/$RG/providers/Microsoft.App/containerApps/$1?api-version=2024-03-01"     --body "@$body"
  rm -f "$HERE/.$1.rendered.json"
  local st=""
  until [[ "$st" == "Succeeded" ]]; do
    sleep 10
    st=$(az containerapp show -g "$RG" -n "$1" --query properties.provisioningState -o tsv)
    if [[ "$st" == "Failed" ]]; then echo "ERROR: app $1 ended up in Failed state" >&2; exit 1; fi
  done
}

echo "==> Microsoft Foundry $FOUNDRY (AI Guide)"
exists cognitiveservices account show -g "$RG" -n "$FOUNDRY" ||
  az cognitiveservices account create -g "$RG" -n "$FOUNDRY" -l "$LOCATION" --kind AIServices --sku S0 --custom-domain "$FOUNDRY" --yes -o none
deploy_claude() {  # deployment (= model name) and version; doesn't stop the script if quota is missing
  local url="https://management.azure.com/subscriptions/$(az account show --query id -o tsv)/resourceGroups/$RG/providers/Microsoft.CognitiveServices/accounts/$FOUNDRY/deployments/$1?api-version=2025-10-01-preview"
  exists rest --method get --url "$url" && return 0
  local body="$HERE/.deploy-$1.json"
  printf '{"sku":{"name":"GlobalStandard","capacity":1},"properties":{"model":{"format":"Anthropic","name":"%s","version":"%s"},"modelProviderData":{"industry":"%s","organizationName":"%s","countryCode":"%s"}}}'     "$1" "$2" "$ORG_INDUSTRY" "$ORG_NAME" "$ORG_COUNTRY" > "$body"
  local b="$body"; command -v cygpath >/dev/null && b=$(cygpath -m "$body")
  if az rest --method put --url "$url" --body "@$b" -o none; then echo "    $1 deployed"; else echo "    WARNING: couldn't deploy $1 (quota? see infra/azure/README.md). The Guide stays disabled."; fi
  rm -f "$body"
}
if [[ "$ASSISTANT_PROVIDER" == "azure_openai" ]]; then
  exists cognitiveservices account deployment show -g "$RG" -n "$FOUNDRY" --deployment-name "$ASSISTANT_MODEL" ||
    az cognitiveservices account deployment create -g "$RG" -n "$FOUNDRY" --deployment-name "$ASSISTANT_MODEL" \
      --model-name "$ASSISTANT_MODEL" --model-version "$ASSISTANT_MODEL_VERSION" --model-format OpenAI \
      --sku-name GlobalStandard --sku-capacity 100 -o none ||
    echo "    WARNING: couldn't deploy $ASSISTANT_MODEL. The Guide stays disabled."
else
  deploy_claude "$ASSISTANT_MODEL" 2
  [[ -n "$ASSISTANT_FALLBACK_MODEL" ]] && deploy_claude "$ASSISTANT_FALLBACK_MODEL" 2
fi
# The Guide is only enabled if the main model is deployed (otherwise the backend shows it as unavailable).
DEPLOY_URL="https://management.azure.com/subscriptions/$(az account show --query id -o tsv)/resourceGroups/$RG/providers/Microsoft.CognitiveServices/accounts/$FOUNDRY/deployments/$ASSISTANT_MODEL?api-version=2025-10-01-preview"
if exists rest --method get --url "$DEPLOY_URL"; then FOUNDRY_RESOURCE="$FOUNDRY"; else FOUNDRY_RESOURCE=""; fi
FOUNDRY_ID=$(az cognitiveservices account show -g "$RG" -n "$FOUNDRY" --query id -o tsv)
[[ -n "$ASSISTANT_FALLBACK_MODEL" ]] && { exists rest --method get --url "${DEPLOY_URL/$ASSISTANT_MODEL/$ASSISTANT_FALLBACK_MODEL}" || ASSISTANT_FALLBACK_MODEL=""; }

echo "==> Backend image"
build_image orchid-api ./backend

echo "==> Backend Container App ($API_URL)"
put_app "$API_APP" api.json

echo "==> Backend permission on Foundry (managed identity)"
# Contributor on the resource: the backend reads the key with its identity and keeps it only in memory. This role is used
# because some subscriptions (Owner ABAC condition) only allow assigning Contributor.
API_PRINCIPAL=$(az containerapp show -g "$RG" -n "$API_APP" --query identity.principalId -o tsv)
if [[ -z "$(az role assignment list --assignee-object-id "$API_PRINCIPAL" --scope "$FOUNDRY_ID" --role Contributor --query "[0].id" -o tsv)" ]]; then
  az role assignment create --assignee-object-id "$API_PRINCIPAL" --assignee-principal-type ServicePrincipal --role Contributor --scope "$FOUNDRY_ID" -o none
fi

echo "==> Frontend image (with the API URL baked in)"
build_image orchid-web ./frontend "NEXT_PUBLIC_API_URL=$API_URL"

echo "==> Frontend Container App ($WEB_URL)"
put_app "$WEB_APP" web.json

echo "==> Checking that the backend responds"
for _ in $(seq 1 18); do
  [[ "$(curl -s -m 30 -o /dev/null -w '%{http_code}' "$API_URL/health")" == 200 ]] && { echo "    $API_URL/health OK"; break; }
  sleep 10
done

cat <<OUT

Done.
  Frontend: $WEB_URL
  Backend:  $API_URL  (try $API_URL/health)
  Database: $PG.postgres.database.azure.com / $PG_DB (user $PG_USER)
  AI Guide: ${FOUNDRY_RESOURCE:+enabled with $ASSISTANT_MODEL on $FOUNDRY}${FOUNDRY_RESOURCE:-disabled ($ASSISTANT_MODEL still needs to be deployed on $FOUNDRY; see README)}
  The Postgres password only lives in the backend's "database-url" secret.

For automatic deployment with GitHub Actions, create these repository *variables*:
  AZURE_RG=$RG  ACR_NAME=$ACR  API_APP=$API_APP  WEB_APP=$WEB_APP
and the AZURE_CLIENT_ID, AZURE_TENANT_ID and AZURE_SUBSCRIPTION_ID secrets of a managed identity (see infra/azure/README.md).
OUT

exit 0
}
