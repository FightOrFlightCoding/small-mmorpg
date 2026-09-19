# Item transaction model (ITEM-01)

Extend `transaction.ts` / `nakama/transaction_store.ts`. Do not add a second economy layer.

## Live committers

| Path | When | Atomicity |
| --- | --- | --- |
| `commitTransaction` (`nk.multiUpdate`) | Gold + inventory/equipment/quests together (vendor, inn, quest reward, match persistEconomy) | Storage OCC + wallet |
| `writeInventory` / `writeInventoryOnce` | Inventory-only match mutations batched then often wrapped as persistEconomy | OCC |
| `trade_store.ts` | Two inventories + two wallets + trade record + indexes + audits | `multiUpdate`; `committing` snapshot on interrupt |
| `memoryCommitter` | Unit tests | No Nakama |

`simulateCommit` checks `expectedVersions` vs `currentVersions` (`inventory` / `equipment` / `quests` / `progression` Nakama object versions) then `applyGoldMutation`.

## Live reason types (`TX_REASON_*`)

`loot`, `quest_reward`, `equipment`, `item_destroy`, `item_split`, `item_move`, `admin_grant`, `vendor`, `inn`, `trade`, `respec`.

Match `persistEconomy` labels inventory batches `TX_REASON_LOOT` and equipment-only `TX_REASON_EQUIPMENT`. Destroy/split/move **constants exist** but the live match persist path does not stamp those reasons ([ITEM-C21](ITEM_CURRENT_CONFLICTS.md)).

## Idempotency (live)

| Action | Key |
| --- | --- |
| Pickup | `pickupByRequestId` |
| Destroy / split / move / vendor | `mutationByRequestId` |
| Equip | `equipByRequestId` |
| Gold | `GoldLedger.mutationByRequestId` |
| Death loot/XP | `kill:<instanceId>:<deathCount>` |
| Trade | `TradeRecord.byRequestId` + completed state |
| Quest turn-in | quest `requestId` map + `multiUpdate` |

Successful replay: `ok`, `persist: false`, no second grant. Failed attempts are not stored as successful records.

## Capacity simulation (live)

`acceptItemFailureCode` / `canAcceptItem`:

- Unique `character` policy
- Fill compatible stacks up to `maxStack`
- Remaining needs `ceil(remaining / maxStack)` empty **stack slots** (`occupiedSlots` + extra ≤ `capacity`)

It does **not** yet:

- Prefer a destination slot
- Account for outgoing stacks in the same plan
- Move equipment out of the bag
- Split one incoming stack across several destinations as an explicit plan object
- Treat locked stacks as non-mergeable destinations in all grant paths
- Return a dry-run plan; callers mutate after a boolean/code check

Target: **one** deterministic planner used by loot, loot-all, vendor, trade commit, unequip, drop, quest grant, and future forage. Only a validated plan may commit. Partial-success policy is per operation (Loot All continues; trade commit is all-or-nothing).

## Character gates (live)

Dead: pickup, bag mutate, equip, vendor, trade invite/open are rejected (`player_dead`).  
Link-dead / transferring / not in match: interaction and trade eligibility fail.  
Trade lock: equip/destroy/sell/consume offered stacks → `item_locked`.  
Unique/class/level: grant or equip codes `unique_restricted` / `class_restricted` / `level_restricted`.

Target additionally: bag rearrange / merchant / ground drop / trade blocked while dead; Need/Greed still allowed for eligible dead party members; reject deleted / not selected / not owned by session (already true for storage keys + tickets).

## Stack-instance rules (live and keep)

Merge: destination instance survives; source quantity decreases; source retired when quantity 0 (removed from `items`, not a separate retire table).  
Split: original keeps `instanceId`; new stack gets server id, `sourceType: split`.  
Full non-merged move: same `instanceId`, new `slotIndex`.  
Partial trade/drop (target): server split inside the transaction.

## Audit

`TransactionAuditEvent`: `requestId`, `characterId`, `userId`, `reasonType`, `reasonId`, `goldDelta`, `resultingBalance`, `code`, `ok`, `metadata`. Trade writes per-participant audits. GM grants use `gm_audit`. Later ITEM phases should stamp item instance ids and container revisions in metadata without logging tokens or personal emails.

