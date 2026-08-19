# Save migrations

Prompt 20 save-schema kernel. Runtime load migrates Prompt 18 blobs server-side. The client cannot select or send a save version.

Related: [STORAGE_CATALOG.md](STORAGE_CATALOG.md), [CONTENT_MODEL.md](CONTENT_MODEL.md), [SECURITY_MODEL.md](SECURITY_MODEL.md).

## Current version

Canonical player records use gameplay `schemaVersion` **1**, plus `createdAt` and `updatedAt` (Unix milliseconds). JSON keys are camelCase, matching the rest of the protocol.

Missing `schemaVersion`, or a JSON `null` left by the Nakama runtime when an optional field was undefined, is Prompt 18 **v0**. Unsupported future versions and non-integer versions (`1.5`, `"1"`) are rejected (`unsupported_future_version` / `corrupted_schema_version`) and are not rewritten.

Migrated Prompt 18 timestamps use `createdAt: 0` and `updatedAt: 0` because the original write time is unknown. That keeps the v0→v1 transform deterministic and retry-safe. New records created after this phase use the server clock.

## Commands

Fixture (no Nakama):

```powershell
powershell -File scripts/migrate-status.ps1 --fixture server/tests/fixtures/saves/p18-alice.json
powershell -File scripts/migrate-dry-run.ps1 --fixture server/tests/fixtures/saves/p18-alice.json
powershell -File scripts/migrate-apply.ps1 --fixture server/tests/fixtures/saves/p18-alice.json --out $env:TEMP\p18-alice.v1.json
powershell -File scripts/migrate-verify.ps1 --fixture $env:TEMP\p18-alice.v1.json
```

```bash
bash scripts/migrate-status.sh --fixture server/tests/fixtures/saves/p18-alice.json
bash scripts/migrate-dry-run.sh --fixture server/tests/fixtures/saves/p18-alice.json
bash scripts/migrate-apply.sh --fixture server/tests/fixtures/saves/p18-alice.json --out /tmp/p18-alice.v1.json
bash scripts/migrate-verify.sh --fixture /tmp/p18-alice.v1.json
```

Live local Nakama (console `admin` / `password` on `http://127.0.0.1:7351`):

```powershell
powershell -File scripts/migrate-status.ps1 --account <userId>
powershell -File scripts/migrate-dry-run.ps1 --character <characterId> --all-local
powershell -File scripts/migrate-apply.ps1 --all-local
powershell -File scripts/migrate-verify.ps1 --all-local
```

| Flag | Meaning |
| --- | --- |
| `--fixture path` | JSON snapshot (character, inventory, equipment, quests, optional walletRef, gold) |
| `--account` / `--user-id` | One Nakama user id |
| `--character` | Filter to that `characterId` |
| `--all-local` | Accounts whose custom id starts with `vibecode-dev-` or `vibecode-local-` |
| `--out` | Fixture apply output path (defaults to overwriting `--fixture`) |

`--character` without `--account` or `--fixture` scans local-development accounts and filters to that character id.

`status` and `dry-run` never write. `apply` writes migrated JSON (fixture) or console storage (live). `verify` migrates in memory and fails if a second pass would still change data. There is no bulk-delete command.

Gold stays in the Nakama wallet. Migration never credits gold or grants starter items / quest rewards.

## Runtime

`character_bootstrap` and starter-zone join load storage through the same kernel, persist a successful v0→v1 result once (OCC), and reject visibly on future or corrupted required fields. Join metadata cannot carry a save version. Bootstrap `schemaVersion` / `createdAt` / `updatedAt` are `stat_injection`.

Prompt 21 additionally moves a Prompt 18 `player`/`character` object into the account roster as slot 1, copies inventory/quests/equipment onto character-scoped keys **without** re-running starter grants, and fills `classId` from the content class with `legacyMigrationDefault: true`. `SAVE_SCHEMA_VERSION` stays **1**. Gold is not copied or credited.

Prompt 22 adds `player`/`progression`. A missing blob is not join-fatal: the match initializes level 1, 0 XP, class `pointsAtCreate`, and class `startingAbilities`, then persists once. A present v0 blob migrates through `mig.progression.v0_to_v1`. Live combat for that character uses the stat pipeline (vanguard level 1 with the training sword still deals `player.base.attack` + `attackBonus`). Skill-tree unlocks remain later.

Prompt 23 keeps `SAVE_SCHEMA_VERSION` **1**. Missing item-instance fields default on load (`sourceType` `migration`, `createdAt` 0, empty locks, sequential `slotIndex`). Existing instance ids, stacks, equipped `main_hand`, and wallet gold are preserved and not duplicated. Extra equipment slot tags are filled empty.

Prompt 33 does not raise `SAVE_SCHEMA_VERSION`. Unsafe migration windows set maintenance `blockTransactions` so ordinary commits return `migration_required`. Deploy order (backup → validate → dry-run → server → apply → client → smoke → clear maintenance) is [DEPLOYMENT.md](DEPLOYMENT.md).
