# Third-party software

Related: [DEPENDENCIES.md](DEPENDENCIES.md), [ARCHITECTURE.md](ARCHITECTURE.md).

## Vendor location

Client plugins are copied into `client/addons/`:

| Folder | Package | Tag | Archive | Commit | Archive SHA-256 | Installed tree SHA-256 | License | Local modifications | Godot 4.7.1 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `com.heroiclabs.nakama` | Nakama Godot SDK | v3.4.0 | `nakama-3.4.0.zip` | `14b7f7078a9822c15b0424624e4c883c87730cee` | `540c7ff3556ef114188b93750626fe93cd5e5d151c5850061eb7a163ba7c6f3e` | `acd6016e66dbb9b5d3845cc1cf848c47a64ff9ce92e37a7ace005ef8d30664b1` | Apache-2.0 | none | Pass |
| `gloot` | GLoot | v3.0.2 | `gloot-v3.0.2.zip` (GitHub zipball of the tag) | `ce88b7adc7b952b4df8ebe4836339de334d0d0cc` | `d4d08157860abbd0ccee9fc8657ebf79fdbe1ecb10f986343a3bfea417ff6937` | `15d2a5055536d1d7a0f10d8f3e2ca6f3d4d76495f35a681060dc4bb8c43fb618` | MIT | none | Pass |
| `dialogue_manager` | Dialogue Manager | v3.10.5 | `godot_dialogue_manager-v3.10.5.zip` (GitHub zipball of the tag) | `0049d4d14f62aeb6377be8e6529d12e8e256ef27` | `b96950edda194d040100f89ee2d83fb25d6beb83183807d720933ddb235940dc` | `2e324c5188237f43b46d7d6d5a2599375cb4491d9c9d581dd9b6bb31942ed9ef` | MIT | none | Pass |
| `gdUnit4` | GdUnit4 | v6.2.0 | `gdUnit4-v6.2.0.zip` (GitHub zipball of the tag) | `d18770221c2df4a3c991a42fdce7907df40eea75` | `99e86a1c0c91deef9ab88c4a0bfea8802bf2d6ffb8167634c16ca12fee16338b` | `c8e629f31923c36a3429e924d24cc1aeb4d9926fa9bcda9adddfcd3aadc834e8` | MIT | none | Pass |

Archive URLs:

- Nakama: https://github.com/heroiclabs/nakama-godot/releases/download/v3.4.0/nakama-3.4.0.zip
- GLoot: https://github.com/peter-kish/gloot/archive/refs/tags/v3.0.2.zip
- Dialogue Manager: https://github.com/nathanhoad/godot_dialogue_manager/archive/refs/tags/v3.10.5.zip
- GdUnit4: https://github.com/godot-gdunit-labs/gdUnit4/archive/refs/tags/v6.2.0.zip

Only the addon directories from those archives are installed. Repo examples, documentation sites, and extra templates from the zipballs are not copied. QuestSystem, LimboAI, netfox, RPG database managers, and Satori as a separate package are not installed. `Satori.gd` exists inside the Nakama 3.4.0 addon folder because that is how the official zip is built; it is not autoloaded.

## Rules

1. Do not modify files under `client/addons/`.
2. Feature code uses project-owned adapters only.
3. Keep license files that ship with the addon. Nakama's Apache-2.0 `LICENSE` lives at the `nakama-3.4.0.zip` root. GLoot v3.0.2 does not ship a LICENSE file inside `addons/gloot`. Kenney RPG Base ships `client/assets/third_party/kenney_rpg_base/license.txt` (CC0).
4. Re-vendor with `scripts/` when a later phase allows a pin change. Do not upgrade casually.
5. Godot 4.7.1 generates `.uid` sidecars for Nakama 3.4.0 and GdUnit4 scripts that omit them. Those generated files are gitignored and are not vendor source edits. Do not commit engine rewrites of GLoot `images/*.svg.import`.

## Server infrastructure

| Component | Version | Source | License | Notes |
| --- | --- | --- | --- | --- |
| Nakama | 3.40.0 | Docker `heroiclabs/nakama:3.40.0` | Apache-2.0 | Authoritative server. Local Compose in `infra/`. |
| nakama-runtime | 1.47.0 | `github:heroiclabs/nakama-common#v1.47.0` (`449b77ecc8789aa466c36b67f6e498033dfcd9c5`) | Apache-2.0 | TypeScript typings only. |
| PostgreSQL | 16.15 | Docker `postgres:16.15-alpine` | PostgreSQL License | Named volume `vibecode_postgres_data`. No custom SQL. |
| Node.js (builder) | 20.20.2 | Docker `node:20.20.2-alpine` | MIT | Used only to compile the runtime bundle. |
| Ajv | 8.17.1 | `tools/content-build` npm devDependency | MIT | JSON Schema validation. Not bundled into Nakama. |

## Compatibility result (2026-08-15)

Godot `4.7.1.stable.official.a13da4feb` imported `client/` without parser errors. The headless scene printed `COMPATIBILITY_OK` and exited 0. GdUnit4 executed `res://tests/compatibility/compatibility_test.gd` with 4/4 passed.

## Art

| Folder | Package | Version | Official source | Archive SHA-256 | License | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `client/assets/third_party/kenney_rpg_base/` | Kenney RPG Base | 1.0 | https://kenney.nl/assets/rpg-base | `49759ab087fdc28d8357010e0f2a17d1c9db61c8fe9b320da965acdfbc298ef5` | CC0 1.0 | Unpacked official zip. Gameplay uses visual IDs only. Reinstall steps are in that folder's `README.md`. |
