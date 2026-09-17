#!/usr/bin/env python3
"""Generate the Hearthworn Fantasy stone-road Match Corners atlas."""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image

REPO = Path(__file__).resolve().parents[1]
OUT_PATH = REPO / "client" / "assets" / "world" / "terrain" / "roads" / "stone_road_terrain_atlas.png"
C01_PATH = REPO / "client" / "assets" / "characters" / "c01" / "c01_move.png"

TILE = 64
COLS = 5
ROWS = 4
ATLAS_W = COLS * TILE
ATLAS_H = ROWS * TILE
SEED = 18427

# Muted limestone / warm gray. Lower contrast than C01 cloth and skin.
MORTAR = (90, 82, 68, 255)
MORTAR_DARK = (74, 68, 56, 255)
HIGHLIGHT = (198, 190, 172, 255)
SHADOW = (116, 108, 94, 255)
MOSS = (94, 106, 72, 255)
STONE_COLORS = [
    (168, 158, 140, 255),
    (160, 152, 138, 255),
    (176, 164, 142, 255),
    (152, 146, 132, 255),
    (164, 154, 134, 255),
    (148, 140, 124, 255),
    (172, 166, 150, 255),
    (156, 148, 128, 255),
]
TRANSPARENT = (0, 0, 0, 0)

NW, NE, SE, SW = 1, 2, 4, 8


def _hash(x: int, y: int, seed: int) -> int:
    n = (x * 374761393 + y * 668265263 + seed * 1274126177) & 0xFFFFFFFF
    n ^= n >> 13
    n = (n * 1274126177) & 0xFFFFFFFF
    n ^= n >> 16
    return n


def _unit(x: int, y: int, seed: int) -> float:
    return _hash(x, y, seed) / 4294967295.0


def _toroidal_delta(a: float, b: float) -> float:
    d = a - b
    if d > TILE / 2:
        d -= TILE
    elif d < -TILE / 2:
        d += TILE
    return d


def _stone_points(seed: int) -> list[tuple[float, float, int, int]]:
    points: list[tuple[float, float, int, int]] = []
    nx, ny = 6, 6
    span_x = TILE / nx
    span_y = TILE / ny
    for j in range(ny):
        for i in range(nx):
            jx = (_unit(i, j, seed) - 0.5) * span_x * 0.72
            jy = (_unit(i, j, seed + 17) - 0.5) * span_y * 0.72
            px = (i + 0.5) * span_x + jx
            py = (j + 0.5) * span_y + jy
            points.append((px % TILE, py % TILE, i, j))
    return points


def _nearest_two(
    x: float, y: float, points: list[tuple[float, float, int, int]]
) -> tuple[tuple[float, float, int, int], float, float]:
    best: tuple[float, float, int, int] | None = None
    best_d = 1e9
    second = 1e9
    for p in points:
        dx = _toroidal_delta(x, p[0])
        dy = _toroidal_delta(y, p[1])
        d = dx * dx + dy * dy
        if d < best_d:
            second = best_d
            best_d = d
            best = p
        elif d < second:
            second = d
    assert best is not None
    return best, math.sqrt(best_d), math.sqrt(second)


def paint_seamless_road(seed: int) -> list[list[tuple[int, int, int, int]]]:
    points = _stone_points(seed)
    tile: list[list[tuple[int, int, int, int]]] = [
        [TRANSPARENT for _ in range(TILE)] for _ in range(TILE)
    ]
    for y in range(TILE):
        for x in range(TILE):
            point, d1, d2 = _nearest_two(x + 0.5, y + 0.5, points)
            joint = d2 - d1
            sx, sy, si, sj = point
            worn = _unit(si, sj, seed + 91) < 0.16
            palette_i = _hash(si, sj, seed + 5) % len(STONE_COLORS)
            base = STONE_COLORS[palette_i]
            if worn:
                base = STONE_COLORS[(palette_i + 5) % len(STONE_COLORS)]
            dx = _toroidal_delta(x + 0.5, sx)
            dy = _toroidal_delta(y + 0.5, sy)
            shade = 0
            if dx + dy < -2.2:
                shade = 1
            elif dx + dy > 2.8:
                shade = -1
            color = base
            if shade == 1:
                color = tuple(min(255, int(c * 0.42 + h * 0.58)) for c, h in zip(base[:3], HIGHLIGHT[:3])) + (255,)
            elif shade == -1:
                color = tuple(max(0, int(c * 0.62 + s * 0.38)) for c, s in zip(base[:3], SHADOW[:3])) + (255,)
            if joint < 1.35:
                mortar = MORTAR_DARK if joint < 0.7 else MORTAR
                tile[y][x] = mortar
            else:
                tile[y][x] = color
    # Restrained moss darkening near a few stone rims, never a carpet.
    for y in range(TILE):
        for x in range(TILE):
            if tile[y][x][3] == 0:
                continue
            if tile[y][x][:3] not in (MORTAR[:3], MORTAR_DARK[:3]):
                continue
            if _unit(x, y, seed + 201) > 0.045:
                continue
            mix = 0.38
            r, g, b, _a = tile[y][x]
            tile[y][x] = (
                int(r * (1 - mix) + MOSS[0] * mix),
                int(g * (1 - mix) + MOSS[1] * mix),
                int(b * (1 - mix) + MOSS[2] * mix),
                255,
            )
    return tile


