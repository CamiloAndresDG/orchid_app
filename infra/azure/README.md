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

`.github/workflows/deploy-azure.yml` construye las imágenes en el runner de GitHub (Docker) y actualiza las dos apps
en cada push a `main`. Inicia sesión en Azure con una **identidad administrada** y OIDC: sin contraseñas guardadas
y sin necesitar permisos para registrar aplicaciones en Entra ID. Configuración (una vez):

```bash
RG=rg-orchid
az identity create -g $RG -n id-orchid-github
az identity federated-credential create -g $RG --identity-name id-orchid-github --name github-main   --issuer https://token.actions.githubusercontent.com   --subject repo:<usuario>/<repo>:ref:refs/heads/main --audiences api://AzureADTokenExchange
az role assignment create --role Contributor --scope $(az group show -n $RG --query id -o tsv)   --assignee-object-id $(az identity show -g $RG -n id-orchid-github --query principalId -o tsv)   --assignee-principal-type ServicePrincipal
```

En GitHub → Settings → Secrets and variables → Actions:

- **Secrets:** `AZURE_CLIENT_ID` (`az identity show -g $RG -n id-orchid-github --query clientId -o tsv`),
  `AZURE_TENANT_ID` (`az account show --query tenantId -o tsv`), `AZURE_SUBSCRIPTION_ID`.
- **Variables:** `AZURE_RG`, `ACR_NAME`, `API_APP`, `WEB_APP` (los valores que imprimió `setup.sh`).

La credencial solo vale para la rama `main`: un fork o un PR no pueden desplegar.

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
az containerapp revision restart -g rg-orchid -n orchid-api \n  --revision $(az containerapp revision list -g rg-orchid -n orchid-api --query "[0].name" -o tsv)
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

## Guía de IA (Microsoft Foundry)

La Guía responde preguntas del agricultor por texto o voz con un modelo desplegado en **Microsoft Foundry**
(recurso `orchid-ai-…` en `rg-orchid`). Por defecto usa **gpt-5-mini** (Azure OpenAI): las suscripciones nuevas ya
traen cuota para él, cuesta alrededor de medio centavo de dólar por pregunta y no hay que pedir nada. El backend usa su
**identidad administrada** con el rol *Contributor* sobre el recurso para leer la clave del recurso al arrancar
(`FOUNDRY_RESOURCE_ID`); la clave vive solo en memoria, nadie la copia ni se guarda en secretos. Se hace así porque
la condición ABAC del Owner de esta suscripción solo permite asignar *Contributor*. Si algún día se puede asignar
*Cognitive Services User*, basta con quitar `FOUNDRY_RESOURCE_ID` y el backend usa tokens de Entra ID. Solo la
usan usuarios con cuenta, con un límite diario (`ASSISTANT_DAILY_LIMIT`, 30 por defecto).

`setup.sh` crea el recurso, despliega el modelo y da el permiso. La Guía solo se activa si el despliegue existe.

**Usar Claude en lugar de gpt-5-mini** (`ASSISTANT_PROVIDER=foundry bash infra/azure/setup.sh`): el código ya lo
soporta, pero las suscripciones nuevas tienen 0 de cuota para Claude. Hay que pedirla en [ai.azure.com](https://ai.azure.com)
→ recurso → **Management center → Quota** (*Claude Haiku 5.5*, *Sonnet 5.5* u *Opus 5.5*, Global Standard). Además,
desplegar modelos de Anthropic pide datos de la organización (`ORG_NAME`, `ORG_INDUSTRY`, `ORG_COUNTRY`), que se envían
a Anthropic al aceptar sus términos.

Variables del backend: `ASSISTANT_PROVIDER` (`azure_openai`, `foundry` o `anthropic`), `FOUNDRY_RESOURCE`,
`ASSISTANT_MODEL` (nombre del despliegue), `ASSISTANT_FALLBACK_MODEL` (solo Claude) y `ASSISTANT_DAILY_LIMIT`.

**En local:** con `az login`, una cuenta con el rol *Cognitive Services User* sobre el recurso (ser Owner no basta
para llamar al modelo) y `FOUNDRY_RESOURCE=orchid-ai-…`. Si tu cuenta no puede asignarse roles a sí misma (condición
ABAC), prueba directamente en Azure.

## Borrar todo

```bash
az group delete -n rg-orchid
```
