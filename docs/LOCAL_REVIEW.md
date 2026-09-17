# Local review of agent work

Cloud-agent prompts **do not** land on `main`, and they **do not** appear on a Windows clone until that clone pulls the review branch. Opening an already-loaded Godot editor is not enough.

Current review branch: the single line in [AGENT_REVIEW_BRANCH](AGENT_REVIEW_BRANCH) (`cursor/hearthworn-grass-foundation-f69a`).

`scripts/sync-review.ps1` exists **only after** that branch is checked out. If PowerShell says the file does not exist, you are still on `main`. Use the git commands in the next section once.

## First pull (when the script is missing)

Quit Godot, then from `C:\Users\Eszter\small-mmorpg`:

```powershell
git status
git fetch origin cursor/hearthworn-grass-foundation-f69a
git checkout cursor/hearthworn-grass-foundation-f69a
git pull --ff-only origin cursor/hearthworn-grass-foundation-f69a
git rev-parse --short HEAD
Test-Path scripts\sync-review.ps1
```

`HEAD` must be `6ecb195` or later. `Test-Path` must print `True`. A live Alice session that prints `hash=b76111cf` is **`main`**, not this map (`bdd969e8…`).

If `git checkout` refuses, the tree is dirty. Discard Godot noise with `git restore .` (only if you have no local edits you want to keep), then run the four git lines again.

## After every later prompt

From `C:\Users\Eszter\small-mmorpg`:

1. **Close Godot completely** (File → Quit). An open editor keeps stale imported scenes in memory.
2. Pull the review branch:

```powershell
powershell -File scripts/sync-review.ps1
```

3. Review the map **without** Nakama:

```powershell
powershell -File scripts/review-village-map.ps1
```

You should spawn on the south stone road of a **4096×3072** grass valley. WASD walks. A top-left banner reads `Village roads review`. If you still see a small Kenney tile floor, you are not on this branch or Godot was still open during the pull.

4. Review the **live game** (Alice, NPCs, combat) only after the map looks right:

```powershell
powershell -File scripts/dev-up.ps1
powershell -File scripts/run-client.ps1 -DevUser alice
```

`dev-up` is required whenever `contentHash` changed (this village expansion did). An old Nakama container will reject the new client with `content_mismatch`.

## What you do not need to do

- Do not merge to `main` to review.
- Do not re-import Kenney assets.
- Do not edit files under `client/addons/`.
- Do not Play nested UI scenes as the main scene. The live game starts from `scenes/boot/boot.tscn` (the run-client script already does this).

## Why the editor looks empty

Grass and stone roads are painted at runtime from `zone.starter` plus `client/data/world/maps/village_road_plan.json`. `scenes/world/world.tscn` in the Godot inspector does **not** show those tiles until the game runs. Use `review-village-map.ps1` or Play after a successful join.

## If git pull refuses to run

`sync-review.ps1` stops on a dirty working tree. Either discard local Godot `.import` noise (`git restore .`) or stash your own edits, then run the script again.

## Confirm you have the new map

| Check | Expected |
| --- | --- |
| `git branch --show-current` | `cursor/hearthworn-grass-foundation-f69a` (or whatever [AGENT_REVIEW_BRANCH](AGENT_REVIEW_BRANCH) says) |
| Review banner | `Village roads review · 4096x3072` |
| Spawn | South cobblestone road, character facing north |
| Live-game debug overlay hash prefix | First 8 chars of `client/content/bundle.json` `contentHash` |

`origin/main` does not include this work until a pull request is merged.
