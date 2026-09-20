# Loot table guide

Loot tables are content documents (`loot_table` kind). The match rolls them **once** at enemy death with LCG seed `kill:<instanceId>:<deathCount>`. Opening a corpse never rerolls.

## Entries

- `kind: item` with `itemId` and a quantity range. Stacks split at `maxStack`.
- `kind: gold` with a gold range. Gold is not an item instance.

Groups may be guaranteed, chance, or weighted. Duplicate death of the same instance uses a new death count, not a client seed.

## Where drops go

Mob death creates a `CorpseLootContainer` and, for Prompt 18 slime gel, a linked sparkle. Ordinary party items are first-come on the corpse. Uncommon+ party items Need/Greed. Quest items stay first-come and never roll.

Player-dropped ground items are **not** loot tables. They are `DROP_ITEM` entities with a five-minute TTL.

## Client

The client never sends recipients, gold amounts, or item rolls. `lootRecipients` / `creditUserIds` are protocol injection.
