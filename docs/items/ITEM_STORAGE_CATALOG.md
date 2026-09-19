# Item storage catalog (ITEM-01)

Subset of [STORAGE_CATALOG.md](../STORAGE_CATALOG.md) that the item platform reads or writes. Wallet gold is listed because it is canonical currency, not because it is a storage object. Defect: `permissionWrite !== 0` on a canonical record.

Gameplay save envelope remains `schemaVersion` **1**. Cave/location/transfer/trade records are not player-save kinds.

## Persistent player records

| Collection / key | Purpose | Write | Item relevance |
| --- | --- | --- | --- |
| `player` / `inventory` or `inventory_<compactId>` | Stacks, instance ids, locks, pickup/mutation `requestId` maps | OCC; loot/equip/destroy/turn-in/vendor/trade | CharacterBag |
| `player` / `equipment` or `equipment_<compactId>` | Slot → instanceId, equip `requestId` map | OCC | EquipmentContainer |
| `player` / `quests` or `quests_<compactId>` | Log, accept/turn-in ids; consume/grant on turn-in | OCC; turn-in `multiUpdate` | Possession + consume |
| `player` / `wallet_ref` | Pointer that gold lives in Nakama wallet | Envelope only | Not the balance |
| `player` / `progression` | Not item storage; equipment modifiers feed stats | OCC | Recalc after equip |
| `player` / `character` | Class, bind, pose | Checkpoints | Join loads inventory with character |

Prompt 18 keys (`inventory`, `equipment`, `quests`) remain fallbacks so migrated slice data is not duplicated.

## Wallet

| Record | Purpose |
| --- | --- |
| Nakama wallet `gold` | Canonical amount. Mutations via `applyGoldMutation` / `commitTransaction` / trade `multiUpdate`. |

Gold is **account-scoped**, not per-character. ITEM-01 does not split wallets ([ITEM-C20](ITEM_CURRENT_CONFLICTS.md)).

## Trade (not player-save)

| Collection / key | Purpose |
| --- | --- |
| `trade` / `t_<tradeId>` | Participants, state, revision, offers, gold, acceptances, `commitSnapshot`, `byRequestId` |
| `player` / `trade_<compactId>` | Live trade index |
| `player` / `trade_audit_<compactId>` | Last trade audit (`reasonType: trade`) |

States live: `inviting` / `open` / `committing` / `completed` / `cancelled`.

## Transaction / audit

| Path | Purpose |
| --- | --- |
| `GoldLedger.mutationByRequestId` | In-memory/wallet idempotency for gold |
| Inventory `pickupByRequestId`, `mutationByRequestId` | Pickup/destroy/split/move/vendor replay |
| Equipment `equipByRequestId` | Equip/unequip replay |
| `gm_audit` / `a_<id>` | GM grants |
| Trade `audits` on the trade object | Commit gold/item metadata |

There is no dedicated item-audit collection besides trade audit, GM audit, and gold ledger metadata. Later ITEM phases may add an item audit stream; do not add custom SQL.

## Match-only (not storage)

| State | Persistence |
| --- | --- |
| `state.loot` `MatchLoot[]` | Lost on match restart; 30 s TTL |
| Enemy death `processedDeathEventIds` | Match memory; idempotent loot/XP |
| Party cache `lootPolicy` | Invalidated on party `revision` |
| Item locks | Serialized **inside** inventory instances; must not survive completed logout; trade recovery rehydrates from trade record |

## Absent target records (do not create in ITEM-01)

Corpse documents, roll documents, ground-item documents, migration-overflow documents, pending-roll-award documents, per-character gold wallets, container-revision fields on inventory JSON.