## Operation matrix

Live columns describe Foundation today. Target columns are the completed ITEM platform. Partial-success: **all-or-nothing** unless noted.

| Operation | Source → dest | Range / session | Capacity | Partial | Locks | Persist | Idempotency | Audit reason | Errors (live or target) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Bag move / swap / merge | CharacterBag → CharacterBag | Alive, not link-dead | Slot in range; merge uses maxStack | No | Block if locked | Inventory OCC | `mutationByRequestId` | `item_move` (live persist often `loot`) | `invalid_slot`, `item_locked`, `player_dead` |
| Stack split | Bag → new bag stack | Alive | Need a free stack slot | No | Block if locked/equipped | Inventory OCC | Same + stored `newInstanceId` | `item_split` | `inventory_full`, `item_equipped` |
| Equip | Bag instance → EquipmentContainer | Alive | Live: no extra slot. Target: instance leaves bag | No | Block if locked | Inventory+equipment | `equipByRequestId` | `equipment` | `not_equippable`, `class_restricted`, `unique_restricted` |
| Unequip | Equipment → bag | Alive | Live: always (already in bag). Target: free slot required | No | Target: `EQUIPMENT_TRANSITION` | Same | Same | `equipment` | Target `inventory_full` |
| Corpse single loot | Corpse → bag | Alive, eligible, corpse range | Simulator | No (leave on corpse) | `LOOT_CLAIM` | Inventory | `requestId` | `loot` | `not_eligible`, `inventory_full`, `invalid_target` |
| Corpse Loot All | Corpse → bag (+ gold) | Same | Per stack; continue after a miss | **Yes** | Skip rolls / foreign awards | Inventory+wallet | `requestId` | `loot` | Summary: looted / no-fit / rolling |
| Corpse gold claim | Corpse gold → wallet | Private: eligible roster. Public: first claimant | N/A | Gold all-or-nothing | None (not an item) | Wallet | Exactly-once per corpse | `loot` | `not_eligible`, empty roster |
| Merchant purchase | Catalog → bag | Live interaction session + vendor NPC | Simulator | No | None on catalog | Inventory+wallet `multiUpdate` | `mutationByRequestId` | `vendor` | `insufficient_gold`, `invalid_amount`, `invalid_session` |
| Merchant sell (live only) | Bag → gold | Vendor range | N/A | No | Block locked/equipped | Same | Same | `vendor` | `unsellable`, `item_locked` |
| Ground drop | Bag → GroundItem | Alive, not dead | N/A (frees a slot) | No partial quantity on ground | `DROP_INTENT` then release | Match-only entity | `requestId` | drop audit | `not_droppable`, `player_dead` |
| Ground pickup | Ground → bag | Pickup range | Whole stack must fit | No | `LOOT_CLAIM` | Inventory | `pickupByRequestId` | `loot` | `inventory_full`, `out_of_range` |
| Trade offer | Bag → TradeOffer (locked in bag) | Open trade, 80 px | Target: ≤20 lines | No | `TRADE` | Trade record | `requestId` | none until commit | `not_tradeable`, `item_equipped` |
| Trade gold | Wallet reserved | Open trade | Spendable minus reserved | No | Reservation | Trade record | `requestId` | none until commit | `insufficient_gold` |
| Trade commit | Both offers → opposite bags + wallets | Both accepted current revision | Simulator both sides | **No** | Held through commit | Dual `multiUpdate` | `requestId` + completed | `trade` | `inventory_full`, `persist_failed`, `revision_mismatch` |
| Quest consume | Bag → retired | Turn-in session/NPC | Must own count | No | Skip locked (may `missing_item`) | Inventory+quests+wallet | Turn-in `requestId` | `quest_reward` | `missing_item`, `incomplete_objective` |
| Quest reward | Catalog → bag + wallet + XP | After consume | Simulator | No | None | `multiUpdate` | Same | `quest_reward` | `inventory_full` |
| Future source grant | World node → bag | Server range + node | Simulator | No | None | Inventory | `requestId` / node event id | new reason, same committer | `inventory_full`, `out_of_range` |

