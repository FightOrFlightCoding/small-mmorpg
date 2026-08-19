# Environments

Small-private-game environments. Not enterprise infrastructure. Related: [DEPLOYMENT.md](DEPLOYMENT.md), [RECOVERY.md](RECOVERY.md), [SECURITY_MODEL.md](SECURITY_MODEL.md).

Nakama’s JavaScript runtime cannot read disk. Policy is compiled TypeScript presets in `server/src/domain/environment.ts` plus `ctx.env` overlays. Committed JSON under `infra/environments/` must match those presets (enforced by `server/tests/environment.test.ts`). Secrets live only in gitignored env files.

| Name | Database | Volume | Secrets file | Log | Dev tools | Device auth | Registration | Data reset |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `local` | `nakama` | `vibecode_postgres_data` | `infra/.env.local` | DEBUG | on | on | open | allowed |
| `automated_test` | `nakama_test` | `vibecode_test_postgres_data` | `infra/.env.automated_test` | INFO | on | on | open | allowed |
| `staging` | `nakama_staging` | `vibecode_staging_postgres_data` | `infra/.env.staging` | INFO | off | off | open | forbidden |
| `production` | `nakama_production` | `vibecode_production_postgres_data` | `infra/.env.production` | WARN | off | off | **closed** | forbidden |

Each environment also has its own `contentVersion`, `serverVersion`, `minClientVersion`, and `maxClientVersion` (currently `1.0.0`). Overlay them at runtime without rebuilding:

`VIBECODE_ENV`, `VIBECODE_SERVER_VERSION`, `VIBECODE_MIN_CLIENT_VERSION`, `VIBECODE_MAX_CLIENT_VERSION`, `VIBECODE_CONTENT_VERSION`, `VIBECODE_LOG_LEVEL`, `VIBECODE_REGISTRATION`, `VIBECODE_DEV_TOOLS`, `VIBECODE_DEVICE_AUTH`, `VIBECODE_DATA_RESET`, `VIBECODE_MAINTENANCE`, plus optional `VIBECODE_DATABASE_*`.

Local Compose (`infra/docker-compose.yml` + `infra/nakama/local.yml`) sets the local preset and also starts Mailpit plus the auth gateway (`http://127.0.0.1:8787`, Mailpit UI `http://127.0.0.1:8025`). The isolated test stack is `infra/docker-compose.automated-test.yml` (Nakama on host ports 7450/7451, gateway 8788, Mailpit UI 8125). Staging and production Compose files are **examples** (`infra/docker-compose.staging.example.yml`, `infra/docker-compose.production.example.yml`). Copy them on the host and fill gitignored `infra/.env.staging` / `infra/.env.production` from the committed `infra/.env.*.example` templates. Staging/production gateway processes require HTTPS public URLs and production email/HMAC secrets.

No production secret may be committed. `tools/foundation-audit` fails if `infra/.env`, `infra/.env.local`, `infra/.env.automated_test`, `infra/.env.staging`, or `infra/.env.production` is tracked.

`scripts/backend-volume-destroy` and local restore refuse `staging` and `production`, and they refuse any environment whose `dataReset` is `forbidden`.
