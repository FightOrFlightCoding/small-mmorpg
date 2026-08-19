# Release checklist

Exact commands for a clean checkout through certification. PowerShell is shown; bash twins live beside each script (`scripts/*.sh`). Related: [DEPLOYMENT.md](DEPLOYMENT.md), [FOUNDATION_READY.md](FOUNDATION_READY.md).

Do not create git tag `foundation-v1` until the working tree is clean and the user has approved the Prompt 35 results.

## Prerequisites

| Tool | Pin |
| --- | --- |
| Godot 4.7.1 stable console | `GODOT_BIN` or `C:\Users\Eszter\Desktop\godot\Godot_v4.7.1-stable_win64_console.exe` |
| Node.js | >= 20.20.0 |
| Docker Desktop + Compose | PostgreSQL 16.15, Nakama 3.40.0 |

Import Godot project **`client/`**, not the repository root.

## Clean checkout

```powershell
powershell -File scripts/setup.ps1
powershell -File scripts/content-validate.ps1
powershell -File scripts/content-build.ps1
powershell -File scripts/server-build.ps1
powershell -File scripts/dev-up.ps1
```

`setup.ps1` installs pinned npm dependencies (`server/`, `tools/content-build/`) and asserts matching content hashes. `dev-up.ps1` builds `server/build/index.js`, starts PostgreSQL and Nakama, and verifies health RPCs. **Nakama applies its own SQL migrations on first Postgres start.** This project does not add custom SQL tables. Player-save migrations run on character load.

```powershell
powershell -File scripts/migrate-status.ps1 --fixture server/tests/fixtures/saves/p18-alice.json
powershell -File scripts/migrate-dry-run.ps1 --fixture server/tests/fixtures/saves/p18-alice.json
powershell -File scripts/migrate-dry-run.ps1 --fixture server/tests/fixtures/saves/p20-v1-alice.json
powershell -File scripts/migrate-dry-run.ps1 --fixture server/tests/fixtures/saves/p21-class-alice.json
powershell -File scripts/migrate-dry-run.ps1 --fixture server/tests/fixtures/saves/current-v1-alice.json
```

## All tests

Combined gate (setup, content, audit, server, client GdUnit, Prompt 18 e2e, capacity, soak, five-client journey including backend restart, backup restore):

```powershell
powershell -File scripts/test-all.ps1
```

Individual commands:

```powershell
powershell -File scripts/test-content.ps1
powershell -File scripts/test-audit.ps1
powershell -File scripts/test-server.ps1
powershell -File scripts/test-client.ps1
powershell -File scripts/test-e2e.ps1
powershell -File scripts/test-capacity.ps1
powershell -File scripts/test-soak.ps1
powershell -File scripts/test-cert-journey.ps1
powershell -File scripts/test-backup.ps1
powershell -File scripts/verify-release.ps1
powershell -File scripts/test-failure.ps1
```

Manual hour soak: `powershell -File scripts/test-soak.ps1 -DurationSec 3600`. Live process-kill drill: `powershell -File scripts/test-failure.ps1 -Live`.

## Launch clients

Backend must already be up (`scripts/dev-up.ps1`).

```powershell
powershell -File scripts/run-client.ps1 -DevUser alice
powershell -File scripts/run-client.ps1 -DevUser bob
powershell -File scripts/run-two-clients.ps1
```

Email/password: register from the login scene. Debug device shortcuts are hidden in release exports.

Manual Prompt 18 loop: WASD, **E** Elder, accept Slime Problem, **Space** slime, **F** gel, turn in, log out and back in. Inventory must keep the Iron Sword and **25** gold.

Headless five-client certification (also inside `test-all`):

```powershell
powershell -File scripts/test-cert-journey.ps1
```

## Release export

Requires Godot **4.7.1** Windows export templates at `%APPDATA%\Godot\export_templates\4.7.1.stable\` (`windows_release_x86_64.exe` and `windows_debug_x86_64.exe`). Without them the command fails clearly and does not produce `client/exports/windows/small-mmorpg.exe`.

```powershell
powershell -File scripts/export-client-release.ps1
powershell -File scripts/docker-build.ps1
```

## Stop / wipe

```powershell
powershell -File scripts/dev-down.ps1
# keeps vibecode_postgres_data
powershell -File scripts/backend-volume-destroy.ps1
# local/automated_test only
```

## Tag (human approval only)

When the tree is clean and Prompt 35 is accepted:

```powershell
git tag foundation-v1
```

Do not run that command as part of the agent certification pass.
