# Dependencies

Pinned versions. Do not upgrade, replace, or add foundational packages unless the current phase explicitly instructs it.

Upgrade policy for every row: **locked**. A later phase may change a pin only by editing this file and [DECISIONS.md](DECISIONS.md) in the same change.

## Godot

| Field | Value |
| --- | --- |
| Purpose | Client engine, TileMap, scenes, GDScript |
| Version | 4.7.1 stable |
| Official source | https://godotengine.org/download |
| License | MIT |
| Installation | Local editor already on this machine: `C:\Users\Eszter\Desktop\godot\Godot_v4.7.1-stable_win64.exe` |
| Executes on | Client editor, exported client, GdUnit4 host |
| Upgrade policy | Locked |

## Nakama

| Field | Value |
| --- | --- |
| Purpose | Authoritative game server, accounts, storage, wallet, matches |
| Version | 3.40.0 |
| Official source | https://github.com/heroiclabs/nakama and Docker image `heroiclabs/nakama:3.40.0` |
| License | Apache-2.0 |
| Installation | Docker Compose in `infra/` (later phase) |
| Executes on | Server |
| Upgrade policy | Locked |

## nakama-runtime (Nakama Common TypeScript types)

| Field | Value |
| --- | --- |
| Purpose | TypeScript typings for the Nakama JS runtime API |
| Version | 1.47.0 |
| Official source | https://github.com/heroiclabs/nakama-common/tree/v1.47.0 (npm package name `nakama-runtime`; install from the Git tag, not the public npm copy) |
| License | Apache-2.0 |
| Installation | `npm` dependency in `server/` (later phase): `github:heroiclabs/nakama-common#v1.47.0` |
| Executes on | Build tooling (types only). Runtime code executes inside Nakama, not Node. |
| Upgrade policy | Locked |

## Nakama Godot SDK

| Field | Value |
| --- | --- |
| Purpose | Official GDScript client for Nakama HTTP and realtime APIs |
| Version | 3.4.0 |
| Official source | https://github.com/heroiclabs/nakama-godot/releases/tag/v3.4.0 |
| License | Apache-2.0 |
| Installation | Vendor into `client/addons/` in a later phase; wrap with a project-owned gateway |
| Executes on | Client |
| Upgrade policy | Locked |

## GLoot

| Field | Value |
| --- | --- |
| Purpose | Inventory/equipment presentation widgets |
| Version | 3.0.2 |
| Official source | https://github.com/peter-kish/gloot/releases/tag/v3.0.2 |
| License | MIT |
| Installation | Vendor into `client/addons/`; wrap with a project-owned presenter |
| Executes on | Client |
| Upgrade policy | Locked |

## Dialogue Manager

| Field | Value |
| --- | --- |
| Purpose | Dialogue presentation and `.dialogue` editing |
| Version | 3.10.5 |
| Official source | https://github.com/nathanhoad/godot_dialogue_manager/releases/tag/v3.10.5 |
| License | MIT |
| Installation | Vendor into `client/addons/`; wrap with a project-owned presenter |
| Executes on | Client |
| Upgrade policy | Locked |

## GdUnit4

| Field | Value |
| --- | --- |
| Purpose | Godot unit and scene tests |
| Version | 6.2.0 |
| Official source | https://github.com/godot-gdunit-labs/gdUnit4/releases/tag/v6.2.0 |
| License | MIT |
| Installation | Vendor into `client/addons/`; invoke via `scripts/` later |
| Executes on | Build tooling (Godot headless test host) |
| Upgrade policy | Locked |

## PostgreSQL (via Docker Compose)

| Field | Value |
| --- | --- |
| Purpose | Nakama persistence backend |
| Version | Not a gameplay framework pin. Use an official Postgres image compatible with Nakama 3.40.0; record the exact tag in `infra/` when Compose is added. |
| Official source | https://hub.docker.com/_/postgres |
| License | PostgreSQL License |
| Installation | Docker Compose in `infra/` |
| Executes on | Server infrastructure |
| Upgrade policy | Minor image tags may be chosen at infra introduction; no custom SQL. |

## TypeScript

| Field | Value |
| --- | --- |
| Purpose | Compile `server/` to JS for Nakama |
| Version | Chosen in the server-bootstrap phase; must emit a global `InitModule` compatible with Nakama 3.40.0 |
| Official source | https://www.typescriptlang.org/ |
| License | Apache-2.0 |
| Installation | `server/package.json` devDependency |
| Executes on | Build tooling |
| Upgrade policy | Locked once the bootstrap phase pins a compiler version in this file |
