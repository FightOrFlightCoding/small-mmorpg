# Progression architecture (PROG-01)

Documentation-only contract through PROG-01. PROG-02 adds canonical content JSON and generated bundles without enabling new player-visible combat. PROG-03 adds four-class creation and the canonical progression record without enabling level gains or talent spend. PROG-04 adds canonical derived statistics, resource asymmetry, and the modifier engine without enabling level gains or talent spend. PROG-05 adds the 1–10 XP curve, sequential level processing, automatic growth, free points, auto-assign, and milestones without talent spend or canonical combat.

Canonical numbers: [rpg-progression-design-v1.0.md](../design/rpg-progression-design-v1.0.md).  
Readings: [progression-interpretations.md](../design/progression-interpretations.md).  
Undocumented implementation numbers: [progression-implementation-addendum.md](../design/progression-implementation-addendum.md).

## Last accepted phase and ownership

Last accepted phase: **PROG-08** (generic combat mechanics; no production global cooldown). Later PROG phases still own class combat definitions and live ATTACK retune. Foundation v1 / Prompt 35 / ACCT-09 remain accepted. Prompt 18 village/slime combat behavior remains frozen.

PROG-08 extends the project-owned ability/effect/combat pipeline with reusable mechanic handlers, typed combat events, a server-authoritative random interface, independent multi-hit, DoT snapshot/retune, shields, taunt, cooldown recovery, vault movement, and line/cone/radius/delayed-ground targeting. Canonical `ability.*` stay `runtimeEnabled: false`. Live ATTACK is not retuned. Owned gaps: [CURRENT_CONFLICTS.md](CURRENT_CONFLICTS.md).

| Concern | Owner | Extend, do not duplicate |
| --- | --- | --- |
| Class lookup / create | `class_catalog.ts`, `character_lifecycle.ts`, `character.gd` | Production `class.*` documents |
| Level, XP, allocation | `progression.ts`, `progression_store.ts`, `ProgressionService` | Same records and opcodes |
| Derived stats | `stats.ts`, `canonical_stats.ts`, content `derived_stat` / `attribute` / `resource` | Canonical formulas overlay production classes; test classes keep Foundation layers |
| XP grants | `progression.ts`, `canonical_leveling.ts`, `xp_hooks.ts` | Production KillXP `8+2*level`; test classes keep `xpReward` |
| Abilities, casts, hotbar | `ability.ts`, `AbilityService`, content `ability` | New skills/talents as content |
| Effects, DoTs, shields | `effects.ts`, `combat_pipeline.ts`, `canonical_combat.ts` | Haste snapshot, no DoT crit, one terminal shield event |
| Threat / taunt | `threat.ts`, combat events | Challenge ability later; engine is live |
| Combat events / RNG | `combat_events.ts`, `combat_rng.ts` | Handlers subscribe by event; client never rolls |
| Equipment modifiers | `equipment.ts` channels into `stats.ts` | Keep as a modifier source |
| Character summaries | `character_catalog.ts` | `classId`, `level`, `branchId`, presence |
| Export / delete | `account_export.ts`, `character_purge.ts` (includes `progression`) | Same blobs |
| Content pipeline | `tools/content-build`, JSON Schema | No `.tres` as source of truth |
| Design audit | `progression_design_audit.ts` (tests only) | Not imported by the match runtime |

Godot `.tres` resources suggested in design §15.9 are **not** the source of truth in this repository. Authored content stays ID-addressed JSON under `content/source/`, compiled by the existing content CLI.

## Authority

The server is authoritative for class, branch, level, XP, automatic growth, free allocations, point balances, auto-assign, talent purchases, ability ownership and ranks, hotbar validity, derived statistics, maxima and current vitals, mana regen, crit, haste, damage reduction, attack/cast/DoT timing, cooldown progress, damage/heal/shield/buff/debuff/threat/taunt, death, respec, gold cost, enemy XP, and quest XP.

