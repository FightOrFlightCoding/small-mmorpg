# NPC recovery runbook

NPC movement is match-lifetime. Quest logs, inventory, and gold are persistent character records. Do not restore an NPC pose from backup.

Related: [RECOVERY.md](../RECOVERY.md), [NPC_PLATFORM_READY.md](NPC_PLATFORM_READY.md).

## Disconnect and link-dead

Unexpected socket loss keeps the avatar for **10 seconds** (`LINK_DEAD`). The interaction session is `invalidated`. Cosmetic patrols resume when no usable sessions remain. The player cannot interact, buy, or choose dialogue while link-dead. After the deadline the avatar despawns; quest and purchase records already persisted stay.

Safe Return to Character Select / logout persist quests, inventory, equipment, and progression, then remove the player. The session does not survive.

## Reconnect and resync

Public-world join and `RESYNC_REQUEST` send `FULL_STATE` with current NPC plans, the recipient’s quests, markers, inventory, and wallet. NPC pose may differ from the client’s last interpolation. Gameplay records must match storage.

## Match or server restart

A new `starter_zone` match rebuilds NPCs at `homePosition` and ticks routes from a fresh LCG. Completed quests and purchased items load from character storage. Players may see the steward restart a loop. That is cosmetic.

## Zone transfer

Issued/pending transfer rejects `INTERACT`. Leaving the match invalidates the session and resumes the NPC for anyone still present. Destination join loads persistent records; it does not resume the old session.

## Character switch, soft delete, restore, export, deletion

| Event | NPC session / pose | Quest / merchant result |
| --- | --- | --- |
| Character switch | New character has no session | Other character’s records stay isolated |
| Soft delete + restore | No session | Quest log, inventory, gold unchanged; no regrant |
| Account export | Omitted | Characters include quests, inventory, gold. No `rngState` |
| Account deletion / purge | n/a | Records gone; recreate does not inherit |

## Content mismatch

If `contentHash` drifted after an NPC content change, restore the matching generated pair (`server/src/generated/content.ts` and `client/content/bundle.json`) or update every client. Joins fail with `content_mismatch` until hashes agree. Do not migrate saves backward.

## Interrupted vendor buy

Failed `nk.multiUpdate` is `persist_failed`. Gold and inventory stay unchanged. Retry with a new `requestId` after the session is valid. Duplicate successful `requestId` must not grant twice.

## Operator checks

1. `powershell -File scripts/local-play.ps1 -Branch main`
2. Confirm elder/slime Prompt 18 path still completes.
3. Confirm `npc.platform_combined` walks, pauses on talk, sells the potion once, and restarts at home after Nakama recreate.
