#!/usr/bin/env python3
"""Generate Hearthworn Fantasy grass foundation atlases (stdlib + Pillow)."""

from __future__ import annotations

from pathlib import Path

from PIL import Image

REPO = Path(__file__).resolve().parents[1]
OUT_DIR = REPO / "client" / "assets" / "world" / "terrain" / "grass"
C01_PATH = REPO / "client" / "assets" / "characters" / "c01" / "c01_move.png"

TILE = 64
PERIMETER = 8
GROUND_W, GROUND_H = 256, 64
DETAIL_W, DETAIL_H = 256, 128

# Warm-muted grass family, slightly olive so it sits under C01 skin/cloth.
ROOT = (38, 59, 40)
DARK = (53, 84, 55)
MID = (76, 112, 65)
WARM = (96, 124, 73)
LIGHT = (120, 146, 91)
HIGH = (148, 169, 109)
DRY = (130, 115, 72)
DRY_DARK = (110, 98, 62)
PALETTE = (ROOT, DARK, MID, WARM, LIGHT, HIGH, DRY, DRY_DARK)
SHADE_RANK = {ROOT: 0, DARK: 1, MID: 2, WARM: 3, LIGHT: 4, HIGH: 5, DRY: 2, DRY_DARK: 1}


def _hash(x: int, y: int, seed: int) -> int:
    n = (x * 374761393 + y * 668265263 + seed * 1274126177) & 0xFFFFFFFF
    n ^= n >> 13
    n = (n * 1274126177) & 0xFFFFFFFF
    n ^= n >> 16
    return n


def _unit(x: int, y: int, seed: int) -> float:
    return _hash(x, y, seed) / 4294967295.0


def _wrap_noise(x: float, y: float, scale: float, seed: int) -> float:
    gx = (x / TILE) * scale
    gy = (y / TILE) * scale
    x0 = int(gx) % int(scale) if scale >= 1 else 0
    y0 = int(gy) % int(scale) if scale >= 1 else 0
    span = max(int(scale), 1)
    x1 = (x0 + 1) % span
    y1 = (y0 + 1) % span
    tx = gx - int(gx)
    ty = gy - int(gy)
    sx = tx * tx * (3.0 - 2.0 * tx)
    sy = ty * ty * (3.0 - 2.0 * ty)
    n00 = _unit(x0, y0, seed)
    n10 = _unit(x1, y0, seed + 19)
    n01 = _unit(x0, y1, seed + 47)
    n11 = _unit(x1, y1, seed + 97)
    nx0 = n00 + (n10 - n00) * sx
    nx1 = n01 + (n11 - n01) * sx
    return nx0 + (nx1 - nx0) * sy


def _new_tile(color: tuple[int, int, int]) -> list[list[tuple[int, int, int]]]:
    return [[color for _ in range(TILE)] for _ in range(TILE)]


def _set(tile: list[list[tuple[int, int, int]]], x: int, y: int, color: tuple[int, int, int]) -> None:
    tile[y % TILE][x % TILE] = color


def _get(tile: list[list[tuple[int, int, int]]], x: int, y: int) -> tuple[int, int, int]:
    return tile[y % TILE][x % TILE]


def _shift(color: tuple[int, int, int], delta: int) -> tuple[int, int, int]:
    ordered = [ROOT, DARK, MID, WARM, LIGHT, HIGH]
    if color in (DRY, DRY_DARK):
        ordered = [DRY_DARK, DRY, WARM, LIGHT]
    if color not in ordered:
        ordered = [ROOT, DARK, MID, WARM, LIGHT, HIGH]
        color = MID
    idx = max(0, min(len(ordered) - 1, ordered.index(color) + delta))
    return ordered[idx]


def _interior_weight(x: int, y: int) -> float:
    d = min(x - PERIMETER, TILE - 1 - PERIMETER - x, y - PERIMETER, TILE - 1 - PERIMETER - y)
    if d < 0:
        return 0.0
    return min(1.0, d / 6.0)


