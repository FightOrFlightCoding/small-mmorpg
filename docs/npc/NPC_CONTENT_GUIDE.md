# NPC content guide

Ordinary NPCs are JSON under `content/source/`. Do not add a runtime class, opcode, or UI scene.

## Loop

```powershell
powershell -File scripts/content.ps1 new npc --id npc.example_baker
# edit the NPC JSON: zone, home, route, dialogue, services
powershell -File scripts/content.ps1 new npc_route --id route.example_loop   # only if you need a new route
powershell -File scripts/content.ps1 validate
powershell -File scripts/content-build.ps1
```

Place the NPC on the zone `npcs` list. Add `client/content/dialogue/<id>.dialogue`, a `dialogue_map.json` key, a `visual_map.json` visual id, and an `asset_manifest.json` visual set. Commit generated `server/src/generated/content.ts` and `client/content/bundle.json`.

## Minimum NPC document

Required: `id`, `kind: "npc"`, `displayName`, `displayNameKey`, `visualId`, `zoneId`, `position`, `homePosition`, `routeId`, `interactionRange`, `dialogueId`, `services` (one or more). `position` and `homePosition` must match the zone row.

Production NPCs stay on `route.stationary` unless they need a cosmetic patrol. NPC-07 proof routes:

- `route.platform_short_loop` — two waypoints, last returns to first
- `route.platform_weighted` — named waypoints plus positive-weight edges

Waypoint `x`/`y` are offsets from `homePosition` and must stay inside `maxDistanceFromHome`.

## Services

| Service | What to author |
| --- | --- |
| `dialogue` | Hashed `dialogue.*` graph; client `.dialogue` is presentation |
| `quest_offer` / `offer` | `questIds` this NPC may offer |
| `quest_turn_in` / `turn_in` | `questIds` this NPC may complete |
| `offer_and_turn_in` | Combined bind |
| `vendor` | required `vendorId` |
| `inn` / `healer` / `cave_entrance` / `cave_exit` / `respec` | Existing owners; optional gates |

Optional gates on any service: `minLevel`, `classRequirements`, `requireParty`, `requiredQuestId` + `requiredQuestStatus`. The match evaluates them. The client never authorizes a service from `availableServiceIds`.

## Proof NPCs (NPC-07)

Copy these as templates. They required no protocol or runtime edits.

| File | Pattern |
| --- | --- |
| `npc.platform_greeter.json` | Dialogue only |
| `npc.platform_guide.json` | One option + weighted route |
| `npc.platform_quest.json` | Talk quest |
| `npc.platform_merchant.json` | Static vendor |
| `npc.platform_combined.json` | Dialogue + quest + vendor + loop |

Related: [NPC_DIALOGUE_GUIDE.md](NPC_DIALOGUE_GUIDE.md), [NPC_QUEST_BINDING_GUIDE.md](NPC_QUEST_BINDING_GUIDE.md), [NPC_VENDOR_GUIDE.md](NPC_VENDOR_GUIDE.md), [CONTENT_AUTHORING.md](../CONTENT_AUTHORING.md).
