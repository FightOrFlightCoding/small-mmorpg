# Progression storage catalog

PROG-03 stores the canonical character progression record on the existing `player` / `progression_<compactCharacterId>` blob (`permissionWrite: 0`). `SAVE_SCHEMA_VERSION` stays **1**. Progression gameplay schema is `progressionSchemaVersion` **2**.

Related: [STORAGE_CATALOG.md](../STORAGE_CATALOG.md), [PROGRESSION_MIGRATION_PLAN.md](PROGRESSION_MIGRATION_PLAN.md).

## Live record (PROG-03)

| Field | Value |
| --- | --- |
| Collection / key | `player` / `progression_<compactCharacterId>` (`PROGRESSION_COLLECTION` / `PROGRESSION_KEY` prefix) |
| `permissionRead` | 1 |
| `permissionWrite` | **0** |
| Envelope | `schemaVersion` **1** (save) + `progressionSchemaVersion` **2** (canonical progression) |
| Owner | Server match + lifecycle adapters |
| Client | Mirror only (`FULL_STATE.progression` / opcode 111). Never writes storage |

CamelCase JSON keys (project convention). Design snake_case names map as follows:

| Design field | Stored field |
| --- | --- |
| `schema_version` | `progressionSchemaVersion` |
| `class_id` | `classId` (also on the character record; character record is immutable after create) |
| `branch_id` | `branchId` |
| `level` | `level` |
| `xp_into_level` | `xpIntoLevel` (kept in sync with live `currentXp`) |
| `lifetime_xp` | `lifetimeXp` |
| `free_stat_allocations` | `freeStatAllocations` |
| `purchased_class_node_ids` | `purchasedClassNodeIds` |
| `purchased_branch_node_ranks` | `purchasedBranchNodeRanks` |
| `auto_assign_enabled` | `autoAssignEnabled` |
| `hotbar_assignments` | `hotbarAssignments` |
| `created_at` / `updated_at` | envelope `createdAt` / `updatedAt` |

Do **not** persist calculated HP, mana, crit, haste, DR, unspent class points, or unspent branch points as authority. `publicProgression` includes calculated `unspentClassPoints`, `unspentBranchPoints`, and `unspentFreeStatPoints`.

Live Foundation fields remain on the same blob so combat stays accepted: `currentXp`, 3-stat `allocatedAttributes`, `unspentAttributePoints`, `unspentSkillPoints`, `unlockedAbilityIds`, 8-slot `hotbar`, idempotency maps.

Missing progression on list/join/export is not fatal: initialize canonical level 1 and persist once.

## Account export and deletion

Export (`account_export`) migrates each character's progression, then includes the blob after secret filtering. Character purge deletes `progression` among gameplay kinds. Soft-delete leaves the blob until purge. Restore does not re-run starter grants and does not reset the progression record. Account deletion runs character purge for every roster id, which removes the progression object.

## Character summaries

`character_catalog` exposes `classId`, `level`, `branchId` (empty until a later phase records a branch), and presence (`ONLINE` / `LINK_DEAD` / …). Those fields are server-authored.
