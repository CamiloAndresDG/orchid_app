# Despliegue en Azure

```
Navegador ──> orchid-web (Container App, Next.js)
        └───> orchid-api (Container App, FastAPI) ──> APIs de NASA, USDA, Censo
                     ├── /app/cache  (Azure Files)
                     └── PostgreSQL Flexible Server: cuentas, sesiones y terrenos
Imágenes: Azure Container Registry · Logs: Log Analytics
```

## 1. Primer despliegue

Requisitos: [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) y Git Bash (o WSL, Linux, macOS).

```bash
az login
az account set --subscription "<tu suscripción>"
QUICKSTATS_KEY=<clave opcional del USDA> bash infra/azure/setup.sh
```

El script crea el grupo de recursos, el registro de contenedores, el entorno de Container Apps, el almacenamiento
de la caché, el servidor PostgreSQL con la base `orchid`, construye las dos imágenes, las despliega y configura CORS.

- **Docker:** si Docker Desktop está abierto, las imágenes se construyen en tu equipo y se suben al registro. Sin
  Docker se usa `az acr build` (ACR Tasks), que algunas suscripciones nuevas o de prueba no permiten.
- **Región de PostgreSQL:** por defecto `centralus` (`PG_LOCATION`), porque varias regiones como `eastus2` no
  permiten Flexible Server en suscripciones nuevas. El resto queda en `LOCATION` (`eastus2`).
- **Se puede volver a correr:** cada paso revisa si el recurso existe. Ojo: si Postgres ya existe, le pone una
  contraseña nueva y actualiza el secreto del backend.
Al final imprime las URLs.

Variables que puedes cambiar: `RG`, `LOCATION`, `ACR`, `STORAGE`, `ENV_NAME`, `API_APP`, `WEB_APP`, `PG`, `PG_USER`,
`PG_DB`, `PG_PASSWORD`. El script es para el primer despliegue; los siguientes los hace GitHub Actions.

## 2. Despliegue automático (GitHub Actions)

`.github/workflows/deploy-azure.yml` vuelve a construir y desplegar en cada push a `main`. Configúralo una vez:

```bash
SUB=$(az account show --query id -o tsv)
RG=rg-orchid
APP_ID=$(az ad app create --display-name orchid-github --query appId -o tsv)
az ad sp create --id $APP_ID
az role assignment create --assignee $APP_ID --role Contributor --scope /subscriptions/$SUB/resourceGroups/$RG
az ad app federated-credential create --id $APP_ID --parameters '{
  "name": "github-main",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:<usuario>/<repo>:ref:refs/heads/main",
  "audiences": ["api://AzureADTokenExchange"]
}'
```

En GitHub → Settings → Secrets and variables → Actions:

- **Secrets:** `AZURE_CLIENT_ID` (= `$APP_ID`), `AZURE_TENANT_ID` (`az account show --query tenantId -o tsv`), `AZURE_SUBSCRIPTION_ID`.
- **Variables:** `AZURE_RG`, `ACR_NAME`, `API_APP`, `WEB_APP` (los valores que imprimió `setup.sh`).

## Variables de entorno del backend

| Variable | Para qué | Por defecto |
|---|---|---|
| `ALLOWED_ORIGINS` | Orígenes permitidos por CORS, separados por coma | `http://localhost:3000` |
| `CACHE_DIR` | Carpeta de caché | `backend/cache` |
| `QUICKSTATS_KEY` | Clave del USDA del servidor; si existe, el usuario no necesita la suya | vacía |
| `DATABASE_URL` | `postgresql+psycopg://usuario:clave@servidor:5432/orchid?sslmode=require` | SQLite en `backend/instance/` |
| `SESSION_DAYS` | Días que dura una sesión iniciada | `30` |

El frontend solo usa `NEXT_PUBLIC_API_URL`, que se fija **al construir** la imagen (`--build-arg`).

Cambiar la clave de QuickStats después:

```bash
az containerapp secret set -g rg-orchid -n orchid-api --secrets quickstats-key=<clave>
az containerapp revision restart -g rg-orchid -n orchid-api \
  --revision $(az containerapp revision list -g rg-orchid -n orchid-api --query "[0].name" -o tsv)
```

## Base de datos

Tablas (las crea el backend al arrancar si no existen):

| Tabla | Contenido |
|---|---|
| `users` | Nombre, correo y hash scrypt de la contraseña |
| `sessions` | SHA-256 del token de cada sesión iniciada y su vencimiento |
| `plots` | Terreno de cada usuario: nombre, acres, riego, punto, historial de cultivos (JSONB) y precios (JSONB) |

Endpoints: `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `GET /me/notebook`,
`PUT /me/notebook` y `DELETE /me` (borra la cuenta y sus datos). El modo visitante no usa la base: guarda todo en el
navegador. Si después crea una cuenta, su terreno se sube a ella.

Sin `DATABASE_URL`, el backend usa SQLite en `backend/instance/orchid.db`, así que en local no hace falta instalar Postgres.

Flexible Server hace copias de seguridad automáticas (7 días por defecto). Para consultar la base desde tu equipo:

```bash
az postgres flexible-server firewall-rule create -g rg-orchid -n <servidor> -r mi-ip --start-ip-address <tu IP> --end-ip-address <tu IP>
psql "host=<servidor>.postgres.database.azure.com dbname=orchid user=fsadmin sslmode=require"
```

Cambiar la contraseña de Postgres:

```bash
az postgres flexible-server update -g rg-orchid -n <servidor> --admin-password <nueva>
az containerapp secret set -g rg-orchid -n orchid-api   --secrets "database-url=postgresql+psycopg://fsadmin:<nueva>@<servidor>.postgres.database.azure.com:5432/orchid?sslmode=require"
```

Luego reinicia la revisión del backend, igual que con la clave de QuickStats.

Pendiente para producción: migraciones con Alembic en lugar de `create_all`, límite de intentos de inicio de sesión,
recuperación de contraseña por correo y, si se quiere inicio de sesión con Microsoft o Google, Microsoft Entra External ID.

## Borrar todo

```bash
az group delete -n rg-orchid
```
