# Local review

Playable work, including PROG-15, the expanded village map, and the certified NPC platform (NPC-07), is on **`origin/main`**. Stay on `main`. Cloud agents cannot write `C:\Users\Eszter\small-mmorpg`; you pull after each prompt.

`scripts/local-play.ps1` exists only after `main` is pulled. If PowerShell says that file does not exist, use the git commands below once.

## First pull (when local-play.ps1 is missing)

Quit Godot, then from `C:\Users\Eszter\small-mmorpg`:

```powershell
git restore client/addons client/assets client/resources client/project.godot
git fetch origin main
git checkout main
git pull --ff-only origin main
Test-Path scripts\local-play.ps1
git rev-parse --short HEAD
```

`Test-Path` must print `True`. `HEAD` must be `e9c46fd` or later. Then run `powershell -File scripts/local-play.ps1 -Branch main`.

If `git checkout` or `git pull` still refuses, run `git status`. The usual blocker is Godot rewriting `client/project.godot`. Close the editor and `git restore client/project.godot`, then repeat. Discard leftover Godot noise with `git restore .` only if you have no local edits to keep.

## After every later prompt

Quit Godot (File → Quit), then from `C:\Users\Eszter\small-mmorpg`:

```powershell
powershell -File scripts/local-play.ps1 -Branch main
```

That restores Godot `.import` dirt, checks out and fast-forwards `main`, rebuilds Nakama, and prints the `client/` path to reopen.

Then either:

- **Live game (PROG-15 + village + NPC platform):** reopen Godot **4.7.1** on `client/` (not the repo root). Main scene is `scenes/boot/boot.tscn`. Sign in as Alice (debug) or use an email account. Spawn is the south stone road of a 4096×3072 map. Right-click an NPC to talk (`E` is the same interact). Two windows: Alice in one, Bob in the other (`scripts/run-two-clients.ps1`). Proof NPCs sit west of the plaza and near the slime (`npc.platform_combined`).
- **Map only, no server:**

```powershell
powershell -File scripts/review-village-map.ps1
```

Banner should read `Village roads review · 4096x3072`. WASD walks.

## Get back to main if you checked out another branch

```powershell
powershell -File scripts/local-play.ps1 -Branch main
```

`git branch --show-current` must print `main`. A live Alice line `hash=b76111cf` was the old 1280×768 `main` before this village merge.

## What you do not need to do

- Do not checkout `cursor/npc-*` or other `cursor/*` branches to play.
- Do not merge to `main` yourself; playable work is pushed to `origin/main`.
- Do not Play nested UI scenes as the main scene.
- Do not edit `client/addons/`.

## Why the editor looks empty

Grass and stone roads are painted at runtime. `scenes/world/world.tscn` in the inspector does not show them until Play or `review-village-map.ps1`.

## If git checkout refuses

`local-play.ps1` restores `.import` dirt and `client/project.godot` first. Godot rewrites that project file (translations and input maps) while the editor is open, which blocks `git pull`. If a pull still fails because you already ran an older script, close Godot and run:

```powershell
git restore client/project.godot
powershell -File scripts/local-play.ps1 -Branch main
```

If it still refuses, you have other local edits: stash them or `git restore .` only if you have nothing to keep, then re-run `local-play.ps1 -Branch main`.
