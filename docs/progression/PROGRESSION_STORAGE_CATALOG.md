# Progression storage catalog

PROG-03 stores the canonical character progression record on the existing `player` / `progression_<compactCharacterId>` blob (`permissionWrite: 0`). PROG-14 writes leftover cleanup as `progressionSchemaVersion` **3**. `SAVE_SCHEMA_VERSION` stays **1**.

Related: [STORAGE_CATALOG.md](../STORAGE_CATALOG.md), [PROGRESSION_MIGRATION_PLAN.md](PROGRESSION_MIGRATION_PLAN.md).

## Live record (PROG-03)

| Field | Value |
| --- | --- |
| Collection / key | `player` / `progression_<compactCharacterId>` (`PROGRESSION_COLLECTION` / `PROGRESSION_KEY` prefix) |
| `permissionRead` | 1 |
| `permissionWrite` | **0** |
| Envelope | `schemaVersion` **1** (save) + `progressionSchemaVersion` **3** (leftover cleanup complete) |
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
| leftover migration notice | `leftoverMigrationNotice` (`leftover_foundation_reset` when production Foundation authorities were cleared) |
| `created_at` / `updated_at` | envelope `createdAt` / `updatedAt` |

Do **not** persist calculated HP, mana, crit, haste, DR, unspent class points, or unspent branch points as authority. `publicProgression` includes calculated `unspentClassPoints`, `unspentBranchPoints`, and `unspentFreeStatPoints`.

Foundation fields remain on the same blob only for `test.*` classes: `currentXp`, 3-stat `allocatedAttributes`, `unspentAttributePoints`, `unspentSkillPoints`, 8-slot live `hotbar`. Production leftover copies of those authorities are cleared on load. Production `unlockedAbilityIds` are derived. Idempotency maps (`allocateByRequestId`, `respecByRequestId`, `purchaseTalentByRequestId`, ability/branch maps, `xpByEventId`) stay. Production hotbar authority is `hotbarAssignments` (4 slots).

Missing progression on list/join/export is not fatal: initialize canonical level 1 and persist once.

## Account export and deletion

Export (`account_export`) migrates each character's progression when the schema is supported, then includes the blob plus a `progressionExport` snapshot (class, branch, level, XP, free allocations, purchased class/branch nodes, auto-assign, hotbar, leftover notice). Unsupported future versions are exported as stored and are not rewritten. Character purge deletes `progression` among gameplay kinds. Soft-delete leaves the blob until purge. Restore does not re-run starter grants and does not reset the progression record. Account deletion runs character purge for every roster id, which removes the progression object. Recreating after purge does not inherit XP, branch, talents, or hotbar.

## Character summaries

`character_catalog` exposes `classId`, `level`, `branchId`, and presence (`ONLINE` / `LINK_DEAD` / …). Level and branch refresh from the persisted blob after level gain, branch choice, respec, reconnect, and server restart. Those fields are server-authored.
