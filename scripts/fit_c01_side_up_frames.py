"""Fit low forward-passing side frames into C01 walk sheet (cols 1 and 3)."""
from pathlib import Path
import shutil
from collections import Counter
import numpy as np
from PIL import Image

SHEET = Path(r"C:\Users\Eszter\small-mmorpg\client\assets\characters\c01\c01_move.png")
BAK = Path(r"C:\Users\Eszter\small-mmorpg\client\assets\characters\c01\c01_move_original.png")
# Quiet stroll pass poses: supporting plant + free foot low/forward.
UP_A = Path(r"C:\Users\Eszter\.cursor\projects\c-Users-Eszter-small-mmorpg\assets\c01_pass_low_a.png")
UP_B = Path(r"C:\Users\Eszter\.cursor\projects\c-Users-Eszter-small-mmorpg\assets\c01_pass_low_b.png")
PREV = Path(r"C:\Users\Eszter\small-mmorpg\.tmp-side-frames")
CELL = (192, 160)
FEET_Y = 150
CENTER_X = 96


def restore_sheet() -> Image.Image:
    if not BAK.exists():
        shutil.copy2(SHEET, BAK)
    shutil.copy2(BAK, SHEET)
    return Image.open(SHEET).convert("RGBA")


def ref_palette(sheet: Image.Image) -> list[tuple[int, int, int]]:
    contact = sheet.crop((0, 160, 192, 320))
    counts: Counter = Counter()
    for r, g, b, a in contact.getdata():
        if a < 200:
            continue
        counts[(r, g, b)] += 1
    return [c for c, _n in counts.most_common(96)]


def nearest(rgb: tuple[int, int, int], palette: list[tuple[int, int, int]]) -> tuple[int, int, int]:
    r, g, b = rgb
    best = palette[0]
    best_d = 10**9
    for pr, pg, pb in palette:
        d = (r - pr) * (r - pr) + (g - pg) * (g - pg) + (b - pb) * (b - pb)
        if d < best_d:
            best_d = d
            best = (pr, pg, pb)
    return best


def is_backdrop(r: int, g: int, b: int) -> bool:
    if r < 18 and g < 18 and b < 18:
        return True
    # Neutral studio grays (dark or light) — AI frames use ~40–70 and ~120–250.
    if abs(r - g) < 16 and abs(g - b) < 16:
        if r <= 110 or 120 <= r <= 250:
            return True
    if r > 245 and g > 245 and b > 245:
        return True
    return False


def extract_character(im: Image.Image, palette: list[tuple[int, int, int]]) -> Image.Image:
    im = im.convert("RGBA")
    w, h = im.size
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    sp = im.load()
    op = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = sp[x, y]
            if a < 10:
                continue
            if is_backdrop(r, g, b):
                continue
            mx = max(r, g, b)
            mn = min(r, g, b)
            if mx - mn < 10 and mx > 160:
                continue
            pr, pg, pb = nearest((r, g, b), palette)
            op[x, y] = (pr, pg, pb, 255)
    bbox = out.getbbox()
    if bbox is None:
        raise RuntimeError("no character found")
    return out.crop(bbox)


def fit_to_cell(char: Image.Image, target_height: int = 118) -> Image.Image:
    cw, ch = char.size
    scale = target_height / float(ch)
    nw = max(1, int(round(cw * scale)))
    nh = max(1, int(round(ch * scale)))
    char = char.resize((nw, nh), Image.Resampling.NEAREST)
    cell = Image.new("RGBA", CELL, (0, 0, 0, 0))
    x = CENTER_X - nw // 2
    y = FEET_Y - nh + 1
    cell.alpha_composite(char, (x, y))
    return cell


def lower_raised_foot(cell: Image.Image, drop: int = 7) -> Image.Image:
    """Shift the higher foot/ankle island downward so the swing stays near the ground."""
    arr = np.array(cell)
    a = arr[:, :, 3] > 180
    foot_band = a & (np.arange(CELL[1])[:, None] >= 120)
    if not foot_band.any():
        return cell
    _ys, xs = np.where(foot_band)
    mid = int(np.median(xs))
    left = foot_band & (np.arange(CELL[0])[None, :] < mid)
    right = foot_band & (np.arange(CELL[0])[None, :] >= mid)

    def foot_top(mask: np.ndarray) -> int:
        fy, _fx = np.where(mask)
        return int(fy.min()) if len(fy) else 999

    lift_left = foot_top(left)
    lift_right = foot_top(right)
    if lift_left == 999 and lift_right == 999:
        return cell
    move_left = lift_left < lift_right - 2
    move_right = lift_right < lift_left - 2
    if not move_left and not move_right:
        left_g = int((left & (np.arange(CELL[1])[:, None] >= 147)).sum())
        right_g = int((right & (np.arange(CELL[1])[:, None] >= 147)).sum())
        move_left = left_g < right_g

    cols = np.unique(np.where(left if move_left else right)[1])
    mask = np.zeros_like(a)
    for x in cols.tolist():
        mask[110:151, x] = a[110:151, x]

    out = arr.copy()
    out[mask] = (0, 0, 0, 0)
    ys, xs = np.where(mask)
    for y, x in zip(ys.tolist(), xs.tolist()):
        ny = min(CELL[1] - 1, y + drop)
        if arr[y, x, 3] >= out[ny, x, 3]:
            out[ny, x] = arr[y, x]
    for y in range(111, 150):
        for x in cols.tolist():
            if out[y, x, 3] == 0 and out[y - 1, x, 3] > 180 and out[min(CELL[1] - 1, y + 1), x, 3] > 180:
                out[y, x] = out[y - 1, x]
    return Image.fromarray(out, "RGBA")


def paste_cell(sheet: Image.Image, cell: Image.Image, row: int, col: int) -> None:
    blank = Image.new("RGBA", CELL, (0, 0, 0, 0))
    sheet.paste(blank, (col * CELL[0], row * CELL[1]))
    sheet.paste(cell, (col * CELL[0], row * CELL[1]), cell)


def main() -> None:
    sheet = restore_sheet()
    palette = ref_palette(sheet)
    up_a = lower_raised_foot(fit_to_cell(extract_character(Image.open(UP_A), palette), 118), drop=7)
    up_b = lower_raised_foot(fit_to_cell(extract_character(Image.open(UP_B), palette), 118), drop=7)
    paste_cell(sheet, up_a, 1, 1)
    paste_cell(sheet, up_b, 1, 3)
    sheet.save(SHEET)
    print("updated", SHEET)

    PREV.mkdir(exist_ok=True)
    frames = []
    for col in range(4):
        cell = sheet.crop((col * CELL[0], CELL[1], (col + 1) * CELL[0], CELL[1] * 2))
        bg = Image.new("RGBA", CELL, (36, 36, 42, 255))
        bg.alpha_composite(cell)
        bg.convert("RGB").save(PREV / f"side_pass_{col}.jpg", quality=95)
        frames.append(bg.resize((384, 320), Image.Resampling.NEAREST).convert("P", palette=Image.ADAPTIVE))
    frames[0].save(
        PREV / "side_walk_preview.gif",
        save_all=True,
        append_images=frames[1:],
        duration=[155, 155, 155, 155],
        loop=0,
        disposal=2,
    )
    print("preview", PREV / "side_walk_preview.gif")


if __name__ == "__main__":
    main()
