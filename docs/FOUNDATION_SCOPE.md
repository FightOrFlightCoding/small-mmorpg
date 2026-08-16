# Foundation v1 scope

Binding product scope after Prompt 18. Prompt 18 remains the accepted, frozen vertical slice. This file classifies every candidate feature. There is no “maybe foundation” category.

Related: [FOUNDATION_BASELINE.md](FOUNDATION_BASELINE.md), [FOUNDATION_ROADMAP.md](FOUNDATION_ROADMAP.md), [VERTICAL_SLICE.md](VERTICAL_SLICE.md), [AGENTS.md](../AGENTS.md).

## How to read the table

| Class | Meaning |
| --- | --- |
| Required for Foundation v1 | Must exist before Foundation v1 is accepted. Not implemented in this phase unless a later prompt says so. |
| Existing and accepted | Present in the Prompt 18 slice and frozen. Keep behavior unless a later phase explicitly generalizes it. |
| Required later as game content | Names, balance, additional IDs, art, and writing. Not a systems phase. |
| Explicitly postponed | Out of Foundation v1. May be considered after v1. |
| Explicitly excluded | Must not be built in this repository’s foundation track. |

A later phase may implement a Required-for-Foundation-v1 row only when that phase prompt names it. Prompt 19 implements none of them.

## Locked Foundation v1 product

| Feature | Class | Prompt 18 status |
| --- | --- | --- |
| One public village-and-fields world | Required for Foundation v1 | Existing prototype is the single `zone.starter` match. Must become the public-world template; no public-world sharding in v1. |
| Party-owned cave instances | Required for Foundation v1 | Absent. Private matches, one player or one party, shared instance for members entering together. |
| Maximum party size of five | Required for Foundation v1 | Absent. Current match cap is 8 unrelated players in one public match. |
| Data-defined character classes | Existing and accepted (Prompt 21) | Temporary test classes in content; selection is immutable. XP, attribute allocation, and abilities remain later prompts. |
| Level and experience progression | Required for Foundation v1 | Absent. |
| Optional attribute-point allocation | Required for Foundation v1 | Absent. |
| Optional skill-point allocation | Required for Foundation v1 | Absent. |
| Unlocked abilities and hotbar validity | Required for Foundation v1 | Absent. Combat is one auto-attack. |
| Server-authoritative target-based PvE combat | Existing and accepted | Slice combat: `ATTACK` with `targetId` + `requestId`; server damage, cooldown, death, respawn. Foundation v1 must keep server authority while generalizing beyond one slime. |
| Casts, resources, and status effects | Required for Foundation v1 | Absent. Health exists; no mana/resource pool or status pipeline. |
| NPC dialogue | Existing and accepted | Elder dialogue after `INTERACTION_RESULT`. |
| NPC services (beyond dialogue) | Required for Foundation v1 | Absent. |
| Quests | Existing and accepted | One quest, server-owned, idempotent turn-in. |
| Merchants | Required for Foundation v1 | Absent. |
| Inn and respawn binding | Required for Foundation v1 | Absent. Death teleports to `zone.starter.playerSpawn`. |
| Inventory | Existing and accepted | Server-owned, capacity 20 stacks, `permissionWrite: 0`. |
| Equipment | Existing and accepted | One `main_hand` slot, server-derived attack. |
| Simple loot | Existing and accepted | Transient ground loot, `requestId` pickup. |
| Primary currency gold | Existing and accepted | Nakama wallet `gold`; quest turn-in credits 25. |
| Zone chat | Existing and accepted | Room `zone.starter`, 200 characters, no BBCode. |
| Party chat | Required for Foundation v1 | Absent. Direct-message and group joins are rejected. |
| Temporary parties | Required for Foundation v1 | Absent. |
| Secure direct player trading | Required for Foundation v1 | Absent. |
| Transfer tickets between public world and caves | Required for Foundation v1 | Absent. Join is `find_or_create_starter_zone` only. |
| Reconnect to the correct public world or cave | Required for Foundation v1 | Slice reconnects only to `zone.starter`. |
| Empty cave grace shutdown | Required for Foundation v1 | Public match empty shutdown is 30s; caves do not exist. |
| One character selected per account | Existing and accepted | Selection ticket; one active character in the match. Up to three live slots. |
| Email-and-password authentication | Existing and accepted (Prompt 21) | Nakama email auth; session cache; no password storage. Password-recovery email is out of v1 (admin-assisted). |
| Device authentication (development) | Existing and accepted | Debug builds only. Alice/Bob flags. Not production identity. |
| Content IDs, generated catalogs, matching hashes | Existing and accepted | `schemaVersion` 1, SHA-256 `contentHash`. |
| Local prediction and snapshot interpolation | Existing and accepted | Presentation only. |
| Debug two-client e2e journey | Existing and accepted | `--e2e-slice`; unavailable in release. |

## Game content (not systems)

| Feature | Class |
| --- | --- |
| Final class names, skill names, and lore | Required later as game content |
| Numeric balance (speeds, damage, XP curves, prices) | Required later as game content |
| Additional village NPCs, quests, items, and enemies as data | Required later as game content |
| Art direction and new asset packs | Required later as game content |
| Kenney RPG Base presentation already in the slice | Existing and accepted |

## Explicitly postponed

| Feature | Class | Why |
| --- | --- | --- |
| Multiple character slots | Existing and accepted (Prompt 21) | Configurable maximum of three live characters. Soft-delete/restore. |
| Account-wide cosmetics / appearance editor | Explicitly postponed | Not in the locked v1 list. |
| Friends lists and social directories | Explicitly postponed | Not required for parties or trade. |
| Mail | Explicitly postponed | Not in the locked v1 list. |
| Dungeons beyond party caves | Explicitly postponed | v1 caves only. |
| Mounts, housing, pets | Explicitly postponed | Not in the locked v1 list. |

## Explicitly excluded

| Feature | Class |
| --- | --- |
| Public-world sharding | Explicitly excluded |
| Extra public overworlds / open-world streaming | Explicitly excluded |
| Guilds | Explicitly excluded |
| Auction houses | Explicitly excluded |
| Crafting systems | Explicitly excluded |
| Player-versus-player combat | Explicitly excluded |
| Monetization, cash shop, real-money trade | Explicitly excluded |
| Procedural generation as a world system | Explicitly excluded |
| Custom SQL tables (unless a later approved architecture decision requires one) | Explicitly excluded |
| Client-authoritative simulation or rewards | Explicitly excluded |
| New gameplay frameworks (QuestSystem, LimboAI, netfox, RPG database plugins) | Explicitly excluded |
| Upgrading Godot, Nakama, GLoot, Dialogue Manager, or GdUnit4 without a pin-change phase | Explicitly excluded |

## Authority (Foundation v1, not yet fully implemented)

When a later phase adds a row from the locked list, the server is the only authority for: selected character, class, level, experience, attribute allocation, skill allocation, unlocked abilities, hotbar validity, position, collision, targeting, health and resources, casts, cooldowns, damage, healing, status effects, death and respawn, enemy AI, spawn state, loot, inventory, equipment, currency, merchant transactions, quest state, quest rewards, party membership, group credit, cave ownership, zone transfers, trade state, and trade completion.

The client sends intentions, never outcomes.

## Prompt 18 freeze

Do not change player-visible Prompt 18 behavior in a documentation or audit phase. Do not special-case the elder, slime, training sword, iron sword, or original quest in **new** runtime code; existing special-cases are catalogued in [HARDCODED_ASSUMPTIONS.md](HARDCODED_ASSUMPTIONS.md) and must be removed by a later generalization phase, not by this freeze.
