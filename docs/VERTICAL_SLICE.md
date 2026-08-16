# Vertical slice — definition of done

This is the only **Prompt 18** gameplay scope. It is accepted and frozen. Foundation v1 features beyond this loop are classified in [FOUNDATION_SCOPE.md](FOUNDATION_SCOPE.md) and must not be implemented until a later phase names them.

Related: [ARCHITECTURE.md](ARCHITECTURE.md), [NETWORK_PROTOCOL.md](NETWORK_PROTOCOL.md), [SECURITY_MODEL.md](SECURITY_MODEL.md).

## Player-facing loop

A new player can, without developer console cheats:

1. Launch the Godot client and see a non-blocking boot/login state (success or a visible error).
2. Authenticate (device auth is sufficient) and receive a single character record created by the server.
3. Enter the one starter-zone authoritative match.
4. Move. The server rejects impossible movement; the client predicts locally and reconciles to the server position.
5. Fight the slice’s enemy type. The client sends an attack intention; the server applies damage, cooldowns, and death.
6. Loot a dropped item with a unique `requestId`. Repeating the same `requestId` does not duplicate the grant.
7. See the item in the GLoot-backed view that mirrors server inventory.
8. Equip an allowed item. The server accepts or rejects; the client does not invent stats.
9. Talk to the slice NPC through Dialogue Manager presentation driven by server-offered dialogue IDs and choices.
10. Complete the slice quest. The server advances quest state and grants the slice currency through the wallet.
11. Disconnect, relaunch, authenticate, and recover inventory, equipment, quest state, currency, and last checkpointed position.

Prompt 21 keeps this loop. Debug device auth and `character_bootstrap` still work. Graphical and e2e joins send a server-issued `selectionTicket`. Email/password and extra character slots are additive.

## Required automated checks

These must exist and pass before the slice is marked complete in [PROGRESS.md](PROGRESS.md):

| ID | Check |
| --- | --- |
| VS-T1 | Domain tests reject malformed JSON, unknown opcodes, unknown fields (strict messages), and invalid content IDs. |
| VS-T2 | Movement validation rejects spoofed teleports and overspeed steps from recorded fixtures. |
| VS-T3 | Combat resolution ignores client-supplied damage/health; only server formulas change HP. |
| VS-T4 | Duplicate `requestId` on loot and quest reward is a no-op after the first success. |
| VS-T5 | Inventory/equipment mutations require server authority; client-shaped grant payloads are rejected. |
| VS-T6 | Quest cannot skip to complete from an illegal stage. |
| VS-T7 | `nk.multiUpdate` (or an equivalent tested adapter fake) is used for inventory-plus-wallet grants. |
| VS-T8 | GdUnit4 tests cover boot error copy and content-ID catalog mapping. |
| VS-T9 | Protocol version mismatch is rejected with a typed error, not applied. |
| VS-T10 | Headless two-client journey (`scripts/test-e2e`) authenticates Alice and Bob, joins the starter zone, proves peer visibility and movement, completes the quest loop, reconnects, and rejects a duplicate turn-in. |

## Required manual checks

| ID | Check |
| --- | --- |
| VS-M1 | Two clients in the starter zone see each other’s server-corrected positions. |
| VS-M2 | Killing the slice enemy drops loot once; two rapid pickup clicks with one `requestId` grant once. |
| VS-M3 | Completing the quest credits currency once across reconnect. |
| VS-M4 | Visible error if Nakama is down; no infinite spinner. |
| VS-M5 | Reloading the client after a checkpoint restores position inside the starter zone, not at a hardcoded origin unless that origin is the checkpoint. |

## Explicitly out of slice

If a change implements any of the following, it is out of scope even if it would help the loop: extra zones, character slots, guilds, parties, trading, auction houses, crafting, PvP, monetization, procedural generation, open-world streaming, extra gameplay frameworks.

## Done

The slice is done when VS-T1–VS-T10 and VS-M1–VS-M5 pass, `docs/PROGRESS.md` records the completing phase as accepted, `scripts/test-all` passes from a documented setup, and no client-authoritative outcome remains on the accepted path.
