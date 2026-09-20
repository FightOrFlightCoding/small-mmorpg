# Known item limitations

Certified ITEM-01–ITEM-11 platform. These are documented limits, not defects to “fix” inside this pack.

| Limit | Status |
| --- | --- |
| Account-scoped Nakama gold wallet | ITEM-C20 OPEN. Gold is a wallet, not an item. Per-character split is not required by this pack. |
| `VENDOR_SELL` | ITEM-C12 KEEP. Live and tested; hidden from the ITEM merchant window. Player-to-merchant selling is later. |
| Corpses and player ground items | Match-lifetime (ITEM-C25). Restart drops unclaimed corpse and ground loot. Bags, equipment, and gold persist. |
| Harvesting / cooking / mining / blacksmithing | Not implemented as world systems. `grantItemFromSource` exists. A starter-zone **Herb Bush** QA fixture grants `item.wild_herb` on INTERACT (`herb_bush`) without node depletion. |
| Auctions, mail, offline trade | Later. |
| Public-world sharding | Excluded from Foundation. |
| Binding / soulbind | None. Do not add. |
| Need/Greed client RNG | Never. Server integers 1–100. |
| Ground coordinates | Never client-authoritative. |
| Overflow as extra storage | Grants never write overflow. Overflow is recovery only. |
| Foundation `item.test_*` | Production vendor/test catalog for `npc.test_vendor`. Lab `developmentOnly` content is excluded from the starter generate. |
| Sparkle dual-path | Prompt 18 slime gel sparkle plus corpse claim both remain valid. |

Storage record count remains **35**. Journal, intents, and item audits live on the inventory record.
