# Foundation roadmap

Ordered work **after** this freeze. None of these phases is implemented here. Each future prompt must still read [AGENTS.md](../AGENTS.md), run Prompt 18 `scripts/test-all`, and refuse excluded features in [FOUNDATION_SCOPE.md](FOUNDATION_SCOPE.md).

| Order | Theme | Outcome | Depends on |
| --- | --- | --- | --- |
| 19 | Freeze, scope, audit | This document set + `tools/foundation-audit`. Prompt 18 behavior unchanged. | Prompt 18 accepted |
| 20 | Storage schema versions | Add gameplay `schemaVersion` to every canonical record with idempotent load of Prompt 18 blobs. | 19 |
| 21 | Remove architectural ID hard-coding | Runtime uses catalog iteration and content fields; `REQUIRED_IDS` / `STARTER_ZONE_ID` / `STARTER_ITEM_ID` / dialogue `do` IDs go away. Slice content IDs remain as data. | 19–20 |
| 22 | Character classes, level, experience | Data-defined classes; server XP; client never submits totals. | 21 |
| 23 | Attribute and skill points, abilities, hotbar | Optional allocation; server validates hotbar. | 22 |
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

## Prompt 19 status

Complete when [PROGRESS.md](PROGRESS.md) records **Freeze, scope, and audit the Prompt 18 baseline** as accepted.
