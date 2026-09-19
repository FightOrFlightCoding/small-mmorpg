# Item transaction model (ITEM-03)

Extend `transaction.ts` / `nakama/transaction_store.ts` and the ITEM-03 domain helpers. Do not add a second economy layer. Do not expose a generic arbitrary-container command to clients.

## Live committers

| Path | When | Atomicity |
| --- | --- | --- |
| `grantItemFromSource` (`item_grant.ts`) | Trusted future/admin grants (GM `grant_test_item` included) | `planCapacity` then `runItemTransaction`; journal `eventId`; full bag does not consume the source |
| `commitTransaction` (`nk.multiUpdate`) | Gold + inventory/equipment/quests together (vendor, inn, quest reward, match persistEconomy) | Storage OCC + wallet |
| `writeInventory` / `writeInventoryOnce` | Inventory-only match mutations batched then wrapped as persistEconomy | OCC |
| `trade_store.ts` | Two inventories + two wallets + trade record + indexes + audits | `multiUpdate`; `committing` snapshot on interrupt |
| `memoryCommitter` | Unit tests | No Nakama |

Match `persistEconomy` stamps `inventory.persistReason` (`loot`, `equipment`, `item_destroy`, `item_split`, `item_move`). Missing reason still falls back to `loot` vs `equipment`.

`simulateCommit` checks `expectedVersions` vs `currentVersions` (`inventory` / `equipment` / `quests` / `progression` Nakama object versions) then `applyGoldMutation`.

## Live reason types (`TX_REASON_*`)

`loot`, `quest_reward`, `equipment`, `item_destroy`, `item_split`, `item_move`, `item_drop`, `item_acquire`, `admin_grant`, `vendor`, `inn`, `trade`, `respec`. Future grants stamp `persistReason` `item_grant` (GM uses `admin_grant`).

## Capacity simulator

One pure planner: `planCapacity` / `planTwoWayTrade` / `applyCapacityPlan` in `item_capacity.ts`. `acceptItemFailureCode` delegates to `planCapacity` (grant mode).

Input: current slots, incoming stacks, outgoing quantities, preferred slots, stack definitions, instance metadata, locks, operation mode.

Output: `fits`, planned merges, planned new stacks, planned slot placements, planned instance retirements, required new instance IDs, remaining quantities, failure code.

Default automatic placement:

1. Compatible partial stacks by lowest slot index (locked stacks are immovable and skipped).
2. Empty slots by lowest slot index.

A preferred slot may override when valid. Strict modes (`move`, `recover`) reject an invalid preferred slot (`invalid_slot`) or a full compatible preferred stack (`stack_full`). Grant/trade modes fall back.

Outgoing quantities apply first so trade and unequip can free slots in the same plan. Equipment-to-bag preserves `instanceId`. Two-way trade plans both bags with the opposite side’s offers as incoming.

Callers must not invent a second planner. Partial-success policy stays per operation (Loot All continues; vendor buy and trade commit are all-or-nothing). Vendor buy sets `preferredStrict` when `preferredSlot` is present so an incompatible occupied bag slot is `stack_incompatible` instead of spilling.

## Revisions

Container `revision` is live on bag/equipment/overflow. Item opcodes may send optional `expectedRevision`.

- Omitted: existing tests and older clients keep working.
- Present and equal: mutation proceeds.
- Present and stale: **no mutation**, `inventory_stale`, and the match pushes canonical `FULL_STATE`.

Stale failures are not stored as terminal `requestId` records.

## Request idempotency

| Action | Key |
| --- | --- |
| Pickup | `pickupByRequestId` plus acquisition intent |
| Destroy / split / move / vendor | `mutationByRequestId` (successful and terminal failed ids) |
| Equip | `equipByRequestId` (including failed records where remembered) |
| Domain transaction | journal `requestId` (`COMMITTED` / `FAILED` / `COMPENSATED`) |
| Gold | `GoldLedger.mutationByRequestId` |
| Death loot/XP | `kill:<instanceId>:<deathCount>` |
| Trade | `TradeRecord.byRequestId` + completed state |
| Quest turn-in | quest `requestId` map + `multiUpdate` |

A repeated successful `requestId` returns the original result without a second grant. A repeated failed id may return the same terminal result. `inventory_stale` and `player_dead` are not terminal.

