from PIL import Image
from pathlib import Path
import hashlib

base = Path("art/characters/sheets/c01")
for name in ["c01_idle.png", "c01_move.png", "c01_attack_unarmed.png", "c01_attack_melee.png"]:
    im = Image.open(base / name).convert("RGBA")
    px = im.load()
    w, h = im.size
    rows = h // 64
    cols = w // 64
    print(f"\n{name} size={im.size} rows={rows} cols={cols}")
    opaque = transparent = partial = 0
    for y in range(h):
        for x in range(w):
            a = px[x, y][3]
            if a == 0:
                transparent += 1
            elif a == 255:
                opaque += 1
            else:
                partial += 1
    print(f"  opaque={opaque} transparent={transparent} partial_alpha={partial}")
    for r in range(rows):
        hashes = []
        for c in range(min(cols, 4)):
            cell = im.crop((c * 64, r * 64, (c + 1) * 64, (r + 1) * 64))
            hashes.append(hashlib.md5(cell.tobytes()).hexdigest()[:8])
        print(f"  row{r}: {hashes}")
    for r in range(rows):
        cell = im.crop((0, r * 64, 64, (r + 1) * 64))
        bbox = cell.getbbox()
        cp = cell.load()
        colors = set()
        whites = 0
        for y in range(64):
            for x in range(64):
                if cp[x, y][3]:
                    colors.add(cp[x, y])
                if cp[x, y][:3] == (255, 255, 255) and cp[x, y][3] == 255:
                    whites += 1
        print(f"  row{r} bbox={bbox} colors={len(colors)} white_eye_pixels={whites}")
