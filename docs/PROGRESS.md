# Progress

Last accepted phase: **Local Nakama and PostgreSQL infrastructure**.

Current phase: none requested. Do not add player authentication, matches, or gameplay until asked.

## Phase 0 acceptance (2026-08-15)

All required directories and documents exist. Internal links among `docs/` and `AGENTS.md` are consistent. The server is documented as the only authority for simulation and rewards. Dependency versions are pinned in [DEPENDENCIES.md](DEPENDENCIES.md). Slice completion is testable via VS-T* and VS-M* in [VERTICAL_SLICE.md](VERTICAL_SLICE.md). No gameplay or networking implementation is present.

## Godot package compatibility spike acceptance (2026-08-15)

Godot 4.7.1 (`4.7.1.stable.official.a13da4feb`) imported `client/` without parser errors. Nakama 3.4.0, GLoot 3.0.2, Dialogue Manager 3.10.5, and GdUnit4 6.2.0 load from unmodified `client/addons/` trees. The compatibility scene printed `COMPATIBILITY_OK` and exited 0 in headless mode. GdUnit4 ran `res://tests/compatibility/compatibility_test.gd` with 4/4 passed. Ledger fields are in [DEPENDENCIES.md](DEPENDENCIES.md) and [THIRD_PARTY.md](THIRD_PARTY.md). No gameplay scenes were added.

Reproduction: `powershell -File scripts/run-client-compatibility.ps1`

## Local Nakama and PostgreSQL infrastructure acceptance (2026-08-15)

`npm ci`, `npm run typecheck`, `npm test` (7/7), and `npm run build` succeeded in `server/`. Docker Compose started PostgreSQL `16.15-alpine` and Nakama `3.40.0`. Nakama reported healthy. The JS runtime loaded `build/index.js` and registered `vibecode_health`. The RPC returned `{"ok":true,"service":"vibecode-server","protocol_version":1,"content_version":"uninitialized"}`. `docker compose down` kept named volume `vibecode_postgres_data`; a subsequent up applied 0 migrations and still had 20 public tables. Destroying that volume is `scripts/backend-volume-destroy.ps1` only. No authentication or match code was added.

Reproduction:

```powershell
Set-Location server
npm ci
npm run typecheck
npm test
npm run build
powershell -File ..\scripts\backend-up.ps1
```