Failed mutation ids are remembered in memory without persist or revision bump so existing `persistInventories.length === 0` tests stay valid.

## Per-character serialization

`createCharacterSerial` serializes item mutations for one character (loot, buy, move, split, equip, unequip, drop, trade, quest turn-in/reward, future gathering). The match loop is already single-threaded per tick; the serial is the domain lock used by `runItemTransaction`. Concurrent owners return `transaction_conflict`.

## Multi-character ordering

`sortCharacterIds` orders participants lexicographically. Acquire in that order; release in reverse. Avoids deadlock-style inversion on two-character trade.

## Transaction journal

`ItemJournalRecord` on the inventory (`journalByRequestId`), not a new storage collection.

| Field | Role |
| --- | --- |
| `transactionId` | Server id |
| `requestId` | Client/domain idempotency key |
| `operationType` | `loot`, `trade`, `item_drop`, … |
| `participants` | Sorted character ids |
| `sourceSnapshots` | Pre-mutation summaries |
| `destinationPlans` | Planner fit/failure |
| `state` | See below |
| `createdAt` / `updatedAt` | Ms timestamps |
| `failureCode` | Snake_case catalogue |
| `recoveryStatus` | `retry` / `compensated` / `overflow` / `restored` |

States: `PREPARING`, `RESERVED`, `COMMITTING`, `COMMITTED`, `COMPENSATING`, `COMPENSATED`, `FAILED`.

Interrupted `RESERVED` / `COMMITTING` retries without duplicating items. Failed apply restores snapshots (`COMPENSATED`).

## Acquisition intent

`beginAcquisitionIntent` / `completeAcquisitionIntent` wrap persistent grants from transient sources (corpse claim, ground pickup, Need/Greed award). A committed intent on the same `requestId` replays without a second award. Direct Need/Greed awards simulate the whole stack with `planCapacity` before grant.

## Drop intent

`DROP_ITEM` (48) calls `executeDropIntent`:

1. Lock the stack (`DROP_INTENT`).
2. Persist pending intent + bag removal (journal on the inventory record).
3. Create a match-lifetime public `GroundItem`.
4. Mark committed.

If failure occurs before the entity exists: restore to the bag when the planner fits; otherwise MigrationOverflow. Never silently lose the item. A completed ground drop may disappear after a later full match/server restart by design ([ITEM-C25](ITEM_CURRENT_CONFLICTS.md)). Duplicate `requestId` replays the existing entity and does not spawn a second.

## Audit events

`ItemMutationAudit` (capped at 32 on the inventory, not a new collection):

`transactionId`, `requestId`, `characterId`, `counterparty`, `operationType`, `definitionId`, `instanceId`, `quantityBefore`, `quantityAfter`, `sourceContainer`, `destinationContainer`, `goldDelta`, `timestamp`, `result`.

Gold ledger `TransactionAuditEvent` remains for wallet commits. No tokens or emails.

## Error catalogue

Wire values stay snake_case (`item_errors.ts`):

`inventory_stale`, `inventory_full`, `invalid_slot`, `invalid_quantity`, `stack_incompatible`, `stack_full`, `item_locked`, `item_not_owned`, `item_not_found`, `item_already_claimed`, `source_unavailable`, `destination_unavailable`, `transaction_conflict`, `transaction_recovery_pending`.

Existing Foundation codes (`player_dead`, `invalid_id`, `not_destroyable`, …) remain on those paths.

## Character gates (live)

Dead: pickup, bag mutate, equip, vendor, trade invite/open are rejected (`player_dead`).  
Link-dead / transferring / not in match: interaction and trade eligibility fail.  
Trade lock: equip/destroy/sell/consume offered stacks → `item_locked`. The whole source stack is immovable while any quantity is locked.  
Unique/class/level: grant or equip codes `unique_restricted` / `class_restricted` / `level_restricted`.

## Stack-instance rules (live and keep)

Merge: destination instance survives; source quantity decreases; source retired when quantity 0.  
Split: original keeps `instanceId`; new stack gets server id, `sourceType: split`.  
Full non-merged move: same `instanceId`, new `slotIndex`.  
Partial trade/drop: server split inside the transaction.

## Operation matrix

Live columns describe Foundation today plus ITEM-03. Target columns are the completed ITEM platform. Partial-success: **all-or-nothing** unless noted.

