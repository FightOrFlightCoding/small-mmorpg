# Foundation v1 ready

Prompt 35 certification that this repository is ready for original gameplay content and assets. No new gameplay systems were added in this phase.

Related: [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md), [CONTENT_CREATION_QUICKSTART.md](CONTENT_CREATION_QUICKSTART.md), [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md), [RECOVERY_RUNBOOK.md](RECOVERY_RUNBOOK.md), [FOUNDATION_SCOPE.md](FOUNDATION_SCOPE.md), [PROGRESS.md](PROGRESS.md).

Suggested release tag (do not create until the working tree is clean and the user approves): **`foundation-v1`**.

## Versions

| Item | Value |
| --- | --- |
| Protocol version | **1** |
| Content package | `vibecode.foundation` **1.0.0**, gameplay `schemaVersion` **1** |
| Content hash | `4eeb205a3748b3cd71053bcc217cb017ae69f1f1d4753238ca4c03da9cce35c1` |
| Save schema | `SAVE_SCHEMA_VERSION` **1** |
| Client version | `1.0.0` (`MatchProtocol.CLIENT_VERSION`) |

Pinned tools (do not upgrade without a pin-change phase): Godot **4.7.1** (`4.7.1.stable.official.a13da4feb`), Nakama **3.40.0**, PostgreSQL **16.15**, `nakama-runtime` **1.47.0**, Nakama Godot SDK **3.4.0**, GLoot **3.0.2**, Dialogue Manager **3.10.5**, GdUnit4 **6.2.0**, TypeScript **5.8.3**, Ajv **8.17.1**. Ledger: [DEPENDENCIES.md](DEPENDENCIES.md).

## Accepted features

Everything classified **Existing and accepted** in [FOUNDATION_SCOPE.md](FOUNDATION_SCOPE.md), including:

- Prompt 18 village-and-fields vertical slice (frozen poses: elder **160,320**, slime **960,400**)
- Email/password accounts, three character slots, content-defined classes, selection tickets
- Server-authoritative XP, levels, derived stats, attribute and skill-point spend, abilities, casts, resources, effects
- Inventory, equipment, gold, transaction core
- One combat pipeline, targeting, PvE death/respawn, data-defined enemies, AI, loot, bosses
- NPC services, dialogue, quests, vendors, inn bind/heal
- Temporary parties (max 5), party chat, group credit/loot
- One public world, party caves, one-time transfer tickets, canonical location, reconnect
- Nearby online same-match direct trade
- Functional UI, settings, visual/audio contracts
- Content CLI, development-only systems lab, server-authorized GM tools
- Environments, handshake, maintenance, backups, recovery
- Security matrix, fuzz, split rate limits, capacity/soak, five-client certification

## Explicit exclusions

Must not be present and were not added: public-world sharding, extra overworlds, open-world streaming, guilds, auction houses, crafting, PvP, monetization, procedural generation as a world system, custom SQL tables, client-authoritative simulation/rewards, QuestSystem / LimboAI / netfox / RPG database plugins.

Postponed (not v1): mail, offline trade, friends lists, extra dungeons, password-recovery email, final art and writing.

## Automated test totals

Recorded from the Prompt 35 gate run (2026-08-19).

| Gate | Result |
| --- | --- |
| Content-build | **23/23**, hash `4eeb205a3748b3cd71053bcc217cb017ae69f1f1d4753238ca4c03da9cce35c1` |
| Foundation audit | `FOUNDATION_AUDIT_OK` (26 storage records, 31 client opcodes, 15 server opcodes, 24 RPCs) |
| Server domain tests | **446/446**, `tsc --noEmit` clean |
| Client GdUnit | **204/204**, 0 orphans, `SHELL_LOGIN` |
| Prompt 18 e2e | `E2E_SLICE_OK` |
| Five-client journey | `CERT_FIVE_OK` then backend restart then `CERT_FIVE_RESUME_OK` (stamp `1787139186964`) |
| Capacity | `reports/capacity.cert.json` (20 public-world characters, 2×5 caves, 0 ghosts, cave cleanup ok) |
| Soak | `reports/soak.cert.json` (200 ticks, 4 bots, 0 errors, gold unchanged; 3600 s is manual) |
| Backup restore | dump local `nakama` → `nakama_restore_drill`, **20** public tables |
| Existing saves | fixtures `p18-alice`, `p20-v1-alice`, `p21-class-alice`, `current-v1-alice` migrate with gold **25** and one completed slime quest / one iron sword |
| Release export | command exists; this workstation had no Godot 4.7.1 Windows export templates |

## Five-client journey

