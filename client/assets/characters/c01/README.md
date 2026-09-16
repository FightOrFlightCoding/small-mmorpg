# C01 walk sheet

Source: `HI01_C01_COMPLETE` production `c01_move.png` (192×160 cells, 4×3: down / right / up). Left facing mirrors the right row at runtime.

Side mid-frames (cols 1 and 3) are rebuilt from the original contact poses by pulling both feet together under the body with no high kick (`scripts/build_c01_low_pass_frames.py`), so the gait reads plant → gather → plant. The untouched original is `c01_move_original.png`.

Rebuild SpriteFrames after editing the sheet:

```
Godot_v4.7.1-stable_win64_console.exe --headless --path client -s res://scripts/tools/build_c01_walk_frames.gd
```

Side playback uses near-even contact/pass durations (7 FPS base). Vertical bob is off for side walk so the gather poses do not bounce.

To reverse side art only: copy `c01_move_original.png` over `c01_move.png`, then rebuild SpriteFrames.
