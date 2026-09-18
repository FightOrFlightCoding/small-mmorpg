# NPC test plan (NPC-05)

NPC-05 records session-gated quest accept/turn-in through canonical `QuestService`, quest dialogue states, and character-specific markers. NPC-04 coverage remains.

## Automated coverage

| Check | Owner | Expected proof |
| --- | --- | --- |
| In-range interaction | `server/tests/interaction.test.ts` | `INTERACT` returns `ok` and a session. |
| Out-of-range rejection | `interaction.test.ts`, `npc_quest.test.ts` | `out_of_range`. |
| Unknown NPC | `interaction.test.ts` | `invalid_target`. |
| Dead character | `interaction.test.ts` | `player_dead`. |
| Link-dead character | `interaction.test.ts` | `link_dead`. |
| Dialogue start | `interaction.test.ts`, `dialogue.test.ts` | Current node id, allowed option ids, available service ids, expiry. |
| Valid choice | `interaction.test.ts`, `dialogue.test.ts` | Next node id. |
| Invalid choice | `interaction.test.ts`, `dialogue.test.ts` | `invalid_option`; node unchanged. |
| Expired session | `interaction.test.ts` | `session_expired`. |
| Session replay | `interaction.test.ts` | Same `requestId` replays session fields without re-applying talk objectives. |
| Multiple players | `interaction.test.ts`, `npc_movement.test.ts` | Independent sessions on one NPC. |
| Movement pause | `npc_movement.test.ts` | First `INTERACT` sets `paused` and `SNAPSHOT.npcs` includes the plan. |
| Movement resume | `npc_movement.test.ts` | Last close resumes the route. |
| Rate limiting | `interaction.test.ts` | Ninth interact in the window is `rate_limited`. |
| Right-click UI | `interaction_client_test.gd` | `interact_pointer` defaults to right mouse; `try_interact_at` sends `INTERACT`. |
| No duplicate signals | `interaction_client_test.gd` | Window and presenter connect once; one `dialogue_opened`. |
| Dialogue graphs | `tools/content-build/tests/content-build.test.ts` | One-line and two-line graphs compile; missing next nodes and scripts fail. |
| Quest available | `npc_quest.test.ts` | Dialogue `available` / start node; `!` marker. |
| Prerequisite missing | `npc_quest.test.ts` | `missing_prerequisite`; dialogue state `prerequisite_missing`. |
| Accept | `npc_quest.test.ts` | Session required; canonical `accepted`; accepted dialogue; `·` or `?`. |
| Duplicate accept | `npc_quest.test.ts` | Same `requestId` replays `accepted`; new id is `already_accepted`. |
| In progress / ready | `npc_quest.test.ts` | Dialogue states and marker priority `?` over `!` over `·`. |
| Turn in | `npc_quest.test.ts` | Rewards once; completion dialogue; marker cleared. |
| Duplicate turn-in | `npc_quest.test.ts` | Same `requestId` replays; new id is `already_completed`. |
| Wrong NPC | `npc_quest.test.ts` | `invalid_service`. |
| Invalid session | `npc_quest.test.ts` | `invalid_session`. |
| Character-specific markers | `npc_quest.test.ts` | Two players differ; `SNAPSHOT` omits markers. |
| Reconnect persistence | `npc_quest.test.ts` | `FULL_STATE` restores quests and markers. |
| Generic `offer_and_turn_in` | `npc_quest.test.ts`, content-build | Herald talk quest completes through one bind. |

## Baseline results and reproducible commands

The current checkout uses Node 22. Directory-form `node --test dist/tests` wrappers can fail before discovery. Direct compiled-file glob invocation is the authoritative path:

```bash
bash scripts/test-audit.sh
(cd tools/content-build && npx tsc -p tsconfig.json && node --test dist/tests/*.test.js)
(cd server && npx tsc -p tsconfig.test.json && node --test dist-test/tests/*.test.js && npm run typecheck && npm run build)
(cd auth-gateway && npx tsc -p tsconfig.test.json && node --test dist-test/tests/*.test.js)
GODOT_BIN=godot bash scripts/test-client.sh
```

## Manual regression

After this lands on `origin/main`, close Godot and run `powershell -File scripts/local-play.ps1 -Branch main`, then verify: elder `!` / `·` / `?` markers follow the local character, accept and turn-in still speak authored lines, rewards remain server-granted, and a second client at the same NPC can show a different marker.
