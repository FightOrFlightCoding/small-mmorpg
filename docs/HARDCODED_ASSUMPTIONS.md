# Hardcoded Prompt 18 assumptions

This freeze **does not remove** these occurrences. Later generalization phases must. `tools/foundation-audit` fails if a **new** runtime file (outside generated catalogs, `content/source`, and tests) mentions a listed ID without being added here.

Classification:

| Class | Meaning |
| --- | --- |
| Correct content reference | Authored JSON or generated catalog data. |
| Test fixture | Automated tests or the debug e2e driver. |
| Temporary Prompt 18 assumption | Presentation or content script tied to the slice loop. |
| Architectural hard-coding requiring later removal | Runtime/boot logic that will not scale to data-defined classes, worlds, or quests. |

## Content IDs

### `zone.starter`

| Location | Class |
| --- | --- |
| `content/source/zone.starter.json`, generated catalogs | Correct content reference |
| `server/src/domain/match_state.ts` `STARTER_ZONE_ID` / `STARTER_ZONE_LABEL` | Architectural hard-coding requiring later removal |
| `server/src/domain/chat.ts` `STARTER_ZONE_CHAT_ROOM` | Architectural hard-coding requiring later removal |
| `server/src/domain/instance.ts` | Architectural hard-coding requiring later removal |
| `server/src/rpcs/cave.ts` | Architectural hard-coding requiring later removal |
| `server/src/main.ts` log + `content.zones["zone.starter"]` | Architectural hard-coding requiring later removal |
| `server/src/nakama/starter_zone_match.ts` `content.zones["zone.starter"]` | Architectural hard-coding requiring later removal |
| `server/src/rpcs/character_bootstrap.ts` spawn zone | Architectural hard-coding requiring later removal |
| `client/scripts/content/content_catalog.gd` `REQUIRED_IDS` | Architectural hard-coding requiring later removal |
| `client/scripts/chat/zone_chat.gd` `ROOM_NAME` | Architectural hard-coding requiring later removal |
| `client/scripts/world/world.gd`, `world_hud.gd`, `protocol.gd`, `network_service.gd` defaults | Architectural hard-coding requiring later removal |
| `client/scripts/world/movement_sim.gd` `get_by_id("zone.starter")` | Architectural hard-coding requiring later removal |
| `client/content/asset_manifest.json` tileset map | Temporary Prompt 18 assumption |
| Server/client tests | Test fixture |

### `npc.elder`

| Location | Class |
| --- | --- |
| `content/source/npc.elder.json`, generated catalogs | Correct content reference |
| `client/content/dialogue_map.json`, `npc.elder.dialogue` | Temporary Prompt 18 assumption |
| `client/content/asset_manifest.json` visual set | Temporary Prompt 18 assumption |
| `client/scripts/content/content_catalog.gd` `REQUIRED_IDS` | Architectural hard-coding requiring later removal |
| `client/scripts/e2e/slice_journey.gd`, `cert_journey.gd` | Test fixture |
| Tests | Test fixture |

### `enemy.green_slime`

| Location | Class |
| --- | --- |
| Source + generated catalog, zone enemy spawn | Correct content reference |
| `content_catalog.gd` `REQUIRED_IDS` | Architectural hard-coding requiring later removal |
| `slice_journey.gd` / `slice_session.gd` / `cert_journey.gd` | Test fixture |
| `client/content/asset_manifest.json` visual set | Temporary Prompt 18 assumption |
| Tests | Test fixture |

Match code spawns enemies from zone content (`enemyDefinitionsFromContent`) rather than the string `enemy.green_slime`, but the live world still contains exactly one slime because the zone document does.

### `item.training_sword`

| Location | Class |
| --- | --- |
| Source + generated catalog | Correct content reference |
| `server/src/domain/inventory.ts` `STARTER_ITEM_ID` | Architectural hard-coding requiring later removal |
| `content_catalog.gd` `REQUIRED_IDS` | Architectural hard-coding requiring later removal |
| `client/scripts/e2e/cert_journey.gd` | Test fixture |
| `client/content/asset_manifest.json` item icons | Temporary Prompt 18 assumption |
| Tests | Test fixture |