Debug-only `scripts/test-cert-journey.ps1` (`--cert-five` / `--cert-five-resume`). Five device accounts create characters (three `test.class.vanguard`, two `test.class.arcanist`), share `zone.starter`, talk, accept **Slime Problem**, fight, loot, turn in, equip iron sword, buy and sell a potion, inn rest/bind, buy and equip `item.cert_mail`, form one party, party-chat, enter one cave, reconnect a member into that cave, defeat the cave boss once (first HP wrap; cave `respawnDelay` is 0), allocate an attribute, unlock `test.ability.small_heal`, exit, complete an item-and-gold trade, disband, log out, restart Nakama and Postgres, and resume with persistent quest, gold, and item state.

## Content-only proof

A temporary mini-pack was added **without** a new opcode, storage record type, persistence permission, transaction mechanism, world-lifecycle change, or hard-coded runtime handling of the new IDs. Completing `quest.cert_scout` uses existing `QUEST_ACCEPT` / `ATTACK` / `QUEST_TURN_IN` / `VENDOR_BUY`.

Files added or edited for the pack:

| Path | Change |
| --- | --- |
| `content/source/test.class.warden.json` | class variation |
| `content/source/test.progression.warden.json` | class progression |
| `content/source/test.ability.cert_strike.json` | ability (`direct_damage`) |
| `content/source/item.cert_mail.json` | chest armor |
| `content/source/enemy.cert_scout.json` | ordinary enemy |
| `content/source/loot.cert_scout.json` | loot table |
| `content/source/npc.cert_quartermaster.json` | NPC |
| `content/source/quest.cert_scout.json` | short kill quest |
| `content/source/vendor.cert_quartermaster.json` | vendor stock |
| `content/source/spawn.starter.cert_scout.json` | spawn placement |
| `content/source/zone.starter.json` | place NPC at 720,640 and scout at 1080,140 (elder/slime poses unchanged) |
| `client/content/dialogue/npc.cert_quartermaster.dialogue` | dialogue |
| `client/content/dialogue_map.json` | map entry |
| `client/content/visual_map.json` | visual IDs |
| `client/content/asset_manifest.json` | visual sets / icons |
| `server/src/generated/content.ts` | generated |
| `client/content/bundle.json` | generated |

Runtime, protocol, storage schemas, and migrations were not extended for these IDs. Tests under `server/tests/cert_content.test.ts` prove the quest completes on existing opcodes.

## Asset-replacement proof

Placeholder swaps through `client/content/asset_manifest.json` (and one new stream file) only. No gameplay script changes.

| Category | Change |
| --- | --- |
| Character | `visual_set.player.base` sprite → `visual.class_vanguard` |
| Enemy | `visual_set.enemy.proof_critter` sprite → `visual.enemy_test_melee` |
| NPC | `visual_set.npc.proof_giver` sprite → `visual.npc_herald` |
| Item icon | `item.proof_token` → `visual.item_potion` |
| Ability icon | `test.ability.small_heal` → `visual.ability_buff_icon` |
| World tile | `test.zone.systems_lab` tileset → `visual.zone_starter` |
| Sound effect | `audio.world.hit` → `res://assets/audio/cert_hit.wav` |

Covered by `client/tests/app/asset_cert_test.gd`.

## Remaining known limitations

See [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md). Architectural Prompt 18 ID hard-coding that is still catalogued in [HARDCODED_ASSUMPTIONS.md](HARDCODED_ASSUMPTIONS.md) is not a content-authoring blocker: new classes, items, enemies, quests, and vendors are data.

## Repository audit (Prompt 35)

| Check | Result |
| --- | --- |
| Foundation-path TODOs in `client/scripts` and `server/src` | None |
| Canonical `permissionWrite` | `0` on every catalogued record |
| Client storage writes | None (`write_storage` absent from project scripts) |
| Vendor addons | Do not modify `client/addons/` |
| Secrets | Gitignored `infra/.env.*`; committed examples use `REPLACE_ME`; local Nakama `defaulthttpkey` is not a production secret |
| Test-content leakage | `test.zone.systems_lab` and lab NPCs are `developmentOnly`. Intentional production fixtures: Prompt 18 slice IDs, Prompt 32 `proof_*`, Prompt 35 `cert_*` / `test.class.warden` |
| Duplicate opcodes | Audit compares TS + GDScript tables |
| Storage catalog | 26 records in `expected.json` / [STORAGE_CATALOG.md](STORAGE_CATALOG.md) |
| Excluded features | No guild, auction, crafting, PvP, or sharding modules |
| README setup | `scripts/setup.ps1` / `setup.sh` |
| Release export | `scripts/export-client-release.ps1` + `client/export_presets.cfg`. Failed here: missing `4.7.1.stable` Windows templates. Not a missing project feature. |
