# NPC platform ready (NPC-07)

**Last accepted gameplay/progression phase:** PROG-15.  
**Last accepted NPC phase:** NPC-06 — Merchant integration.  
**Current requested phase:** NPC-07 — Lifecycle, security, and final certification.  
**Suggested release tag:** `npc-platform-v1` (not created; needs user approval).

NPC-07 hardens and certifies NPC-01 through NPC-06. It does not add NPC types, opcodes, storage collections, RPCs, vendor addons, or a second dialogue/quest/merchant engine.

## Definition of complete

Creating an ordinary NPC is content work:

1. Author an `npc.*` definition.
2. Choose `homePosition` and `routeId`.
3. Assign a hashed `dialogue` graph.
4. Assign quest bindings and/or merchant `vendorId` when needed.
5. Place the NPC on a zone document.
6. Map presentation (`visual_map.json`, `asset_manifest.json`, `dialogue_map.json`).
7. `content validate` then `content build`.
8. The NPC appears and functions.

An ordinary dialogue, quest-giver, or merchant NPC must not require a new protocol opcode, storage collection, UI scene, NPC script, transaction mechanism, quest handler, or movement implementation.

## Certified behavior

- NPCs cannot enter combat and are not gameplay collision.
- Cosmetic movement is server-owned, synchronized, and match-lifetime only.
- Dialogue, optional responses, quest offer/turn-in, and merchant purchasing work through existing owners.
- Multiple players may interact at once; the first live session pauses movement and the last close/expiry/invalidation resumes it.
- Quest and merchant results persist. NPC pose does not.
- A new NPC is content-only. Prompt 18 elder spoken lines, slime rewards, and merchant prices are unchanged.

## Content-only proof

| ID | Role |
| --- | --- |
| `npc.platform_greeter` | Dialogue only (no options) |
| `npc.platform_guide` | Single dialogue option on `route.platform_weighted` |
| `npc.platform_quest` | Quest offer/turn-in for `quest.platform_talk` |
| `npc.platform_merchant` | Merchant for `vendor.platform_kiosk` |
| `npc.platform_combined` | Dialogue + quest + merchant on `route.platform_short_loop` |

No runtime or protocol change was required for that set.

## Two-client journey (manual after `origin/main`)

Alice and Bob on `zone.starter`:

1. Both see the same moving `npc.platform_combined`.
2. Walk through it; a slime can occupy the same space.
3. The nearby slime ignores it.
4. Combat cannot target it.
5–6. Alice and Bob open dialogue together.
7. The NPC pauses.
8. Alice chooses **Not now.**
9–10. Bob accepts, talks, and turns in `quest.platform_combined`.
11–13. Alice opens the merchant and buys one potion; gold and inventory update once.
14–16. Alice disconnects with the shop open; her session invalidates; the NPC resumes.
17. Reconnect restores Bob’s completed quest and Alice’s potion/gold.
18. After a complete server/match restart the steward may restart at home. Gameplay records are unchanged.

Automated coverage: `server/tests/npc_platform.test.ts`, `npc_security.test.ts`, `npc_lifecycle.test.ts`.

## Suggested tag

`npc-platform-v1`. Do not create the tag until the user approves.
