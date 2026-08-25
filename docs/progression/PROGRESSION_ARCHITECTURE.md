# Progression architecture (PROG-01)

Documentation-only contract through PROG-01. PROG-02 adds canonical content JSON and generated bundles without enabling new player-visible combat.

Canonical numbers: [rpg-progression-design-v1.0.md](../design/rpg-progression-design-v1.0.md).  
Readings: [progression-interpretations.md](../design/progression-interpretations.md).  
Undocumented implementation numbers: [progression-implementation-addendum.md](../design/progression-implementation-addendum.md) (empty of new values in PROG-01).

## Last accepted phase and ownership

Last accepted phase: **PROG-02** (canonical shared content schemas). Foundation v1 / Prompt 35 / ACCT-09 remain accepted. Prompt 18 village/slime behavior remains frozen.

PROG-02 authors canonical progression as content only. It does **not** replace the accepted progression, ability, effect, hotbar, or statistics systems. Later phases extend the owners below.

| Concern | Owner | Extend, do not duplicate |
| --- | --- | --- |
| Class lookup / create | `class_catalog.ts`, `character_lifecycle.ts`, `character.gd` | Production `class.*` documents |
| Level, XP, allocation | `progression.ts`, `progression_store.ts`, `ProgressionService` | Same records and opcodes |
| Derived stats | `stats.ts`, content `derived_stat` / `attribute` / `resource` | New 8-stat formulas in content + evaluator |
| XP grants | `xp_hooks.ts`, enemy `xpReward`, quest `rewards.xp` | KillXP formula later |
| Abilities, casts, hotbar | `ability.ts`, `AbilityService`, content `ability` | New skills/talents as content |
| Effects, DoTs, shields | `effects.ts`, `combat_pipeline.ts` | Haste snapshot, no DoT crit |
| Threat / taunt | `threat.ts`, combat events | Challenge taunt later |
| Equipment modifiers | `equipment.ts` channels into `stats.ts` | Keep as a modifier source |
| Character summaries | `character_catalog.ts` | Add branch later if listed |
| Export / delete | `account_export.ts`, `character_purge.ts` (includes `progression`) | Same blobs |
| Content pipeline | `tools/content-build`, JSON Schema | No `.tres` as source of truth |
| Design audit | `progression_design_audit.ts` (tests only) | Not imported by the match runtime |

Godot `.tres` resources suggested in design §15.9 are **not** the source of truth in this repository. Authored content stays ID-addressed JSON under `content/source/`, compiled by the existing content CLI.

## Authority

The server is authoritative for class, branch, level, XP, automatic growth, free allocations, point balances, auto-assign, talent purchases, ability ownership and ranks, hotbar validity, derived statistics, maxima and current vitals, mana regen, crit, haste, damage reduction, attack/cast/DoT timing, cooldown progress, damage/heal/shield/buff/debuff/threat/taunt, death, respec, gold cost, enemy XP, and quest XP.

The client sends intentions only (`ALLOCATE_ATTRIBUTES`, `USE_ABILITY`, `CANCEL_CAST`, `ASSIGN_HOTBAR`, `UNLOCK_ABILITY`, and later branch/talent/respec intents). It never submits authoritative level, XP, stat totals, point balances, grants, ranks, combat results, mana, cooldown completion, durations, or respec results.

## Persistence (target)

Do not persist calculated statistics as source data. Target canonical fields (later migration):

`schema_version`, `class_id`, `branch_id`, `level`, `xp_into_level`, `lifetime_xp`, `free_stat_allocations`, `purchased_class_node_ids`, `purchased_branch_node_ranks`, `auto_assign_enabled`, `hotbar_assignments`, `created_at`, `updated_at`.

Point balances and granted abilities must be reproducible from class, branch, level, allocations, purchased nodes, and content. Cached derived values may exist in the match but must be rebuildable. Canonical records keep `permissionWrite: 0`.

Current live fields differ; see [PROGRESSION_STORAGE_CATALOG.md](PROGRESSION_STORAGE_CATALOG.md) and [PROGRESSION_MIGRATION_PLAN.md](PROGRESSION_MIGRATION_PLAN.md).

## Invariants (later implementation)

Level cap 10. Each level after 1 grants +6 automatic and +3 free (automatic is double free). No stat caps. Warrior/Marksman have no mana. Mage/Mystic use mana. Haste never reduces cooldowns. DoTs never crit and preserve total damage when tick interval changes. Basics at 2, class points at 3–4, branch+signature at 5, branch points 5–10, capstone at 10, Tier 3 not before 9, at most one buyable tree active, auto-attack separate from the 4-slot active hotbar, every reward/point operation idempotent.

## Combat timing (later)

Server delta time and tick progression. Haste affects auto-attack interval, cast time, channel time, and base DoT tick interval. Cooldown recovery advances `cooldown_progress += delta * cooldown_recovery_rate` without shrinking stored cooldown. Mana is float, regen continuous, spend at cast start, interrupted casts do not refund unless content says so. Capstones cost 0 mana.

## PvP

Remains disabled.

## Dependencies

No progression, skill-tree, RPG-statistics, cooldown, or ability plugin. No new npm/Godot packages in PROG-01.
