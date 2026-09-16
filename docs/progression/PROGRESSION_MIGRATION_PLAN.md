# Progression migration plan

PROG-03 implements the v1 → canonical `progressionSchemaVersion` **2** mapping on load. `SAVE_SCHEMA_VERSION` stays **1**.

Related: [MIGRATIONS.md](../MIGRATIONS.md), [PROGRESSION_STORAGE_CATALOG.md](PROGRESSION_STORAGE_CATALOG.md).

## Why a migration is required

Live characters were created under Foundation/ACCT rules:

- Three production classes (`class.warrior`, `class.marksman`, `class.mage`). No `class.mystic`.
- Three attributes (`test.attribute.might|vitality|focus`), not eight design stats.
- Level curve `test.curve.standard`: **maxLevel 5**, XP `[50, 75, 100, 150]` (sum **375**), **+1** attribute and **+1** skill per level-up.
- Warrior/Marksman/Mage all had **mana** starting resources (PROG-03 removes physical mana from live `maxMana`).
- Hotbar length **8**.
- Abilities are `test.ability.*` grants, not the §9 roster.
- No branch, talent nodes, or auto-assign flag.
- `SAVE_SCHEMA_VERSION` is **1**; `progressionSchemaVersion` was **1**.
- Missing progression blobs initialize on join; they are not join-fatal.

Existing characters cannot be left implicit.

## Constraints

- No custom SQL. Use Nakama storage OCC (`storageWriteRetry` / `multiUpdate` where gold is involved).
- `permissionWrite: 0` on canonical records.
- Idempotent: a second migrate must not double-grant abilities, XP, or gold.
- Prompt 18 village/slime poses stay frozen unless a later phase explicitly repairs them.
- Content hash will change when class/stat/ability documents change; handshake `content_mismatch` rules still apply.
- Do not persist derived HP/mana/crit as source data.

## PROG-03 implemented mapping

1. **Schema.** `progressionSchemaVersion` **2**. `SAVE_SCHEMA_VERSION` remains **1**. Unsupported future versions stay rejected by the save kernel. Migrate v1 gameplay blobs on character list, match join, and account export. Idempotent if already v2 (`xpIntoLevel` is synced to `currentXp` if they drift).
2. **Class.** Keep `class.warrior` / `class.mage` / `class.marksman` from the **character** record. `class.mystic` is new creates only. Empty legacy `classId` still maps to `class.warrior` (`legacyMigrationDefault`). No automatic conversion to Mystic.
3. **Stats.** Do not treat `test.attribute.might` as STR. Keep live 3-stat `allocatedAttributes`. Canonical `freeStatAllocations` starts empty. Automatic 8-stat growth is not applied to live combat in this phase.
4. **XP / level.** Keep stored `level` (clamp 1–10). Do not jump to 10. Map `currentXp` → `xpIntoLevel`. Keep `lifetimeXp`. Live XP grants still use `test.curve.standard`.
5. **Points.** Recompute unspent class points (levels 3–4) and branch points (5–10, max 6) from level and empty purchases. Do not trust stored `unspentSkillPoints` as design skill points; that field remains the Foundation skill counter.
6. **Branch.** Always empty in this phase, including characters at live cap 5. Branch choice is a later phase.
7. **Abilities / hotbar.** Do **not** strip live `unlockedAbilityIds` or the 8-slot live `hotbar`. Canonical `hotbarAssignments` copies the first four live slots that are not empty, not Frenzy, and not `test.ability.*`. New production creates (`autoAttackId` present) grant **no** `startingAbilities` and no branch/L2 skills. Test classes without `autoAttackId` still receive `startingAbilities`.
8. **Mana.** Warrior/Marksman: `maxMana` 0; omit the mana resource key. Mage/Mystic: keep live mana from Foundation formulas.
9. **Talents.** Empty purchased nodes. Do not auto-spend old skill points into trees.
10. **Auto-assign.** Default **off** (`CANONICAL_AUTO_ASSIGN_DEFAULT = false`). See [progression-implementation-addendum.md](../design/progression-implementation-addendum.md).
11. **Gold / respec.** No gold charged on migration.
12. **Quests / inventory / equipment / location / lease / deletion.** Unchanged. Do not duplicate starting equipment. Do not regrant quest rewards. Soft-delete leaves the blob; restore does not re-init; purge deletes it.

Missing progression blob: initialize canonical level 1 for the character's class, then persist.

## PROG-14 final policy (planned)

PROG-03 v2 mapping is **not** the last migration. It keeps live 3-stat allocations, unlocks, and the 8-slot hotbar, and it leaves canonical `freeStatAllocations` and talent purchases empty. That is acceptable for development and certification characters. It is not acceptable as the permanent fate of real player investment.

Before PROG-14 completes:

1. Classify every existing character as **development/test** or **real player**.
2. Development/test characters may be migrated under deterministic test rules, reset through authorized development tooling, or retained solely for regression compatibility.
3. Real player characters must have old allocation **translated** deterministically, **refunded** as equivalent canonical unspent points, or **explicitly reset** with a visible migration notice.
4. Do not leave old investment in a field the canonical stat engine no longer reads.
5. Run migration logic even for records already marked `progressionSchemaVersion` **2** when they still contain leftover Foundation authorities (`allocatedAttributes`, live 8-slot `hotbar`, production `unlockedAbilityIds`). A PROG-03 blob must not be treated as finished merely because its schema number is current.

Do not implement this mapping before PROG-14. Details of the chosen translation/refund/reset path are recorded in this file when that phase runs.

## Fixtures

- `server/tests/fixtures/saves/current-v1-alice.json` — test vanguard L2 with 3-stat allocation; canonical migrate keeps class/level/XP.
- `server/tests/canonical_progression.test.ts` — warrior L1 and L5 inline v1 blobs, hotbar mapping, caster/physical mana, create idempotency.

## Rollout

Follow [DEPLOYMENT.md](../DEPLOYMENT.md): backup → validate → dry-run → server → apply → client → smoke. Maintenance `blockTransactions` if the window is unsafe. No downgrade path once schema 2 is written (existing limitation).
