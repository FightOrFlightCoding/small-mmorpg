# Foundation baseline (Prompt 18 freeze)

Snapshot of the accepted Prompt 18 implementation. Do not treat this file as permission to change those values.

Related: [DEPENDENCIES.md](DEPENDENCIES.md), [NETWORK_PROTOCOL.md](NETWORK_PROTOCOL.md), [CONTENT_MODEL.md](CONTENT_MODEL.md), [FOUNDATION_SCOPE.md](FOUNDATION_SCOPE.md).

## Dependency versions

Locked. See [DEPENDENCIES.md](DEPENDENCIES.md) and [THIRD_PARTY.md](THIRD_PARTY.md).

| Component | Version |
| --- | --- |
| Godot | 4.7.1 stable (`4.7.1.stable.official.a13da4feb`) |
| GDScript | Godot 4.7.1 |
| Nakama | 3.40.0 (`heroiclabs/nakama:3.40.0`) |
| nakama-runtime | 1.47.0 (`nakama-common#v1.47.0`) |
| Nakama Godot SDK | 3.4.0 |
| PostgreSQL | 16.15 (`postgres:16.15-alpine`) |
| GLoot | 3.0.2 |
| Dialogue Manager | 3.10.5 |
| GdUnit4 | 6.2.0 |
| TypeScript | 5.8.3 (exact in `package.json`) |
| Ajv | 8.17.1 (exact) |
| Node builder | 20.20.2 |
| Kenney RPG Base | 1.0 CC0 |

Build-tool packages in `server/package.json` (Babel, Rollup plugins, `@types/node`, `tslib`) use caret ranges and are pinned by `package-lock.json`. That is recorded, not upgraded.

## Protocol and content

| Item | Value |
| --- | --- |
| Protocol version | `1` |
| Content envelope `schemaVersion` | `1` |
| Content hash | SHA-256 of canonical gameplay JSON (not including `schemaVersion`) |
| Frozen Prompt 18 digest | `3db1de356fc85fb6eb96489ddc04f47049b906ef915d2baa241cae38159a6e85` |
| Client bundle | `client/content/bundle.json` |
| Server catalog | `server/src/generated/content.ts` (Rollup-embedded) |
| Hash mismatch | Hard rejection; fatal client compatibility error |

## Storage schema versions

Prompt 18 canonical records **do not** store a gameplay `schemaVersion` field. Nakama object `version` is used for OCC retries. Character bootstrap returns that OCC string as `storageVersion`. Foundation persistence rules require a schema version on every canonical record; adding it is a later migration, not this freeze. See [STORAGE_CATALOG.md](STORAGE_CATALOG.md).

## Simulation rates

| Clock | Value |
| --- | --- |
| Server tick | 10 Hz (`MATCH_TICK_RATE`, `dt = 0.1`) |
| Snapshot broadcast | 10 Hz while occupied |
| Client `INPUT` send | 10 Hz |
| Local prediction integrate | Every render frame |
| Snapshot timeout | 2 s (`snapshot_timeout`) |
| Interpolation delay | 1 snapshot (`INTERP_DELAY_TICKS = 1.0`) |
| Snap correction | Error > 24 px |
| Blend correction | Error ≤ 24 px, blend 0.35 |
| Agreement | Error ≤ 0.5 px |
| Player AABB half-extent | 12 px |
| Match max players | 8 |
| Empty public match shutdown | 30 s (300 ticks) |
| Reconnect grace | 5 s (pose/health in memory) |
| Position checkpoint | 5 s if pose changed; also leave and terminate |
| Ground loot TTL | 30 s |
| `requestId` history TTL | 10 minutes |
| Client match payload cap | 2048 bytes |
| Chat body cap | 200 characters |
| Socket max message | 32768 bytes (`infra/nakama/local.yml`) |
| Rate window | 10 ticks: INPUT 20, combat/interact/loot/equip/quest 8, resync 2, 24 messages/player/tick |

## Reconciliation

After `FULL_STATE` / `SNAPSHOT` the client sets local seq to `max(current, lastProcessedSeq)`, drops `seq <= lastProcessedSeq`, and replays remaining intents from the server pose. A **new Nakama session** during grace resets server `lastProcessedSeq`; same-session resume keeps it. Logout waits for match leave (**Leaving…**).

## Persistence checkpoints

| Data | When written |
| --- | --- |
| Inventory | First successful pickup; quest turn-in (`multiUpdate`) |
| Equipment | First successful equip/unequip |
| Quests | First accept; objective progress; turn-in |
| Gold | Turn-in `nk.multiUpdate` only |
| Character position | Every 5 s if changed; leave; terminate |
| Health | Never persisted |
| Ground loot / slime AI / cooldowns | Match memory only |

## Exact commands

Clean setup:

```powershell
powershell -File scripts/setup.ps1
```

```bash
bash scripts/setup.sh
```

Backend:

```powershell
powershell -File scripts/dev-up.ps1
powershell -File scripts/dev-down.ps1
```

Client (graphical Alice/Bob):

```powershell
powershell -File scripts/run-two-clients.ps1
powershell -File scripts/run-client.ps1 -DevUser alice
```

Tests:

```powershell
powershell -File scripts/test-all.ps1
```

`test-all` runs setup, content tests + hash check, foundation audit, server tests, client GdUnit, then `scripts/test-e2e`.

Volume wipe (not part of `dev-down`):

```powershell
powershell -File scripts/backend-volume-destroy.ps1
```

## Prompt 18 two-client journey

Automated: `scripts/test-e2e` / `res://scenes/e2e/e2e_slice.tscn -- --e2e-slice` (debug builds only).

1. Alice authenticates.
2. Bob authenticates.
3. Both join `zone.starter`.
4. Both receive one another in `FULL_STATE`.
5. Alice moves.
6. Bob receives Alice’s changed position.
7. Alice interacts with the elder.
8. Alice accepts `quest.slime_problem`.
9. Alice attacks and kills the slime.
10. Alice picks up slime gel.
11. Alice turns in the quest.
12. Alice receives one iron sword and 25 gold.
13. Alice reconnects.
14. Alice still has the completed quest, iron sword, and gold.
15. A duplicate turn-in produces no additional reward (`already_completed`).

Manual graphical path: `scripts/run-two-clients.ps1`, Sign in as Alice / Bob, WASD, E, Space, F, logout/login.

## Known limitations

- One public match, one NPC, one enemy, one quest, one equipment slot, one character per account.
- Health is not persisted.
- Runtime still special-cases Prompt 18 IDs ([HARDCODED_ASSUMPTIONS.md](HARDCODED_ASSUMPTIONS.md)).
- Canonical storage objects lack a gameplay schema version field.
- Device auth and Nakama local keys are development-only.
- Debug FPS / input-to-ack EMA exist on `NetDebugOverlay`; there is no CI performance budget.
- GLoot `images/*.svg.import` may be rewritten by Godot; do not commit those.

## Current measurements

| Measurement | Value |
| --- | --- |
| `scripts/test-all.ps1` (2026-08-16) | ~54–63 s wall clock on the development machine |
| Headless e2e journey | ~34 s; prints `E2E_SLICE_OK` |
| Content tests | 9/9 |
| Server tests | 165/165 |
| Client GdUnit | 122/122, 0 orphans |
| Tick / snapshot / input | 10 Hz (by contract, not a profiler capture) |
