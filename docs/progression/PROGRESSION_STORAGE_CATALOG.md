# Progression storage catalog

PROG-01 does not change live storage. This document records **current** records and the **target** canonical progression blob for later phases.

Related: [STORAGE_CATALOG.md](../STORAGE_CATALOG.md), [PROGRESSION_MIGRATION_PLAN.md](PROGRESSION_MIGRATION_PLAN.md).

## Current live record

| Field | Value |
| --- | --- |
| Collection / key | `player` / `progression_<compactCharacterId>` (`PROGRESSION_COLLECTION` / `PROGRESSION_KEY` prefix) |
| `permissionRead` | 1 |
| `permissionWrite` | **0** |
| Envelope | `schemaVersion` (save) + `progressionSchemaVersion` currently **1** |
| Owner | Server match + lifecycle adapters |
| Client | Mirror only (`FULL_STATE.progression` / opcode 111). Never writes storage |

Current value fields (not the design target): `level`, `currentXp`, `lifetimeXp`, `allocatedAttributes`, `unspentAttributePoints`, `unspentSkillPoints`, `unlockedAbilityIds`, `hotbar?`, `abilityRanks?`, idempotency maps (`xpByEventId`, `allocateByRequestId`, hotbar/unlock request maps and tick stamps), timestamps.

Class id lives on the **character** record, not the progression blob. There is no `branch_id`, no talent node lists, no auto-assign flag.

Missing progression on join is not fatal: the match initializes level 1 and persists once.

## Target canonical fields (later)

Persist minimum source data. Do **not** persist calculated HP, mana, crit, haste, or DR as authority.

| Field | Role |
| --- | --- |
| `schema_version` | Progression schema (distinct from or aligned with `SAVE_SCHEMA_VERSION` when a later phase names a bump) |
| `class_id` | Immutable after create (`class.warrior` / `mage` / `marksman` / `mystic`) |
| `branch_id` | Empty until level 5; then one locked branch id |
| `level` | 1–10 |
| `xp_into_level` | XP toward next level (replaces `currentXp` semantics) |
| `lifetime_xp` | Cumulative |
| `free_stat_allocations` | Spent free points per stat id |
| `purchased_class_node_ids` | Class-tree purchases (max 2 of 3) |
| `purchased_branch_node_ranks` | Branch node id → rank |
| `auto_assign_enabled` | Server-owned toggle |
| `hotbar_assignments` | Up to four active ability ids; auto-attack excluded |
| `created_at` / `updated_at` | Envelope |

Reproducible from content + those fields: unspent class/branch points, granted abilities/ranks, derived stats. Idempotency maps for XP and purchases remain required for reward safety; they are operational, not design-stat source.

Cached match fields (current HP/mana, cooldowns, effects) stay match-lived except existing checkpoint rules.

## Account export and deletion

Export (`account_export`) includes the progression storage object after secret filtering. Character purge already lists `progression` among deleted gameplay kinds. Soft-delete leaves the blob until purge. Later schema fields must stay exportable and purgeable on the same key.

## Character summaries

`character_catalog` currently exposes `classId` and `level` only. Branch may be added later as a safe summary field; it must not become a client-authored value.