| Operation | Source → dest | Range / session | Capacity | Partial | Locks | Persist | Idempotency | Audit reason | Errors (live or target) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Bag move / swap / merge | CharacterBag → CharacterBag | Alive, not link-dead | Slot in range; merge uses maxStack | No | Block if locked | Inventory OCC; reason `item_move` | `mutationByRequestId` | `item_move` | `invalid_slot`, `item_locked`, `player_dead`, `inventory_stale` |
| Stack split | Bag → new bag stack | Alive | Need a free stack slot | No | Block if locked/equipped | Reason `item_split` | Same + stored `newInstanceId` | `item_split` | `inventory_full`, `item_equipped`, `inventory_stale` |
| Equip | Bag instance → EquipmentContainer | Alive | Instance leaves bag | No | Block if locked | Inventory+equipment | `equipByRequestId` | `equipment` | `not_equippable`, `class_restricted`, `unique_restricted`, `inventory_stale` |
| Unequip | Equipment → bag | Alive | Planner; free slot required | No | `EQUIPMENT_TRANSITION` available | Same | Same | `equipment` | `inventory_full`, `inventory_stale` |
| Corpse single loot | Corpse → bag | Alive, eligible, corpse range | Simulator | No (leave on corpse) | `LOOT_CLAIM` / acquisition intent | Inventory | `requestId` | `loot` | `not_eligible`, `inventory_full`, `invalid_target`, `inventory_stale` |
| Corpse Loot All | Corpse → bag (+ gold) | Same | Per stack; continue after a miss | **Yes** | Skip rolls / foreign awards | Inventory+wallet | `requestId` | `loot` | Summary: looted / no-fit / rolling |
| Corpse gold claim | Corpse gold → wallet | Private: eligible roster. Public: first claimant | N/A | Gold all-or-nothing | None (not an item) | Wallet | Exactly-once per corpse | `loot` | `not_eligible`, empty roster |
| Merchant purchase | Catalog → bag | Live interaction session + vendor NPC | Simulator | No | None on catalog | Inventory+wallet `multiUpdate` | `mutationByRequestId` | `vendor` | `insufficient_gold`, `invalid_amount`, `invalid_session`, `inventory_stale` |
| Merchant sell (live only) | Bag → gold | Vendor range | N/A | No | Block locked/equipped | Same | Same | `vendor` | `unsellable`, `item_locked`, `inventory_stale` |
| Ground drop | Bag → GroundItem | `DROP_ITEM` 48 | N/A (frees a slot) | Quantity 1..stack; ground is always a public stack | `DROP_INTENT` then release | Match-only entity | `requestId` | drop audit | `not_droppable`, `player_dead`, `destination_unavailable`, `ground_drop_limit` |
| Ground pickup | Ground → bag | Pickup range | Whole stack must fit | No | Acquisition intent | Inventory | `pickupByRequestId` | `loot` | `inventory_full`, `out_of_range`, `inventory_stale` |
| Trade offer | Bag → TradeOffer (locked in bag) | Open trade, 80 px | ≤20 lines | No | `TRADE` | Trade record | `requestId` | none until commit | `not_tradeable`, `item_equipped`, `offer_full` |
| Trade gold | Wallet reserved | Open trade | Spendable minus reserved | No | Reservation | Trade record | `requestId` | none until commit | `insufficient_gold` |
| Trade commit | Both offers → opposite bags + wallets | Both accepted current revision | `planTwoWayTrade` both sides | **No** | Held through commit | Dual `multiUpdate` | `requestId` + completed | `trade` | `inventory_full`, `persist_failed`, `revision_mismatch` |
| Quest consume | Bag → retired | Turn-in session/NPC | Must own count | No | Skip locked (may `missing_item`) | Inventory+quests+wallet | Turn-in `requestId` | `quest_reward` | `missing_item`, `incomplete_objective`, `inventory_stale` |
| Quest reward | Catalog → bag + wallet + XP | After consume | Simulator | No | None | `multiUpdate` | Same | `quest_reward` | `inventory_full`, `inventory_stale` |
| Future source grant | World node → bag | Server range + node | Simulator | No | None | Inventory | `requestId` / node event id | new reason, same committer | `inventory_full`, `out_of_range` |
