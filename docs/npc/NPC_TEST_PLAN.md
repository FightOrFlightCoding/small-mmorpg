# NPC test plan (NPC-04)

NPC-04 records server-owned interaction sessions, content dialogue graphs, right-click `interact_pointer`, the reusable NPC window, and pause/resume of cosmetic movement while any live session exists.

## Automated coverage

| Check | Owner | Expected proof |
| --- | --- | --- |
| In-range interaction | `server/tests/interaction.test.ts` | `INTERACT` returns `ok` and a session. |
| Out-of-range rejection | `interaction.test.ts` | `out_of_range`. |
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

After this lands on `origin/main`, close Godot and run `powershell -File scripts/local-play.ps1 -Branch main`, then verify: right-click opens the NPC window, one-line and two-line NPCs speak their authored lines, optional choices advance on the server, two clients can talk to the same NPC, and movement pauses while anyone is in session.