The client sends intentions only (`ALLOCATE_ATTRIBUTES`, `ALLOCATE_ATTRIBUTES_BATCH`, `TRAINER_RESPEC`, `SELECT_BRANCH`, `PURCHASE_TALENT`, `SET_AUTO_ASSIGN`, `AUTO_ASSIGN_UNSPENT_POINTS`, `USE_ABILITY`, `CANCEL_CAST`, `ASSIGN_HOTBAR`, `UNLOCK_ABILITY`). It never submits authoritative level, XP, stat totals, point balances, grants, ranks, combat results, crit rolls, mana, cooldown completion, durations, gold costs, or respec results.

## Persistence (PROG-03)

Do not persist calculated statistics as source data. Canonical fields on the existing progression blob:

`progressionSchemaVersion`, `classId`, `branchId`, `level`, `xpIntoLevel`, `lifetimeXp`, `freeStatAllocations`, `purchasedClassNodeIds`, `purchasedBranchNodeRanks`, `autoAssignEnabled`, `hotbarAssignments`, `createdAt`, `updatedAt`.

Point balances and granted design abilities must be reproducible from class, branch, level, allocations, purchased nodes, and content. Cached derived values may exist in the match but must be rebuildable. Canonical records keep `permissionWrite: 0`.

Live Foundation fields remain on the same blob. See [PROGRESSION_STORAGE_CATALOG.md](PROGRESSION_STORAGE_CATALOG.md) and [PROGRESSION_MIGRATION_PLAN.md](PROGRESSION_MIGRATION_PLAN.md).

## Invariants (PROG-04 statistics)

No stat caps. Warrior/Marksman have no mana. Mage/Mystic use mana. Haste never reduces stored cooldown duration. DoTs never crit and preserve total damage when tick interval changes. Calculated derived values are not persisted as authority.

## Combat timing (PROG-04)

Server delta time and tick progression. Haste affects auto-attack interval, cast time, channel time, and base DoT tick interval. Cooldown recovery is a separate remaining-tick rate and is not haste. Mana is float, regen continuous (`min(max, current + regen * delta)`), spend at cast start, interrupted casts do not refund unless content says so. Capstones cost 0 mana (content). Cooldown-recovery-rate **talents** remain later; the engine rate exists.

## Leveling (PROG-05)

Production levels 1–10 use `round_to_tens(100 * level^1.5)`. Process levels sequentially. Automatic growth is computed, not stored. Free points earned are `3 * (level - 1)`. Auto-assign on level gain spends only the newly earned three points. Cap overflow is lifetime-only. No default branch. Milestone ability grants are ownership only.

## Manual allocation and trainer respec (PROG-06)

Opcode 9 spends a positive integer of unspent free points on any of the eight `stat.*` ids. Opcode 36 validates a confirmed batch (1–16 entries), then applies atomically. There is no per-stat cap and no class restriction (a Warrior may spend INT). Test classes keep Foundation `allowedAttributeIds` and the 100-per-request cap.

Opcode 37 is available only at a generic NPC with overlay service `respec` (`npc.test_innkeeper`, `npc.lab_trainer`). Cost is canonical `50 × current_level` gold. Safe-leave restrictions (dead, combat, casting, trading, transferring, link-dead, reward-in-progress) reject the action. Gold and the progression blob persist together through `TX_REASON_RESPEC`. The same `requestId` does not deduct twice.

A successful respec clears free allocations, class-node purchases, branch ranks, branch choice, signature/capstone/buyable-active/branch-passive ownership, and invalid hotbar slots. It refunds earned free/class/branch points by calculation, preserves class/level/XP/automatic growth/level-2 basic/equipment/inventory, and recalculates derived stats. Level 5+ without a branch keeps persistent pending-branch guidance. Talent spend remains PROG-07.

## PvP

Remains disabled.

## Dependencies

No progression, skill-tree, RPG-statistics, cooldown, or ability plugin. No new npm/Godot packages in PROG-01.

## Later PROG phases

| Phases | Owns |
| --- | --- |
| PROG-06 | Manual free-stat allocation and trainer respec (accepted) |
| PROG-07 | Class/branch talent spend, ownership, one production hotbar (accepted) |
| PROG-08 | Canonical combat mechanics; no production global cooldown (accepted) |
| PROG-09–12 | Every class and branch, including auto-attacks |
| PROG-13 | Complete player-facing progression UI |
| PROG-14 | Persistence, lifecycle, final leftover-field migration |
| PROG-15 | Remove production legacy paths and certify balance |
