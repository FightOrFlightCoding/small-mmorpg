# Known limitations

Binding list of Foundation v1 limits. This is not a backlog of accidental defects. Related: [FOUNDATION_SCOPE.md](FOUNDATION_SCOPE.md), [HARDCODED_ASSUMPTIONS.md](HARDCODED_ASSUMPTIONS.md), [FOUNDATION_READY.md](FOUNDATION_READY.md).

## Product exclusions

Not in this repository’s foundation track:

- Public-world sharding or extra public overworlds
- Open-world streaming
- Guilds
- Auction houses
- Crafting
- Player-versus-player combat
- Monetization, cash shop, real-money trade
- Procedural generation as a world system
- Custom SQL tables
- Client-authoritative simulation or rewards
- Third-party gameplay frameworks (QuestSystem, LimboAI, netfox, RPG database plugins)

## Postponed after v1

- Mail and offline trade
- Friends lists and social directories
- Dungeons beyond party caves
- Account cosmetics / appearance editor
- Password-recovery email (operators assist in the Nakama console)
- Final class names, lore, balance, and commissioned art

## Runtime and persistence

- One shared public match (`zone.starter`), maximum **8** concurrent players. Empty public matches shut down after **30** seconds.
- Party caves cap at **5** members. Empty caves terminate after **60** seconds.
- Temporary parties are not a permanent social system. Idle TTL is **4 hours**. Disconnect grace is **60** seconds.
- Health, cooldowns, active casts, status effects, ground loot, and live enemy AI reset with the match (or after the **5** second pose grace on a new join). Bind point, inventory, equipment, gold, quests, and progression persist.
- `spawn.cave.boss` / `zone.cave` use `respawnDelay` **0**, so the cave boss returns immediately after a kill. Headless `--cert-five` treats the first HP wrap (low health then max) as the unique defeat so credit is not farmed.
- Inventory item locks and live trades must not survive a completed logout; interrupted trades recover on rejoin or via authorized GM `cancel_trade`.
- `SAVE_SCHEMA_VERSION` is **1**. There is no supported downgrade path.

## Content and presentation

- Catalog IDs under `test.*`, `proof_*`, and `cert_*` are Foundation certification fixtures, not final game writing. They ship in the **production** payload on purpose (except `developmentOnly` lab documents).
- `item.test_leather_cap` is an intentional unused-definition fixture for `content unused`.
- `test.zone.systems_lab` is omitted from production bundles unless `--include-dev`.
- Visuals are Kenney RPG Base plus labeled primitives. Missing visual IDs show a magenta fallback and must not crash.
- Temporary equipment tags are `main_hand`, `off_hand`, `head`, `chest`, `legs`, `feet`.
- The test level curve maxes at level **5**.
- The Prompt 18 turn-in system message still hard-codes “Iron Sword and 25 gold” for `quest.slime_problem` only. Other quests use generic complete copy. Catalogued in [HARDCODED_ASSUMPTIONS.md](HARDCODED_ASSUMPTIONS.md).
- Architectural ID strings such as `zone.starter` remain in match/chat/boot code. New ordinary content does **not** require editing those files.

## Security and operations

- Device authentication and Alice/Bob shortcuts exist in **debug** builds only.
- Local Nakama HTTP key `defaulthttpkey` and console `admin` / `password` are insecure defaults, not production secrets.
- Production registration is closed (`infra/environments/production.json`).
- Staging and production forbid volume destroy / data reset.
- Automated soak is **200** ticks. Manual certification is `scripts/test-soak.ps1 -DurationSec 3600`.
- Public-world match cap stays **8**; the capacity scenario simulates 20 characters in-process with extras, not 20 live Godot clients.

## Client

- Release exports refuse `--e2e-slice` and `--cert-five`.
- A Windows desktop export (`scripts/export-client-release.ps1`) needs Godot **4.7.1** export templates installed on the workstation. The templates are not in this repository. Install with `scripts/install-export-templates.ps1` or Editor → Manage Export Templates. Headless export uses the non-console Godot binary. Godot 4.7.1 may print ObjectDB leaks or even `STATUS_ACCESS_VIOLATION` after `savepack` completes; the script treats a produced `small-mmorpg.exe` as success.
- A debug GM panel never grants authority; `gm_command` is server-allowlisted and default-disabled.
- UI never writes canonical inventory, equipment, quest, gold, or progression storage.
