# NPC dialogue guide

Dialogue graphs are hashed `dialogue` documents. The client localizes and presents them. The server returns node ids, allowed option ids, and available service ids.

## Authoring

```powershell
powershell -File scripts/content.ps1 new npc --id npc.example_baker
```

That writes a starter `dialogue.<npcId>` graph. Edit nodes in `content/source/dialogue.<id>.json`. Mirror spoken lines in `client/content/dialogue/<npcId>.dialogue` and map the id in `client/content/dialogue_map.json`.

## Graph rules

- One or more nodes. `startNodeId` must exist.
- Each node has one or more `lines` (`text`, optional `textKey`).
- Zero or more `options` with `id`, `text`, `nextNodeId`, optional `conditions`.
- Optional `entry` candidates pick the opening node from server conditions (`offered_quest_status`, `quest_status`, `min_level`, `class_id`, `has_item`).
- No arbitrary scripts in the hashed graph. Client `.dialogue` `do` lines may call existing services (`QuestService`, `VendorService`, …) but those still send ordinary match opcodes.

## Patterns

**Dialogue only (no options)** — `dialogue.npc.platform_greeter`: a single `start` node with lines.

**One optional response** — `dialogue.npc.platform_guide`: `start` has exactly one option that jumps to `farewell`.

**Quest-aware entry** — elder / `dialogue.npc.platform_combined`: `entry` selects `completed`, `ready`, `in_progress`, or `start` from offered-quest status.

The client never submits node text, a completed quest, or a gold result as a dialogue choice. `DIALOGUE_CHOOSE` is `{ interactionSessionId, optionId, requestId }`. Unknown, gated, or expired options are `invalid_option`.