def _mask_corners(mask: int) -> tuple[int, int, int, int]:
    return (
        1 if mask & NW else 0,
        1 if mask & NE else 0,
        1 if mask & SE else 0,
        1 if mask & SW else 0,
    )


def occupancy_mask(mask: int) -> list[list[bool]]:
    nw, ne, se, sw = _mask_corners(mask)
    occupied = [[False for _ in range(TILE)] for _ in range(TILE)]
    if mask == 0:
        return occupied
    if mask == 15:
        return [[True for _ in range(TILE)] for _ in range(TILE)]
    for y in range(TILE):
        for x in range(TILE):
            u = (x + 0.5) / TILE
            v = (y + 0.5) / TILE
            value = (1 - u) * (1 - v) * nw + u * (1 - v) * ne + u * v * se + (1 - u) * v * sw
            if 0 < x < TILE - 1 and 0 < y < TILE - 1 and mask not in (5, 10):
                edge = min(x, TILE - 1 - x, y, TILE - 1 - y)
                wave = 0.0
                if mask in (3, 12):
                    wave = math.sin(x * math.pi * 2.0 / TILE) * min(3.2, float(min(x, TILE - 1 - x))) / TILE
                elif mask in (6, 9):
                    wave = math.sin(y * math.pi * 2.0 / TILE) * min(3.2, float(min(y, TILE - 1 - y))) / TILE
                elif mask in (1, 2, 4, 8):
                    n = (_unit(x, y, SEED + mask) - 0.5) * 0.06 * min(1.0, edge / 8.0)
                    value += n
                value += wave
            occupied[y][x] = value > 0.5
    if mask in (5, 10):
        for y in range(TILE):
            for x in range(TILE):
                # Keep the two diagonal lobes separated through the center.
                if abs(x - 31.5) + abs(y - 31.5) < 11:
                    occupied[y][x] = False
    # Force exact edge contract after interior noise.
    for i in range(TILE):
        occupied[0][i] = _edge_pixel_road(i, nw, ne)
        occupied[TILE - 1][i] = _edge_pixel_road(i, sw, se)
        occupied[i][0] = _edge_pixel_road(i, nw, sw)
        occupied[i][TILE - 1] = _edge_pixel_road(i, ne, se)
    return occupied


def _edge_pixel_road(i: int, start_corner: int, end_corner: int) -> bool:
    if start_corner and end_corner:
        return True
    if not start_corner and not end_corner:
        return False
    if start_corner and not end_corner:
        return i < TILE // 2
    return i >= TILE // 2


def apply_occupancy(
    pattern: list[list[tuple[int, int, int, int]]],
    occupied: list[list[bool]],
) -> list[list[tuple[int, int, int, int]]]:
    out: list[list[tuple[int, int, int, int]]] = [
        [TRANSPARENT for _ in range(TILE)] for _ in range(TILE)
    ]
    for y in range(TILE):
        for x in range(TILE):
            if occupied[y][x]:
                out[y][x] = pattern[y][x]
    return out


def copy_tile(tile: list[list[tuple[int, int, int, int]]]) -> list[list[tuple[int, int, int, int]]]:
    return [row[:] for row in tile]