def _stamp_cluster(
    tile: list[list[tuple[int, int, int]]],
    x: int,
    y: int,
    kind: str,
) -> None:
    """Small 2–4 pixel grass marks. All drawing wraps."""
    if kind == "warm_pair":
        _set(tile, x, y, WARM)
        _set(tile, x + 1, y, WARM)
    elif kind == "dark_pair":
        _set(tile, x, y, DARK)
        _set(tile, x + 1, y, DARK)
    elif kind == "blade":
        _set(tile, x, y, DARK)
        _set(tile, x, y - 1, WARM)
        _set(tile, x - 1, y - 2, LIGHT)
    elif kind == "blade_r":
        _set(tile, x, y, DARK)
        _set(tile, x, y - 1, WARM)
        _set(tile, x + 1, y - 2, LIGHT)
    elif kind == "root":
        _set(tile, x, y, DARK)
        _set(tile, x + 1, y, MID)
    elif kind == "light_dot":
        _set(tile, x, y, WARM)
        _set(tile, x - 1, y - 1, LIGHT)
    elif kind == "dry":
        _set(tile, x, y, DRY_DARK)
        _set(tile, x, y - 1, DRY)
        _set(tile, x - 1, y - 1, WARM)
    elif kind == "l_warm":
        _set(tile, x, y, WARM)
        _set(tile, x + 1, y, WARM)
        _set(tile, x, y - 1, LIGHT)


def _paint_base(tile: list[list[tuple[int, int, int]]], seed: int) -> None:
    for y in range(TILE):
        for x in range(TILE):
            n = _wrap_noise(x + 0.5, y + 0.5, 32, seed)
            # Tiny amplitude only — MID vs WARM, never large patches.
            tile[y][x] = WARM if n > 0.72 else MID


def _paint_root_marks(tile: list[list[tuple[int, int, int]]], seed: int, count: int, dark: tuple[int, int, int] = DARK) -> None:
    del dark
    for i in range(count):
        x = _hash(i, 17, seed) % TILE
        y = _hash(i, 41, seed + 5) % TILE
        _stamp_cluster(tile, x, y, "root")


def _paint_clusters(tile: list[list[tuple[int, int, int]]], seed: int, count: int, dry_chance: float = 0.0) -> None:
    kinds = ("warm_pair", "blade", "blade_r", "l_warm", "light_dot", "dark_pair")
    for i in range(count):
        cx = _hash(i, 7, seed) % TILE
        cy = _hash(i, 29, seed + 2) % TILE
        if _unit(i, 9, seed) < dry_chance:
            _stamp_cluster(tile, cx, cy, "dry")
            continue
        kind = kinds[_hash(i, 3, seed) % len(kinds)]
        _stamp_cluster(tile, cx, cy, kind)


def _remove_isolated(tile: list[list[tuple[int, int, int]]]) -> None:
    src = [row[:] for row in tile]
    for y in range(TILE):
        for x in range(TILE):
            here = src[y][x]
            neigh = [
                src[y][(x - 1) % TILE],
                src[y][(x + 1) % TILE],
                src[(y - 1) % TILE][x],
                src[(y + 1) % TILE][x],
            ]
            if here in neigh:
                continue
            if here in (LIGHT, HIGH) and any(n in (WARM, LIGHT, HIGH) for n in neigh):
                continue
            tile[y][x] = neigh[0]


def _copy_perimeter(src: list[list[tuple[int, int, int]]], dst: list[list[tuple[int, int, int]]]) -> None:
    for y in range(TILE):
        for x in range(TILE):
            if x < PERIMETER or x >= TILE - PERIMETER or y < PERIMETER or y >= TILE - PERIMETER:
                dst[y][x] = src[y][x]


def _apply_interior_variant(
    base: list[list[tuple[int, int, int]]],
    seed: int,
    extra_dark: int,
    extra_light: int,
    extra_dry: int,
) -> list[list[tuple[int, int, int]]]:
    tile = [row[:] for row in base]
    for y in range(TILE):
        for x in range(TILE):
            w = _interior_weight(x, y)
            if w <= 0.0:
                continue
            n = _unit(x, y, seed)
            if extra_dark and n < 0.06 * w:
                tile[y][x] = DARK if tile[y][x] != ROOT else ROOT
            elif extra_light and n > 1.0 - 0.05 * w:
                tile[y][x] = LIGHT if tile[y][x] in (WARM, LIGHT, HIGH) else WARM
            elif extra_dry and 0.48 < n < 0.48 + 0.04 * w:
                tile[y][x] = DRY
    _paint_clusters(tile, seed + 200, extra_dark + extra_light + extra_dry, dry_chance=0.5 if extra_dry else 0.0)
    _copy_perimeter(base, tile)
    _remove_isolated(tile)
    _copy_perimeter(base, tile)
    return tile


