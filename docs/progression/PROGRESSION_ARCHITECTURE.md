# Progression architecture (PROG-01)

Documentation-only contract through PROG-01. PROG-02 adds canonical content JSON and generated bundles without enabling new player-visible combat. PROG-03 adds four-class creation and the canonical progression record without enabling level gains or talent spend. PROG-04 adds canonical derived statistics, resource asymmetry, and the modifier engine without enabling level gains or talent spend.

Canonical numbers: [rpg-progression-design-v1.0.md](../design/rpg-progression-design-v1.0.md).  
Readings: [progression-interpretations.md](../design/progression-interpretations.md).  
Undocumented implementation numbers: [progression-implementation-addendum.md](../design/progression-implementation-addendum.md).

## Last accepted phase and ownership

Last accepted phase: **PROG-04** (canonical statistics, derived values, and resource engine). Later PROG phases still own level gains, talent spend, and canonical combat. Foundation v1 / Prompt 35 / ACCT-09 remain accepted. Prompt 18 village/slime behavior remains frozen.

PROG-04 overlays canonical derived statistics on production `class.*` characters. Canonical melee/ranged/spell/curse/heal/shield functions exist and are tested independently. Live ATTACK, the live XP curve, and canonical `ability.*` remain later-phase work. Owned gaps: [CURRENT_CONFLICTS.md](CURRENT_CONFLICTS.md).

| Concern | Owner | Extend, do not duplicate |
| --- | --- | --- |
| Class lookup / create | `class_catalog.ts`, `character_lifecycle.ts`, `character.gd` | Production `class.*` documents |
| Level, XP, allocation | `progression.ts`, `progression_store.ts`, `ProgressionService` | Same records and opcodes |
| Derived stats | `stats.ts`, `canonical_stats.ts`, content `derived_stat` / `attribute` / `resource` | Canonical formulas overlay production classes; test classes keep Foundation layers |
| XP grants | `xp_hooks.ts`, enemy `xpReward`, quest `rewards.xp` | KillXP formula later |
| Abilities, casts, hotbar | `ability.ts`, `AbilityService`, content `ability` | New skills/talents as content |
| Effects, DoTs, shields | `effects.ts`, `combat_pipeline.ts` | Haste snapshot, no DoT crit |
| Threat / taunt | `threat.ts`, combat events | Challenge taunt later |
| Equipment modifiers | `equipment.ts` channels into `stats.ts` | Keep as a modifier source |
| Character summaries | `character_catalog.ts` | `classId`, `level`, `branchId`, presence |
| Export / delete | `account_export.ts`, `character_purge.ts` (includes `progression`) | Same blobs |
| Content pipeline | `tools/content-build`, JSON Schema | No `.tres` as source of truth |
| Design audit | `progression_design_audit.ts` (tests only) | Not imported by the match runtime |

Godot `.tres` resources suggested in design §15.9 are **not** the source of truth in this repository. Authored content stays ID-addressed JSON under `content/source/`, compiled by the existing content CLI.

## Authority

The server is authoritative for class, branch, level, XP, automatic growth, free allocations, point balances, auto-assign, talent purchases, ability ownership and ranks, hotbar validity, derived statistics, maxima and current vitals, mana regen, crit, haste, damage reduction, attack/cast/DoT timing, cooldown progress, damage/heal/shield/buff/debuff/threat/taunt, death, respec, gold cost, enemy XP, and quest XP.

The client sends intentions only (`ALLOCATE_ATTRIBUTES`, `USE_ABILITY`, `CANCEL_CAST`, `ASSIGN_HOTBAR`, `UNLOCK_ABILITY`, and later branch/talent/respec intents). It never submits authoritative level, XP, stat totals, point balances, grants, ranks, combat results, mana, cooldown completion, durations, or respec results.

## Persistence (PROG-03)

Do not persist calculated statistics as source data. Canonical fields on the existing progression blob:

`progressionSchemaVersion`, `classId`, `branchId`, `level`, `xpIntoLevel`, `lifetimeXp`, `freeStatAllocations`, `purchasedClassNodeIds`, `purchasedBranchNodeRanks`, `autoAssignEnabled`, `hotbarAssignments`, `createdAt`, `updatedAt`.

Point balances and granted design abilities must be reproducible from class, branch, level, allocations, purchased nodes, and content. Cached derived values may exist in the match but must be rebuildable. Canonical records keep `permissionWrite: 0`.

Live Foundation fields remain on the same blob. See [PROGRESSION_STORAGE_CATALOG.md](PROGRESSION_STORAGE_CATALOG.md) and [PROGRESSION_MIGRATION_PLAN.md](PROGRESSION_MIGRATION_PLAN.md).

## Invariants (PROG-04 statistics)

No stat caps. Warrior/Marksman have no mana. Mage/Mystic use mana. Haste never reduces stored cooldown duration. DoTs never crit and preserve total damage when tick interval changes. Calculated derived values are not persisted as authority.

## Combat timing (PROG-04)

Server delta time and tick progression. Haste affects auto-attack interval, cast time, channel time, and base DoT tick interval. Cooldown recovery still uses stored remaining ticks without haste. Mana is float, regen continuous (`min(max, current + regen * delta)`), spend at cast start, interrupted casts do not refund unless content says so. Capstones cost 0 mana (content). Cooldown-recovery-rate talents remain later.

## PvP

Remains disabled.

## Dependencies

No progression, skill-tree, RPG-statistics, cooldown, or ability plugin. No new npm/Godot packages in PROG-01.

## Later PROG phases

| Phases | Owns |
| --- | --- |
| PROG-05–07 | Leveling, allocation, branches, trees, ownership, one production hotbar |
| PROG-08 | Canonical combat mechanics; no production global cooldown |
| PROG-09–12 | Every class and branch, including auto-attacks |
| PROG-13 | Complete player-facing progression UI |
| PROG-14 | Persistence, lifecycle, final leftover-field migration |
| PROG-15 | Remove production legacy paths and certify balance |
