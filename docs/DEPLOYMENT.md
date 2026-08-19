# Deployment

Safe order for a small private online game. Related: [ENVIRONMENTS.md](ENVIRONMENTS.md), [RECOVERY.md](RECOVERY.md), [MIGRATIONS.md](MIGRATIONS.md).

Do not skip backup. Do not apply a migration without a dry run. Do not remove maintenance until smoke tests pass.

## Commands (pinned tools)

Versions stay in [DEPENDENCIES.md](DEPENDENCIES.md): Godot **4.7.1**, Node **20.20.2** (Docker builder), Nakama **3.40.0**, PostgreSQL **16.15**.

| Step | Command |
| --- | --- |
| Server type check | `powershell -File scripts/server-typecheck.ps1` |
| Server tests | `powershell -File scripts/test-server.ps1` |
| Capacity report | `powershell -File scripts/test-capacity.ps1` |
| Soak (short / 1h) | `powershell -File scripts/test-soak.ps1` / `-DurationSec 3600` |
| Five-client journey | `powershell -File scripts/test-cert-journey.ps1` |
| Server bundle | `powershell -File scripts/server-build.ps1` |
| Content validation | `powershell -File scripts/content-validate.ps1` |
| Content bundle | `powershell -File scripts/content-build.ps1` |
| Godot client tests | `powershell -File scripts/test-client.ps1` |
| Headless client test | `powershell -File scripts/headless-client-test.ps1` |
| Development client build | `powershell -File scripts/export-client-dev.ps1` |
| Release client export | `powershell -File scripts/export-client-release.ps1` |
| Docker image build | `powershell -File scripts/docker-build.ps1` |
| Full verification | `powershell -File scripts/verify-release.ps1` |
| Pre-deploy checks | `powershell -File scripts/deploy-check.ps1` |

Release export writes `client/exports/windows/small-mmorpg.exe` (gitignored). It fails clearly if Godot 4.7.1 **export templates** are missing. The export preset is `client/export_presets.cfg`. Windows Desktop needs `windows_debug_x86_64.exe` and `windows_release_x86_64.exe` under `%APPDATA%/Godot/export_templates/4.7.1.stable/` (Editor → Manage Export Templates, matching 4.7.1).

CI: `.github/workflows/verify.yml` (content, audit/protocol/vendor/bundle, server typecheck+tests, migration fixture dry-run/apply/verify, Godot headless tests).

## Compatibility handshake

After authenticate, the client calls RPC `session_handshake` with `{ clientVersion, protocolVersion, contentHash, contentVersion? }`. Match join metadata also includes `clientVersion`. The server rejects incompatible clients before gameplay:

| Code | Meaning |
| --- | --- |
| `client_too_old` | Below `minClientVersion` |
| `client_too_new` | Above `maxClientVersion` |
| `protocol_mismatch` | `protocolVersion` is not **1** |
| `content_mismatch` | Catalog hash or optional package version differs |
| `unsupported_save_version` | Future or corrupted required save fields |
| `server_maintenance` | Gameplay joins closed (login still allowed so GM/ops can work) |
| `migration_required` | Transaction window blocked |

Fatal codes never enter the world. `server_maintenance` / `migration_required` are recoverable.

## Maintenance

GM allowlist RPC `ops_set_maintenance` (same authority as `gm_command`) writes `ops` / `maintenance` (`permissionWrite: 0`). Env `VIBECODE_MAINTENANCE=1` forces reject-joins on at process load.

- New `find_or_create_*` / cave entry / match joins are rejected while `rejectJoins` is on.
- Already-joined presence and reconnect stay.
- `blockTransactions` returns `migration_required` from the transaction core except admin `TX_REASON_ADMIN_GRANT`.
- When `shutdownAt` is set, the match broadcasts `SYSTEM_MESSAGE` `server_maintenance` during the warning window.
- Authenticated `ops_status` returns environment policy, maintenance, and in-memory counters.

## Safe order

Encoded as `DEPLOY_ORDER` in `server/src/domain/recovery.ts` and printed by `scripts/deploy-check.ps1`:

1. **Backup** — `scripts/backup-create.ps1`
2. **Content validation** — `scripts/content-validate.ps1`
3. **Migration dry run** — `scripts/migrate-dry-run.ps1 --fixture server/tests/fixtures/saves/p18-alice.json` (and live `--all-local` when touching real saves)
4. **Server deployment** — `scripts/server-build.ps1`, recreate Nakama with that bundle (`scripts/backend-up.ps1` locally)
5. **Migration application** — `scripts/migrate-apply.ps1` only after dry-run
6. **Client compatibility update** — ship a client whose `CLIENT_VERSION`, protocol, and `contentHash` match `min`/`max` and the catalog
7. **Smoke test** — `scripts/backend-verify.ps1`, one login, one public-world join
8. **Maintenance removal** — `ops_set_maintenance` `{ "enabled": false, "reason": "deploy complete" }`

Turn maintenance **on** before step 4 when the window is unsafe. Keep `blockTransactions` on across step 5.

## Logging and counters

Structured `ops event=…` lines cover authentication failures, match create/terminate, transfers, cave create/cleanup, rejected actions, inventory/gold/quest/party/trade, and migration results. Passwords, session tokens, device credentials, and full private chat bodies are omitted (`formatOpsLog`).

In-memory counters (also on `vibecode_health` and `ops_status`): connected players, active public matches, active cave matches, transaction failures, rejected actions, transfer failures, reconnects, match-loop errors.