def make_variant(
    primary: list[list[tuple[int, int, int, int]]],
    variant: int,
) -> list[list[tuple[int, int, int, int]]]:
    tile = copy_tile(primary)
    inner = range(8, 56)
    if variant == 1:
        for y in inner:
            for x in inner:
                if _unit(x, y, SEED + 401) < 0.035 and tile[y][x][3] == 255:
                    r, g, b, _a = tile[y][x]
                    tile[y][x] = (max(0, r - 18), max(0, g - 16), max(0, b - 14), 255)
    elif variant == 2:
        for y in inner:
            for x in inner:
                if tile[y][x][:3] in (MORTAR[:3], MORTAR_DARK[:3]) and _unit(x, y, SEED + 502) < 0.12:
                    r, g, b, _a = tile[y][x]
                    tile[y][x] = (min(255, r + 8), min(255, g + 6), min(255, b + 4), 255)
    elif variant == 3:
        chip_x, chip_y = 28, 33
        for y in range(chip_y - 2, chip_y + 3):
            for x in range(chip_x - 3, chip_x + 3):
                if 8 <= x < 56 and 8 <= y < 56 and (x - chip_x) ** 2 + (y - chip_y) ** 2 <= 6:
                    tile[y][x] = MORTAR_DARK
    elif variant == 4:
        for y in inner:
            for x in inner:
                dist = math.hypot(x - 31.5, y - 31.5)
                if dist < 14 and tile[y][x][3] == 255 and tile[y][x][:3] not in (MORTAR[:3], MORTAR_DARK[:3]):
                    r, g, b, _a = tile[y][x]
                    tile[y][x] = (max(0, r - 10), max(0, g - 9), max(0, b - 8), 255)
    return tile


def atlas_coords(mask: int, variant: int = 0) -> tuple[int, int]:
    if mask < 15:
        return mask % COLS, mask // COLS
    return variant, 3


def build_cells() -> dict[tuple[int, int], list[list[tuple[int, int, int, int]]]]:
    pattern = paint_seamless_road(SEED)
    cells: dict[tuple[int, int], list[list[tuple[int, int, int, int]]]] = {}
    for mask in range(16):
        occupied = occupancy_mask(mask)
        painted = apply_occupancy(pattern, occupied)
        if mask < 15:
            cells[atlas_coords(mask)] = painted
        else:
            cells[(0, 3)] = painted
            for variant in range(1, 5):
                cells[(variant, 3)] = make_variant(painted, variant)
    return cells


def write_atlas(path: Path, cells: dict[tuple[int, int], list[list[tuple[int, int, int, int]]]]) -> None:
    im = Image.new("RGBA", (ATLAS_W, ATLAS_H), TRANSPARENT)
    px = im.load()
    for (cx, cy), tile in cells.items():
        ox, oy = cx * TILE, cy * TILE
        for y in range(TILE):
            for x in range(TILE):
                px[ox + x, oy + y] = tile[y][x]
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path)


def _edge_row(tile: list[list[tuple[int, int, int, int]]], edge: str) -> list[tuple[int, int, int, int]]:
    if edge == "top":
        return tile[0][:]
    if edge == "bottom":
        return tile[TILE - 1][:]
    if edge == "left":
        return [tile[y][0] for y in range(TILE)]
    return [tile[y][TILE - 1] for y in range(TILE)]


