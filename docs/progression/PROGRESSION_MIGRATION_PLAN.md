# Progression migration plan

PROG-01 does not migrate saves or bump `SAVE_SCHEMA_VERSION`. This is the explicit later-phase plan.

Related: [MIGRATIONS.md](../MIGRATIONS.md), [PROGRESSION_STORAGE_CATALOG.md](PROGRESSION_STORAGE_CATALOG.md).

## Why a migration is required

Live characters were created under Foundation/ACCT rules:

- Three production classes (`class.warrior`, `class.marksman`, `class.mage`). No `class.mystic`.
- Three attributes (`test.attribute.might|vitality|focus`), not eight design stats.
- Level curve `test.curve.standard`: **maxLevel 5**, XP `[50, 75, 100, 150]` (sum **375**), **+1** attribute and **+1** skill per level-up.
- Warrior/Marksman/Mage all have **mana** starting resources.
- Hotbar length **8**.
- Abilities are `test.ability.*` grants, not the §9 roster.
- No branch, talent nodes, or auto-assign flag.
- `SAVE_SCHEMA_VERSION` is **1**; `progressionSchemaVersion` is **1**.
- Missing progression blobs initialize on join; they are not join-fatal.

None of that matches the canonical 1–10 / 11,100 XP / 8-stat / 4-class design. Existing characters cannot be left implicit.

## Constraints

- No custom SQL. Use Nakama storage OCC (`storageWriteRetry` / `multiUpdate` where gold is involved).
- `permissionWrite: 0` on canonical records.
- Idempotent: a second migrate must not double-grant abilities, XP, or gold.
- Prompt 18 village/slime poses stay frozen unless a later phase explicitly repairs them.
- Content hash will change when class/stat/ability documents change; handshake `content_mismatch` rules still apply.
- Do not persist derived HP/mana/crit as source data.

## Recommended mapping (later phase must implement and test)

1. **Name a progression schema bump** (and `SAVE_SCHEMA_VERSION` if the envelope must change). Reject unsupported future versions; migrate v1 gameplay blobs on load.
2. **Class**
   - Keep `class.warrior` / `class.mage` / `class.marksman` ids.
   - Add `class.mystic` as new creates only.
   - Empty legacy `classId` still maps to `class.warrior` (`legacyMigrationDefault`).
3. **Stats**
   - Do not treat `test.attribute.might` as STR. Define an explicit mapping table in the migrating phase (or reset free allocations to zero and apply automatic growth for current level from the class template).
   - Default recommendation if no lossless map exists: rebuild automatic growth from class + level; refund all free points as unspent; do not invent STR from Might.
4. **XP / level**
   - Cap 10. Convert `currentXp` into `xp_into_level` on the new curve.
   - Characters at live cap 5 stay at 5 unless a phase explicitly grants a catch-up. Do not silently jump to 10.
   - Lifetime XP: recompute or keep max(old lifetime, sum of new curve spent) — pick one in the implementing phase and test both over-level and mid-bar cases.
5. **Points**
   - Recompute unspent class points (levels 3–4) and branch points (5–10) from level; do not trust stored `unspentSkillPoints` as design skill points.
6. **Branch**
- Level below 5: `branch_id` empty.
- Level 5 or higher: require a branch choice on next login or default **unset** until the player selects (do not silently pick Bulwark).
7. **Abilities / hotbar**
   - Drop `test.ability.*` from the canonical hotbar if they are not in the new roster.
   - Grant basics/signatures/capstones from level/branch.
   - Truncate hotbar from 8 to 4; keep the first four **legal active** ids; strip Frenzy if present.
8. **Mana**
   - Warrior/Marksman: max/current mana 0; remove spendable resource.
   - Mage/Mystic: rebuild from INT/SPI formulas; clamp current into new max.
9. **Talents**
   - Empty purchased nodes. Do not auto-spend old skill points into trees.
10. **Auto-assign**
    - Default **off** unless a later UX phase says on for new characters.
11. **Gold / respec**
    - No gold charged on migration.
12. **Quests / enemies**
    - Slime `xpReward` 10 and quest XP 20 stay until an enemy/quest phase retunes to KillXP / §13. Migration of player XP does not rewrite those content fields by itself.

## Fixtures

Extend `server/tests/fixtures/saves/` and `existing_save_cert.test.ts` with:

- Prompt 18 / ACCT warrior at level 1 and at live cap 5.
- Marksman and mage with spent attribute points and an 8-slot hotbar.
- Soft-deleted character (blob preserved until purge).
- Missing progression blob (initialize then migrate).

## Rollout

Follow [DEPLOYMENT.md](../DEPLOYMENT.md): backup → validate → dry-run → server → apply → client → smoke. Maintenance `blockTransactions` if the window is unsafe. No downgrade path once the new schema is written (existing limitation).
