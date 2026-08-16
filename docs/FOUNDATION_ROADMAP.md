# Foundation roadmap

Prompt 19 (catalogs/audit), Prompt 20 (versioned content and save schemas), and Prompt 21 (authentication, slots, and class selection) are accepted. Prompt 21 as issued supersedes the earlier “remove ID hard-coding” label for that number. Prompt 22 as issued includes XP, derived stats, and attribute allocation (the earlier roadmap split that named allocation as Prompt 23 is superseded for those items).

| Order | Theme | Outcome | Depends on |
| --- | --- | --- | --- |
| 19 | Freeze, scope, audit | This document set + `tools/foundation-audit`. Prompt 18 behavior unchanged. | Prompt 18 accepted |
| 20 | Versioned content and save schemas | Content-package manifest, client/server bundles, gameplay `schemaVersion` on canonical player records, idempotent Prompt 18 load. | 19 |
| 21 | Real authentication, character slots, class selection | Email/password accounts; three slots; content classes; selection tickets; Prompt 18 migrate into slot 1. Architectural ID hard-coding remains later. | 19–20 |
| 22 | Character level, experience, derived stats, attribute allocation | Server XP, level curves, stat pipeline, allocate command; skill points persist. Ability unlock is later. | 21 |
| 23 | Abilities and hotbar | Spend skill points / unlock abilities; server validates hotbar. | 22 |
| 24 | Public village-and-fields world | One public-world template (may still be one match). No sharding. Respawn bind still later. | 21 |
| 25 | Temporary parties (max 5) and party chat | Server membership; group credit hooks; party channel. Zone chat remains. | 24 |
| 26 | Cave instances and transfer tickets | Private matches; party-shared instance; one-time server tickets; reconnect restores the correct match; empty-cave grace. | 25 |
| 27 | Generalized target PvE | Resources, casts, cooldowns, status, data-defined enemies. Keep intention-only client. | 23, 24 |
| 28 | Merchants | Server prices and stock; gold `multiUpdate`; audit ids. | 20, 24 |
| 29 | Inn and respawn binding | Server bind point; death uses bind, not a hardcoded pond spawn. | 24, 26 |
| 30 | Secure direct trade | Server trade state machine; no client-complete; idempotent. | 25, 28 |
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
