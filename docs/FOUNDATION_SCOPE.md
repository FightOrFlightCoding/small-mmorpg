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
| One public village-and-fields world | Existing and accepted (Prompt 29) | One `public_world` match using template `zone.starter`. No public-world sharding in v1. |
| Party-owned cave instances | Existing and accepted (Prompt 29) | Private `party_cave` matches (`zone.cave`). One solo character or one party. Shared instance for members entering together. |
| Maximum party size of five | Existing and accepted (Prompt 28) | Temporary parties cap at 5. Public match cap remains 8 unrelated players. |
| Data-defined character classes | Existing and accepted (Prompt 21) | Temporary test classes in content; selection is immutable. XP and attribute allocation are Prompt 22. Ability unlock remains later. |
| Level and experience progression | Existing and accepted (Prompt 22) | Content level curves; server XP from trusted events; client never submits amounts. |
| Optional attribute-point allocation | Existing and accepted (Prompt 22) | `ALLOCATE_ATTRIBUTES`; class `allowedAttributeIds`; recalculated derived stats. |
| Optional skill-point allocation | Required for Foundation v1 | Unspent skill points persist and display (Prompt 22). Ability unlock and spend remain later. |
| Unlocked abilities and hotbar validity | Required for Foundation v1 | Absent. Combat is one auto-attack. |
| Server-authoritative target-based PvE combat | Existing and accepted | Slice combat: `ATTACK` with `targetId` + `requestId`; server damage, cooldown, death, respawn. Foundation v1 must keep server authority while generalizing beyond one slime. |
| Casts, resources, and status effects | Required for Foundation v1 | Absent. Health exists; no mana/resource pool or status pipeline. |
| NPC dialogue | Existing and accepted (Prompt 27) | Dialogue after server `INTERACTION_RESULT`. Conditions read server-approved quest/class/level state. Scripts do not mutate canonical state. |
| NPC services (beyond dialogue) | Existing and accepted (Prompt 27, cave exit Prompt 29) | Content services: dialogue, quest_offer, quest_turn_in, vendor, inn, healer, cave_entrance, cave_exit. One NPC type; no elder/merchant/innkeeper classes. |
| Quests | Existing and accepted (Prompt 27) | Generic engine: categories, stages, reusable objectives, prerequisites, non-repeatable unless test-configured. Prompt 18 slime quest is content on that engine. |
| Merchants | Existing and accepted (Prompt 27) | Content vendors; server prices; buy/sell through the transaction service. Infinite static stock. |
| Inn and respawn binding | Existing and accepted (Prompt 27, cave instances Prompt 29) | Inn/healer services heal, restore class resources, optionally charge gold, and persist bind on the character record. Cave entry uses transfer tickets into a private match. |
| Inventory | Existing and accepted (Prompt 23) | Server-owned, content `inventoryCapacity`, stack merge/split/move, destroy, locks, `permissionWrite: 0`. |
| Equipment | Existing and accepted (Prompt 23) | Content-defined slots (temporary six tags), server-enforced requirements, canonical stat recalc. |
| Primary currency gold | Existing and accepted (Prompt 23) | Nakama wallet `gold`; every mutation goes through the currency/transaction service. |
| Simple loot | Existing and accepted (Prompt 26, group policies Prompt 28) | Data-defined loot tables; slime remains `ground_free`. Party tables may use `personal` or `server_assigned`. Need/greed remains later. |
| Zone chat | Existing and accepted | Room `zone.starter`, 200 characters, no BBCode. |
| Party chat | Existing and accepted (Prompt 28) | Room `party.<partyId>` for members. Direct-message and group joins remain rejected. |
| Temporary parties | Existing and accepted (Prompt 28) | Server-owned; survive 60 s disconnect grace; not permanently persistent. |
| Secure direct player trading | Existing and accepted (Prompt 30) | Nearby online same-match trades of items and gold. No mail, auction house, or offline trade. |
| Transfer tickets between public world and caves | Existing and accepted (Prompt 29) | One-time server-issued tickets consumed on destination join. |
| Reconnect to the correct public world or cave | Existing and accepted (Prompt 29) | Canonical location; cave rejoin during 60 s grace; public-world fallback if the cave is gone. |
| Empty cave grace shutdown | Existing and accepted (Prompt 29) | Public match empty shutdown is 30 s; caves empty-timeout and terminate after 60 s. |
| One character selected per account | Existing and accepted | Selection ticket; one active character in the match. Up to three live slots. |
| Email-and-password authentication | Existing and accepted (Prompt 21) | Nakama email auth; session cache; no password storage. Password-recovery email is out of v1 (admin-assisted). |
| Device authentication (development) | Existing and accepted | Debug builds only. Alice/Bob flags. Not production identity. |
| Content IDs, generated catalogs, matching hashes | Existing and accepted | `schemaVersion` 1, SHA-256 `contentHash`. |
| Local prediction and snapshot interpolation | Existing and accepted | Presentation only. |
| Debug two-client e2e journey | Existing and accepted | `--e2e-slice`; unavailable in release. |
| Functional client shell, settings, asset contracts | Existing and accepted (Prompt 31) | Windowing, local settings, stable visual/audio IDs. No final art. UI never authoritative. |
| Content production workflow | Existing and accepted (Prompt 32) | Project-owned CLI: templates, validate, diff, references, unused, migrate, package, optional CSV. No RPG database plugin. |
| Systems lab | Existing and accepted (Prompt 32) | `test.zone.systems_lab` is development-only. Does not replace automated tests. |
| Developer / GM tools | Existing and accepted (Prompt 32) | Server allowlist + audited `gm_command`. Client debug UI is not authority. |

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

## Authority (Foundation v1)

The server is the only authority for: selected character, class, level, experience, attribute allocation, skill allocation, unlocked abilities, hotbar validity, position, collision, targeting, health and resources, casts, cooldowns, damage, healing, status effects, death and respawn, enemy AI, spawn state, loot, inventory, equipment, currency, merchant transactions, quest state, quest rewards, party membership, group credit, cave ownership, zone transfers, canonical location, direct player trades, and developer/GM commands.

The client sends intentions, never outcomes.

## Prompt 18 freeze

Do not change player-visible Prompt 18 behavior in a documentation or audit phase. Do not special-case the elder, slime, training sword, iron sword, or original quest in **new** runtime code; existing special-cases are catalogued in [HARDCODED_ASSUMPTIONS.md](HARDCODED_ASSUMPTIONS.md) and must be removed by a later generalization phase, not by this freeze.
