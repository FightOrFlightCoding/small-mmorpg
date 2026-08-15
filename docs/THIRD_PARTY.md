# Third-party software

Related: [DEPENDENCIES.md](DEPENDENCIES.md), [ARCHITECTURE.md](ARCHITECTURE.md).

## Vendor location

Client plugins are copied into `client/addons/` in a later phase:

- `com.heroiclabs.nakama` — Nakama Godot SDK 3.4.0
- `gloot` — GLoot 3.0.2
- `dialogue_manager` — Dialogue Manager 3.10.5
- `gdUnit4` — GdUnit4 6.2.0

## Rules

1. Do not modify files under `client/addons/`.
2. Feature code uses project-owned adapters only.
3. Licenses (MIT / Apache-2.0) are recorded in [DEPENDENCIES.md](DEPENDENCIES.md). Keep license files that ship with the addon.
4. Re-vendor with `scripts/` when a later phase allows a pin change. Do not upgrade casually.