def validate_atlas(path: Path, cells: dict[tuple[int, int], list[list[tuple[int, int, int, int]]]]) -> list[str]:
    errors: list[str] = []
    im = Image.open(path).convert("RGBA")
    if im.size != (ATLAS_W, ATLAS_H):
        errors.append(f"size {im.size} != {(ATLAS_W, ATLAS_H)}")
        return errors
    px = im.load()
    for y in range(ATLAS_H):
        for x in range(ATLAS_W):
            r, g, b, a = px[x, y]
            if a not in (0, 255):
                errors.append(f"non-binary alpha at {x},{y} a={a}")
                return errors
            if a == 0 and (r, g, b) != (0, 0, 0):
                errors.append(f"transparent rgb {r},{g},{b} at {x},{y}")
                return errors
    for mask in range(16):
        cx, cy = atlas_coords(mask)
        tile = cells[(cx, cy)]
        occ = occupancy_mask(mask)
        nw, ne, se, sw = _mask_corners(mask)
        top = _edge_row(tile, "top")
        bot = _edge_row(tile, "bottom")
        left = _edge_row(tile, "left")
        right = _edge_row(tile, "right")
        for i in range(TILE):
            if (top[i][3] == 255) != _edge_pixel_road(i, nw, ne):
                errors.append(f"mask {mask} top edge {i}")
            if (bot[i][3] == 255) != _edge_pixel_road(i, sw, se):
                errors.append(f"mask {mask} bottom edge {i}")
            if (left[i][3] == 255) != _edge_pixel_road(i, nw, sw):
                errors.append(f"mask {mask} left edge {i}")
            if (right[i][3] == 255) != _edge_pixel_road(i, ne, se):
                errors.append(f"mask {mask} right edge {i}")
            if occ[0][i] != _edge_pixel_road(i, nw, ne):
                errors.append(f"mask {mask} occupancy top {i}")
        if mask in (5, 10):
            if tile[32][32][3] != 0:
                errors.append(f"mask {mask} center connection")
        if mask == 15:
            if any(p[3] != 255 for row in tile for p in row):
                errors.append("mask 15 has holes")
        if mask == 0:
            if any(p[3] != 0 for row in tile for p in row):
                errors.append("mask 0 not empty")
        if len(errors) > 12:
            return errors
    primary = cells[(0, 3)]
    for variant in range(1, 5):
        other = cells[(variant, 3)]
        for edge in ("top", "bottom", "left", "right"):
            if _edge_row(primary, edge) != _edge_row(other, edge):
                errors.append(f"variant {variant} {edge} mismatch")
        for y in list(range(0, 8)) + list(range(56, 64)):
            if other[y] != primary[y]:
                errors.append(f"variant {variant} altered outer row {y}")
                break
        for y in range(8, 56):
            if other[y][:8] != primary[y][:8] or other[y][56:] != primary[y][56:]:
                errors.append(f"variant {variant} altered outer columns on row {y}")
                break
    # Shared edge-corner states must share identical edge pixels.
    by_top: dict[tuple[int, int], list[tuple[int, int, int, int]]] = {}
    for mask in range(16):
        tile = cells[atlas_coords(mask)]
        key = (1 if mask & NW else 0, 1 if mask & NE else 0)
        row = _edge_row(tile, "top")
        if key not in by_top:
            by_top[key] = row
        elif by_top[key] != row:
            errors.append(f"top-edge mismatch mask {mask} key {key}")
    return errors


def contrast_ok(cells: dict[tuple[int, int], list[list[tuple[int, int, int, int]]]]) -> list[str]:
    errors: list[str] = []
    road = cells[(0, 3)]
    vals = [sum(p[:3]) / 3 for row in road for p in row]
    road_range = max(vals) - min(vals)
    if not C01_PATH.exists():
        return errors
    c01 = Image.open(C01_PATH).convert("RGBA")
    cvals = [sum(p[:3]) / 3 for p in c01.getdata() if p[3] > 0]
    c01_range = max(cvals) - min(cvals)
    if road_range >= c01_range:
        errors.append(f"road contrast {road_range:.1f} >= C01 {c01_range:.1f}")
    return errors


def write_validation_map(path: Path, cells: dict[tuple[int, int], list[list[tuple[int, int, int, int]]]]) -> None:
    """Temporary atlas review: every mask plus junctions, not a gameplay asset."""
    layout = [
        [0, 1, 2, 3, 4, 15],
        [5, 6, 7, 8, 9, 15],
        [10, 11, 12, 13, 14, 15],
        [3, 15, 15, 12, 9, 6],
        [15, 15, 15, 15, 15, 15],
    ]
    h, w = len(layout), len(layout[0])
    im = Image.new("RGBA", (w * TILE, h * TILE), (76, 112, 65, 255))
    px = im.load()
    for gy, row in enumerate(layout):
        for gx, mask in enumerate(row):
            variant = (gx + gy) % 5 if mask == 15 else 0
            tile = cells[atlas_coords(mask, variant)]
            for y in range(TILE):
                for x in range(TILE):
                    r, g, b, a = tile[y][x]
                    if a == 255:
                        px[gx * TILE + x, gy * TILE + y] = (r, g, b, 255)
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path)


def main() -> None:
    cells = build_cells()
    write_atlas(OUT_PATH, cells)
    errors = validate_atlas(OUT_PATH, cells) + contrast_ok(cells)
    preview = Path("/tmp/hearthworn-road-validation/mask_sheet.png")
    write_validation_map(preview, cells)
    if errors:
        raise SystemExit("stone road atlas validation failed:\n" + "\n".join(errors))
    print(f"wrote {OUT_PATH}")
    print(f"preview {preview}")


if __name__ == "__main__":
    main()