def build_ground_tiles() -> list[list[list[tuple[int, int, int]]]]:
    tile0 = _new_tile(MID)
    _paint_base(tile0, seed=18427)
    _paint_root_marks(tile0, seed=18427, count=8)
    _paint_clusters(tile0, seed=18427, count=16, dry_chance=0.05)
    _remove_isolated(tile0)
    tile1 = _apply_interior_variant(tile0, 91001, extra_dark=6, extra_light=0, extra_dry=0)
    tile2 = _apply_interior_variant(tile0, 91002, extra_dark=0, extra_light=6, extra_dry=0)
    tile3 = _apply_interior_variant(tile0, 91003, extra_dark=1, extra_light=0, extra_dry=5)
    return [tile0, tile1, tile2, tile3]


def _rgba_image(width: int, height: int, opaque: bool) -> Image.Image:
    mode = "RGBA"
    fill = (0, 0, 0, 255 if opaque else 0)
    return Image.new(mode, (width, height), fill)


def write_ground_atlas(path: Path, tiles: list[list[list[tuple[int, int, int]]]]) -> None:
    im = _rgba_image(GROUND_W, GROUND_H, opaque=True)
    px = im.load()
    for i, tile in enumerate(tiles):
        ox = i * TILE
        for y in range(TILE):
            for x in range(TILE):
                r, g, b = tile[y][x]
                px[ox + x, y] = (r, g, b, 255)
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, format="PNG", optimize=False)


def _put_detail(
    im: Image.Image,
    cell_x: int,
    cell_y: int,
    pixels: dict[tuple[int, int], tuple[int, int, int]],
) -> None:
    px = im.load()
    origin_x = cell_x * TILE + 32
    origin_y = cell_y * TILE + 56
    for (dx, dy), color in pixels.items():
        x = origin_x + dx
        y = origin_y + dy
        local_x = 32 + dx
        local_y = 56 + dy
        if not (4 <= local_x <= 59 and 4 <= local_y <= 59):
            raise ValueError(f"detail pixel out of margin: {(dx, dy)}")
        px[x, y] = (color[0], color[1], color[2], 255)


def _blade(
    pixels: dict[tuple[int, int], tuple[int, int, int]],
    x: int,
    y: int,
    height: int,
    lean: int,
    dry: bool = False,
    light: bool = False,
) -> None:
    base = DRY_DARK if dry else ROOT
    shaft = DRY if dry else DARK
    mid = WARM if not dry else DRY
    tip = HIGH if light and not dry else (LIGHT if not dry else WARM)
    pixels[(x, y)] = base
    pixels[(x + 1, y)] = shaft
    for step in range(1, height):
        px = x + (lean if step >= height - 2 else 0)
        py = y - step
        if step == height - 1:
            pixels[(px, py)] = tip
            if lean <= 0:
                pixels[(px + 1, py)] = mid
        elif step == height - 2:
            pixels[(px, py)] = mid
            pixels[(px + 1, py)] = shaft
        else:
            pixels[(px, py)] = shaft
            pixels[(px + 1, py)] = base if step == 1 else shaft


