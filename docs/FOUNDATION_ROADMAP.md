# Foundation roadmap

Prompt 19 (catalogs/audit), Prompt 20 (versioned content and save schemas), Prompt 21 (authentication, slots, and class selection), Prompt 22 (XP, derived stats, and attribute allocation), Prompt 23 (generic items, inventory, equipment, currency, and the transaction core), Prompt 24 (generic ability, casting, cooldown, resource, and effect engine), Prompt 25 (generic combat pipeline, targeting, death, respawn, and XP hooks), Prompt 26 (generic enemies, spawn controllers, AI profiles, loot tables, and bosses), and Prompt 27 (generic NPC services, dialogue, quests, merchants, and inn) are accepted. Public-world, cave instances, parties, and trading remain later.

| Order | Theme | Outcome | Depends on |
| --- | --- | --- | --- |
| 19 | Freeze, scope, audit | This document set + `tools/foundation-audit`. Prompt 18 behavior unchanged. | Prompt 18 accepted |
| 20 | Versioned content and save schemas | Content-package manifest, client/server bundles, gameplay `schemaVersion` on canonical player records, idempotent Prompt 18 load. | 19 |
| 21 | Real authentication, character slots, class selection | Email/password accounts; three slots; content classes; selection tickets; Prompt 18 migrate into slot 1. Architectural ID hard-coding remains later. | 19–20 |
| 22 | Character level, experience, derived stats, attribute allocation | Server XP, level curves, stat pipeline, allocate command; skill points persist. Ability unlock is Prompt 24. | 21 |
| 23 | Generic items, inventory, equipment, currency, transaction core | Data-defined item categories, instance ids, stack ops, content slots, gold service, one transaction boundary. No merchants or trading. | 22 |
| 24 | Generic ability, casting, cooldown, resource, and effect engine | Data-defined abilities, one intention path, server timing/effects, skill-point unlock, hotbar. PvP off. No extra enemy AI. | 22–23 |
| 25 | Generic combat pipeline, targeting, death, respawn, XP hooks | One resolver for players, enemies, abilities, and effects; PvE death/respawn; structured formulas; targeting modes; XP via server events. PvP off. | 24 |
| 26 | Generic enemies, spawn controllers, AI profiles, loot tables, bosses | Data-defined enemies; spawn create/track/respawn/reset; melee/ranged/caster/boss AI; loot tables; simple boss phases. PvP off. Caves later. | 24–25 |
| 27 | Generic NPC services, dialogue, quests, merchants, inn | One NPC type with content services; generic quest engine; vendors; inn bind/heal. Cave entrance returns unavailable. Issued as this prompt (supersedes old roadmap 28/29). | 23–26 |
| Later | Secure direct trade | Server trade state machine; no client-complete; idempotent. Previously numbered as Prompt 30. | later parties, 27 |
| Later | Cave instances and transfer tickets | Private matches; party-shared instance; one-time server tickets; reconnect restores the correct match; empty-cave grace. Previously numbered as Prompt 26/29. | later parties |
| Later | Temporary parties (max 5) and party chat | Server membership; group credit hooks; party channel. Zone chat remains. Previously numbered as Prompt 25. | public world (later) |
| Later | Public village-and-fields world | One public-world template (may still be one match). No sharding. Previously numbered as Prompt 24. | 21 |
| Later | Abilities and hotbar | Implemented as issued Prompt 24. | 22 |
| Content | Names, balance, extra IDs, art | Authored under `content/source` after systems exist. | relevant systems |

## Rules for every later phase

- Do not upgrade pinned engine/server/addon versions unless that phase edits [DEPENDENCIES.md](DEPENDENCIES.md).
- Do not modify `client/addons/`.
- Do not implement excluded rows (PvP, guilds, AH, crafting, monetization, sharding, procgen).
- Keep Prompt 18 tests passing while generalizing; add tests for new transitions.
- Update the catalogs in this folder when storage, opcodes, or modules change.

## Prompt 20 status

Accepted in [PROGRESS.md](PROGRESS.md) as **Versioned content, save schemas, and migration kernel**.

## Prompt 21 status

Accepted in [PROGRESS.md](PROGRESS.md) as **Real authentication, character slots, and class selection**.

## Prompt 22 status

Accepted in [PROGRESS.md](PROGRESS.md) as **Generic statistics, experience, levels, and point allocation**.

## Prompt 23 status

Accepted in [PROGRESS.md](PROGRESS.md) as **Generic items, inventory, equipment, currency, and transaction core**.

## Prompt 24 status

Accepted in [PROGRESS.md](PROGRESS.md) as **Generic ability, casting, cooldown, resource, and effect engine**.

## Prompt 25 status

Accepted in [PROGRESS.md](PROGRESS.md) as **Generic combat pipeline, targeting, death, respawn, and XP hooks**.

## Prompt 26 status

Accepted in [PROGRESS.md](PROGRESS.md) as **Generic enemies, spawn controllers, AI profiles, loot tables, and bosses**.
