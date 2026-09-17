# Local review

Playable work, including PROG-15 and the expanded village map, is on **`origin/main`**. Stay on `main`. Cloud agents cannot write `C:\Users\Eszter\small-mmorpg`; you pull after each prompt.

## After every prompt (required)

Quit Godot (File → Quit), then from `C:\Users\Eszter\small-mmorpg`:

```powershell
powershell -File scripts/local-play.ps1 -Branch main
```

That restores Godot `.import` dirt, checks out and fast-forwards `main`, rebuilds Nakama, and prints the `client/` path to reopen.

Then either:

- **Live game (PROG-15 + village):** reopen Godot on `client/`, Play `scenes/boot/boot.tscn`, Sign in as Alice. Spawn is the south stone road of a 4096×3072 map.
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

- Do not checkout `cursor/hearthworn-grass-foundation-f69a` or other `cursor/*` branches to play.
- Do not merge to `main` yourself; playable work is pushed to `origin/main`.
- Do not Play nested UI scenes as the main scene.
- Do not edit `client/addons/`.

## Why the editor looks empty

Grass and stone roads are painted at runtime. `scenes/world/world.tscn` in the inspector does not show them until Play or `review-village-map.ps1`.

## If git checkout refuses

`local-play.ps1` restores `.import` dirt first. If it still fails, you have other local edits: stash them or `git restore .` only if you have nothing to keep, then re-run `local-play.ps1 -Branch main`.