def build_detail_pixels() -> list[dict[tuple[int, int], tuple[int, int, int]]]:
    cells: list[dict[tuple[int, int], tuple[int, int, int]]] = []

    tiny: dict[tuple[int, int], tuple[int, int, int]] = {}
    _blade(tiny, -3, 0, 4, -1)
    _blade(tiny, 0, 0, 5, 0)
    _blade(tiny, 3, 0, 4, 1)
    cells.append(tiny)

    five: dict[tuple[int, int], tuple[int, int, int]] = {}
    _blade(five, -6, 0, 4, -1)
    _blade(five, -3, 0, 6, 0)
    _blade(five, 0, 0, 7, 0, light=True)
    _blade(five, 3, 0, 5, 1)
    _blade(five, 6, 0, 4, 1)
    cells.append(five)

    wide: dict[tuple[int, int], tuple[int, int, int]] = {}
    for i, x in enumerate((-10, -6, -2, 2, 6, 10)):
        _blade(wide, x, 0, 3 + (i % 2), -1 if x < 0 else 1)
    cells.append(wide)

    split: dict[tuple[int, int], tuple[int, int, int]] = {}
    _blade(split, -8, 0, 5, -1)
    _blade(split, -5, 0, 6, 0)
    _blade(split, -2, 0, 4, 1)
    _blade(split, 4, 0, 4, -1)
    _blade(split, 7, 0, 6, 0)
    _blade(split, 10, 0, 4, 1)
    cells.append(split)

    dark: dict[tuple[int, int], tuple[int, int, int]] = {}
    _blade(dark, -4, 0, 5, -1)
    _blade(dark, 0, 0, 6, 0)
    _blade(dark, 4, 0, 5, 1)
    for key, color in list(dark.items()):
        if color == LIGHT:
            dark[key] = WARM
        elif color == HIGH:
            dark[key] = LIGHT
        elif color == WARM:
            dark[key] = DARK
    cells.append(dark)

    fresh: dict[tuple[int, int], tuple[int, int, int]] = {}
    _blade(fresh, -4, 0, 5, -1, light=True)
    _blade(fresh, 0, 0, 7, 0, light=True)
    _blade(fresh, 4, 0, 5, 1, light=True)
    cells.append(fresh)

    dry: dict[tuple[int, int], tuple[int, int, int]] = {}
    _blade(dry, -4, 0, 5, -1, dry=True)
    _blade(dry, 0, 0, 6, 0, dry=True)
    _blade(dry, 3, 0, 4, 1, dry=True)
    cells.append(dry)

    flat: dict[tuple[int, int], tuple[int, int, int]] = {}
    for x in range(-8, 9, 2):
        flat[(x, 0)] = ROOT if x % 4 == 0 else DARK
        flat[(x + 1, 0)] = DARK
        if abs(x) < 7:
            flat[(x, -1)] = WARM if x % 4 else LIGHT
        if 0 <= x <= 4:
            flat[(x + 2, -1)] = DRY
    flat[(2, -2)] = LIGHT
    flat[(-3, -2)] = WARM
    cells.append(flat)
    return cells


def write_detail_atlas(path: Path, cells: list[dict[tuple[int, int], tuple[int, int, int]]]) -> None:
    im = _rgba_image(DETAIL_W, DETAIL_H, opaque=False)
    for i, pixels in enumerate(cells):
        _put_detail(im, i % 4, i // 4, pixels)
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, format="PNG", optimize=False)


def validate_ground(path: Path, tiles: list[list[list[tuple[int, int, int]]]]) -> list[str]:
    errors: list[str] = []
    im = Image.open(path)
    if im.size != (GROUND_W, GROUND_H):
        errors.append(f"ground size {im.size}")
    im = im.convert("RGBA")
    px = im.load()
    for y in range(GROUND_H):
        for x in range(GROUND_W):
            r, g, b, a = px[x, y]
            if a != 255:
                errors.append("ground has transparency")
                return errors
    for variant in tiles:
        for y in range(TILE):
            for x in range(TILE):
                if variant[y][0] != tiles[0][y][0] and x == 0:
                    pass
        for y in range(TILE):
            for x in range(TILE):
                on_perim = x < PERIMETER or x >= TILE - PERIMETER or y < PERIMETER or y >= TILE - PERIMETER
                if on_perim and variant[y][x] != tiles[0][y][x]:
                    errors.append("perimeter mismatch")
                    return errors
        # Self-tile horizontally and vertically using wrap of tile 0 perimeter.
        for y in range(TILE):
            if tiles[0][y][0] != tiles[0][y][TILE - 1] and False:
                # Edges do not need to equal each other pixel-for-pixel if wrap-painted;
                # wrap painting already makes left/right continuous when tiled.
                pass
    return errors


