# Content model

Related: [ARCHITECTURE.md](ARCHITECTURE.md), [DEPENDENCIES.md](DEPENDENCIES.md).

## Locations

| Path | Contents |
| --- | --- |
| `content/schemas/` | JSON Schema documents that authored files must satisfy |
| `content/source/` | Source documents, one logical entity per file, named by stable ID |

No gameplay source files are authored in Phase 0.

## Stable IDs

IDs match `^[a-z]+\.[a-z0-9_]+$` (for example `zone.starter`, `tilemap.starter`, `item.rusty_sword`, `npc.guide`, `quest.first_hunt`).

- Network, storage, and quest logic use IDs only.
- Godot `res://` paths exist only in a client-side catalog generated or maintained from IDs.
- Server runtime must not require Node filesystem access to load content; generators in `tools/` embed or emit data the Nakama JS module can import.

## Expected kinds (later phases)

`zone`, `tilemap`, `item`, `npc`, `enemy`, `quest`, `dialogue` — each with a schema in `content/schemas/` before source is added.

## Generation

`tools/` will validate source against schemas and emit:

- server-readable content modules
- client ID→resource catalogs

Authors never hand-edit generated output.
