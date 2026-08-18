# Foundation roadmap

Prompt 19 (catalogs/audit), Prompt 20 (versioned content and save schemas), Prompt 21 (authentication, slots, and class selection), Prompt 22 (XP, derived stats, and attribute allocation), Prompt 23 (generic items, inventory, equipment, currency, and the transaction core), Prompt 24 (generic ability, casting, cooldown, resource, and effect engine), Prompt 25 (generic combat pipeline, targeting, death, respawn, and XP hooks), Prompt 26 (generic enemies, spawn controllers, AI profiles, loot tables, and bosses), Prompt 27 (generic NPC services, dialogue, quests, merchants, and inn), Prompt 28 (temporary parties, party chat, group credit, and group loot), Prompt 29 (public world, party cave instances, transfers, and reconnection), Prompt 30 (secure direct player trading), and Prompt 31 (complete functional UI, settings, and asset contracts) are accepted.

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
| 28 | Temporary parties, party chat, group credit, group loot | Server membership max 5; party channel; group XP/quest credit; personal and server-assigned loot. No guilds, matchmaking, or need/greed. | 25–27 |
| 29 | Public world, party caves, transfers, reconnect | One `public_world` match; private `party_cave` matches; one-time tickets; canonical location; empty-cave grace. No sharding. | 28 |
| 30 | Secure direct trade | Server trade state machine; nearby online same-match item and gold exchange; no client-complete; idempotent. Mail, auction houses, and offline trade remain later. | 28, 27, 23 |
| 31 | Functional UI, settings, asset contracts | Complete client shell, local settings, stable visual/audio sets. No final art. UI never authoritative. | 21–30 |
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

## Prompt 27 status

Accepted in [PROGRESS.md](PROGRESS.md) as **Generic NPC services, dialogue, quests, merchants, and inn**.

## Prompt 28 status

Accepted in [PROGRESS.md](PROGRESS.md) as **Temporary parties, party chat, group credit, and group loot**.

## Prompt 29 status

Accepted in [PROGRESS.md](PROGRESS.md) as **Public world, party cave instances, transfers, and reconnection**.

## Prompt 30 status

Accepted in [PROGRESS.md](PROGRESS.md) as **Secure direct player trading**.

## Prompt 31 status

Accepted in [PROGRESS.md](PROGRESS.md) as **Complete functional UI, settings, and asset contracts**.
