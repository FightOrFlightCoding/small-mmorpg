# Decisions

## 2026-08-15 — Phase 0 is contract only

The repository contains documentation and empty layout directories. No Godot project, Nakama runtime, Docker Compose stack, or gameplay code is included in Phase 0.

## 2026-08-15 — Repository path

The working tree is `C:\Users\Eszter\small-mmorpg`. `C:\Users\Eszter\Documents\small-mmorpg` is not used. Godot must import `client/` (`client/project.godot`), never the repo root.

## 2026-08-15 — Directory names

`server/` holds the future Nakama TypeScript runtime (not `nakama-runtime/`). `content/source/` holds authored JSON (not `content/data/`).

## 2026-08-15 — Prior scaffolding discarded

An earlier experimental Godot/Nakama tree in this folder was removed so Phase 0 matches the empty-repository contract. Nothing from that tree is authoritative.

## 2026-08-15 — Postgres image tag

The exact Postgres Docker tag is deferred to the infra phase. Nakama 3.40.0 remains the server pin. No custom SQL tables.

## 2026-08-15 — nakama-runtime install source

Version 1.47.0 is the Heroic Labs `nakama-common` tag. The npm package name is `nakama-runtime`. Install from Git, not an unpublished npm version number.

## 2026-08-15 — Godot package compatibility spike

`client/` is now a minimal Godot 4.7.1 project used only to prove the pinned addons load. There are still no gameplay scenes, no Nakama server runtime, and no networking implementation.

Official install rules used:

- Nakama 3.4.0 has no `plugin.cfg`. Autoload `res://addons/com.heroiclabs.nakama/Nakama.gd` as `Nakama`.
- GLoot 3.0.2: enable the editor plugin; instantiate `Inventory` in project code.
- Dialogue Manager 3.10.5: enable the plugin and autoload `res://addons/dialogue_manager/dialogue_manager.gd` as `DialogueManager`.
- GdUnit4 6.2.0: enable the plugin; run `res://addons/gdUnit4/bin/GdUnitCmdTool.gd`.

The Nakama 3.4.0 release zip includes `Satori.gd` inside `addons/com.heroiclabs.nakama`. That file is left in place as shipped and is not autoloaded.

Godot 4.7.1 writes `.uid` files for vendored scripts that predate UID sidecars (Nakama 3.4.0, GdUnit4 6.2.0 zipball). Those generated files are gitignored. They are not treated as package source modifications.
