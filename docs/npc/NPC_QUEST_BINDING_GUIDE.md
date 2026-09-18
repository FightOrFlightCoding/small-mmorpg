# NPC quest binding guide

Quest offer and turn-in reuse canonical `quest.ts` / `quest_reward.ts`. Bindings are NPC content, not a second quest engine.

## Bind types

| Service | Role |
| --- | --- |
| `quest_offer` / `offer` | NPC may accept `QUEST_ACCEPT` for listed `questIds` |
| `quest_turn_in` / `turn_in` | NPC may accept `QUEST_TURN_IN` |
| `offer_and_turn_in` | Both; presented as offer and turn-in when visible |

Set `acceptNpcId` / `turnInNpcId` on the quest document to the same NPC ids. Objectives stay the existing types (`talk_to_npc`, `kill_enemy`, `acquire_item` / `collect_item`, `enter_location`, `defeat_boss`, `return_to_npc`).

## Match rules

`QUEST_ACCEPT` and `QUEST_TURN_IN` require `{ interactionSessionId, npcInstanceId, questId, requestId }`. The match checks the live session, NPC bind, range/alive/link-dead/transfer, prerequisites, and server objectives. Accept is idempotent. Rewards apply once through the existing transaction boundary. Client `status` / gold / item grants are protocol rejections.

## Dialogue and markers

Entry nodes should key off `offered_quest_status`. Markers `!` / `?` / `·` travel on `FULL_STATE` and `QUEST_STATE` only (never `SNAPSHOT`). Priority: ready, available, active incomplete, none.

## Content-only examples

- `npc.platform_quest` + `quest.platform_talk` (talk, gold 1 / XP 1)
- `npc.platform_combined` + `quest.platform_combined`
- Elder + `quest.slime_problem` (Prompt 18; do not change rewards)

A new quest NPC is: NPC services + quest document + dialogue entry nodes + zone placement. No new opcode.
