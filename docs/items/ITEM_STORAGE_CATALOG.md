# Item storage catalog (ITEM-03)

Subset of [STORAGE_CATALOG.md](../STORAGE_CATALOG.md) that the item platform reads or writes. Wallet gold is listed because it is canonical currency, not because it is a storage object. Defect: `permissionWrite !== 0` on a canonical record.

Gameplay save envelope remains `schemaVersion` **1**. Cave/location/transfer/trade records are not player-save kinds. ITEM-03 does **not** add a storage collection.

## Persistent player records

| Collection / key | Purpose | Write | Item relevance |
| --- | --- | --- | --- |
| `player` / `inventory` or `inventory_<compactId>` | Stacks, instance ids, typed locks, pickup/mutation `requestId` maps, `revision`, `journalByRequestId`, `intentsByRequestId`, `itemAudits` | OCC; loot/equip/destroy/turn-in/vendor/trade | CharacterBag + journal/intents/audit |
| `player` / `equipment` or `equipment_<compactId>` | Slot → instanceId, equipped `items[]`, equip `requestId` map, `revision` | OCC | EquipmentContainer |
| `player` / `overflow` or `overflow_<compactId>` | MigrationOverflow stacks | OCC; recover-only; drop compensation | Recovery, not extra storage |
| `player` / `quests` or `quests_<compactId>` | Log, accept/turn-in ids; consume/grant on turn-in | OCC; turn-in `multiUpdate` | Possession + consume |
| `player` / `wallet_ref` | Pointer that gold lives in Nakama wallet | Envelope only | Not the balance |
| `player` / `progression` | Not item storage; equipment modifiers feed stats | OCC | Recalc after equip |
| `player` / `character` | Class, bind, pose | Checkpoints | Join loads inventory with character |

Prompt 18 keys (`inventory`, `equipment`, `quests`) remain fallbacks so migrated slice data is not duplicated.

`persistReason` is a match-tick stamp for persistEconomy. It is an allowed inventory key and is not a separate record.

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
| Inventory `journalByRequestId` | ITEM-03 journal (`PREPARING`…`FAILED`) |
| Inventory `intentsByRequestId` | Acquisition and drop intents |
| Inventory `itemAudits` | Last 32 item mutation audits |
| Equipment `equipByRequestId` | Equip/unequip replay |
| `gm_audit` / `a_<id>` | GM grants |
| Trade `audits` on the trade object | Commit gold/item metadata |

Do not add custom SQL. Do not add a 36th storage record for the journal.

## Match-only (not storage)

| State | Persistence |
| --- | --- |
| `state.loot` `MatchLoot[]` | Lost on match restart; 30 s TTL |
| Enemy death `processedDeathEventIds` | Match memory; idempotent loot/XP |
| Party cache `lootPolicy` | Invalidated on party `revision` |
| Item locks | Serialized **inside** inventory instances; TTL + orphan recovery; must not survive completed logout; trade recovery rehydrates from trade record |
| Character serial | Per-match in-memory mutex; JSON-roundtripped match state does not need to persist it |
| Transient ground drop entity | Domain helper only; lost on match restart by design |
| `state.corpses` `CorpseLootContainer[]` | Lost on match restart; 60 s private / 5 min expire |
| `state.lootRolls` `LootRoll[]` | Lost on match restart; closes at the 60 s private boundary |

## Absent target records (do not create in ITEM-03)

Corpse documents, roll documents, ground-item documents, pending-roll-award documents, per-character gold wallets. MigrationOverflow is live. Journal/intents/audits are inventory fields, not new collections.