### `item.slime_gel` / `item.iron_sword` / `quest.slime_problem`

| Location | Class |
| --- | --- |
| Source + generated catalog (quest consume/reward lists) | Correct content reference |
| `npc.elder.dialogue` `do QuestService.request_*("quest.slime_problem"…)` | Temporary Prompt 18 assumption |
| `server/src/domain/match_loop.ts` complete notice for `quest.slime_problem` | Temporary Prompt 18 assumption |
| `content_catalog.gd` `REQUIRED_IDS` | Architectural hard-coding requiring later removal |
| `client/content/asset_manifest.json` item icons | Temporary Prompt 18 assumption |
| E2E driver constants | Test fixture |
| Tests | Test fixture |

Turn-in apply already uses quest definition rewards from content, not a second hardcoded gold constant in `quest_reward.ts`. The **25 gold** and iron sword still exist as authored quest data. The complete `SYSTEM_MESSAGE` copy “Iron Sword and 25 gold” remains hardcoded for `quest.slime_problem` only.

## Structural hard-coding (not always an ID string)

| Assumption | Where | Class |
| --- | --- | --- |
| One selected character per account; three live slots | `roster` + `selection` ticket | Architectural (Prompt 21). ID hard-coding of `zone.starter` remains later. |
| Temporary equipment tags `main_hand`/`off_hand`/`head`/`chest`/`legs`/`feet` | content `equipment_slot` docs; runtime iterates catalog | Temporary Foundation tags. Do not hard-code a final equipment type enum in protocol. |
| Inventory capacity fallback 20 | `INVENTORY_CAPACITY`; live capacity is `player.base.inventoryCapacity` | Fallback remains architectural; content now owns the live value |
| One public match module `starter_zone` | `InitModule`, registry singleton | Architectural hard-coding requiring later removal |
| Player respawn delay 3 s default | `PLAYER_RESPAWN_DELAY_SEC` / match_state fallback | Temporary Prompt 18 assumption (content has no player respawn field in source) |
| In-combat timeout 5 s (50 ticks) | `IN_COMBAT_TIMEOUT_TICKS` | Temporary Prompt 25 assumption |
| Defense mitigation `floor(raw * 100 / (100 + defense))` | `evaluateCombatFormula` | Temporary Prompt 25 formula; defense 0 keeps Prompt 18 4/2 hits |
| Threat `floor(amount * weight)`; switch if other > current × `threatSwitchRatio` | `threat.ts` | Temporary Prompt 26 formula. Heal threat only when the profile sets `generateHealThreat`. |
| Loot LCG seeded by `kill:<instanceId>:<deathCount>` | `loot_table.ts` `hashSeed` / `lcgRng` | Temporary Prompt 26; no Node `crypto` in the Nakama runtime |
| Player AABB 12 px | `PLAYER_HALF_EXTENT` | Temporary Prompt 18 assumption |
| Dialogue example balloon path | `DialoguePresenter.BALLOON_SCENE` | Temporary Prompt 18 assumption |
| Movement fallback bounds 16,16,1248×736 | `movement_sim.gd` defaults | Temporary Prompt 18 assumption |
| Max level / XP / attributes are content-defined | `level_curve` / `class_progression` catalogs | Temporary test curve (`maxLevel` 5). Ability unlock is Prompt 24. |
| Item categories are content fields (`weapon`, `armor`, `consumable`, `quest`, `material`, `miscellaneous`) | item schema + runtime validation | Prompt 23. Protocol does not enumerate item definition ids. |
| World dimensions from `zone.starter` JSON | Correct content for the slice; runtime still assumes that one zone | Architectural hard-coding requiring later removal |
| Systems lab zone id `test.zone.systems_lab` | `server/src/domain/gm.ts` `SYSTEMS_LAB_ZONE_ID`; `client/content/asset_manifest.json` tileset map | Development-only template. Production generate omits it. GM `open_cave` prefers it only when present in the running catalog. |

## Out of scope for this file

`client/addons/**` TODOs and vendor strings are not project assumptions. Tests under `server/tests` and `client/tests` are fixtures by definition and are not duplicated row-by-row.