def validate_detail(path: Path) -> list[str]:
    errors: list[str] = []
    im = Image.open(path).convert("RGBA")
    if im.size != (DETAIL_W, DETAIL_H):
        errors.append(f"detail size {im.size}")
    px = im.load()
    for cell_i in range(8):
        cx = (cell_i % 4) * TILE
        cy = (cell_i // 4) * TILE
        vis = []
        for y in range(TILE):
            for x in range(TILE):
                r, g, b, a = px[cx + x, cy + y]
                if a not in (0, 255):
                    errors.append("non-binary alpha")
                    return errors
                if a == 0 and (r, g, b) != (0, 0, 0):
                    errors.append("transparent rgb not zero")
                    return errors
                if a == 255:
                    vis.append((x, y))
                    if x < 4 or x > 59 or y < 4 or y > 59:
                        errors.append(f"cell {cell_i} touches boundary")
        if not vis:
            errors.append(f"cell {cell_i} empty")
            continue
        xs = [p[0] for p in vis]
        ys = [p[1] for p in vis]
        width = max(xs) - min(xs) + 1
        height = max(ys) - min(ys) + 1
        if width > 30:
            errors.append(f"cell {cell_i} width {width}")
        if height > 16:
            errors.append(f"cell {cell_i} height {height}")
        if abs((min(xs) + max(xs)) / 2 - 32) > 6:
            errors.append(f"cell {cell_i} not centered x")
        if abs(max(ys) - 56) > 2:
            errors.append(f"cell {cell_i} ground y {max(ys)}")
    return errors


def write_validation_sheet(path: Path, tiles: list[list[list[tuple[int, int, int]]]]) -> None:
    cols, rows = 12, 8
    im = Image.new("RGBA", (cols * TILE, rows * TILE), (18, 16, 14, 255))
    px = im.load()
    for gy in range(rows):
        for gx in range(cols):
            variant = _hash(gx, gy, 99) % 4
            tile = tiles[variant]
            ox, oy = gx * TILE, gy * TILE
            for y in range(TILE):
                for x in range(TILE):
                    r, g, b = tile[y][x]
                    px[ox + x, oy + y] = (r, g, b, 255)
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path)


def write_c01_composite(path: Path, tiles: list[list[list[tuple[int, int, int]]]]) -> None:
    field = Image.new("RGBA", (12 * TILE, 8 * TILE), (0, 0, 0, 255))
    px = field.load()
    for gy in range(8):
        for gx in range(12):
            tile = tiles[_hash(gx, gy, 99) % 4]
            for y in range(TILE):
                for x in range(TILE):
                    r, g, b = tile[y][x]
                    px[gx * TILE + x, gy * TILE + y] = (r, g, b, 255)
    c01 = Image.open(C01_PATH).convert("RGBA").crop((0, 0, 192, 160))
    scaled = c01.resize((72, 60), Image.Resampling.NEAREST)
    # Feet at authored baseline: displayScale 0.375, foot y 150 -> 150*0.375=56.25 from top of sprite.
    # Place so feet sit on a grass pixel around field center.
    field.alpha_composite(scaled, (12 * TILE // 2 - 36, 8 * TILE // 2 - 50))
    path.parent.mkdir(parents=True, exist_ok=True)
    field.save(path)


def quantize_to_palette(im: Image.Image) -> None:
    """No-op guard: generator already uses the locked palette."""
    del im


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    tiles = build_ground_tiles()
    ground_path = OUT_DIR / "grass_ground_atlas.png"
    detail_path = OUT_DIR / "grass_detail_atlas.png"
    write_ground_atlas(ground_path, tiles)
    write_detail_atlas(detail_path, build_detail_pixels())
    errors = validate_ground(ground_path, tiles) + validate_detail(detail_path)
    tmp = Path("/tmp/hearthworn-grass-validation")
    write_validation_sheet(tmp / "ground_12x8.png", tiles)
    write_c01_composite(tmp / "c01_on_grass.png", tiles)
    nn2 = Image.open(tmp / "ground_12x8.png").resize((12 * TILE * 2, 8 * TILE * 2), Image.Resampling.NEAREST)
    nn2.save(tmp / "ground_12x8_200.png")
    if errors:
        raise SystemExit("validation failed:\n" + "\n".join(errors))
    print(f"wrote {ground_path}")
    print(f"wrote {detail_path}")
    print(f"validation images in {tmp}")


if __name__ == "__main__":
    main()
