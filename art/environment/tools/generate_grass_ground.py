#!/usr/bin/env python3
"""Generate seamless 64x64 grass ground tiles for the starter zone."""

from __future__ import annotations

import hashlib
import struct
from pathlib import Path

from PIL import Image

TILE = 64
BORDER = 6
INTERIOR_LO = BORDER
INTERIOR_HI = TILE - BORDER

PALETTE = {
    "deep": (0x26, 0x3B, 0x28),
    "dark": (0x35, 0x54, 0x37),
    "middle": (0x4C, 0x70, 0x41),
    "light": (0x6B, 0x8B, 0x50),
    "highlight": (0x8E, 0xA5, 0x67),
    "dry": (0x89, 0x75, 0x48),
}

ROLE_RANK = {"deep": 0, "dark": 1, "middle": 2, "light": 3, "highlight": 4, "dry": 2}


def _hash01(x: int, y: int, seed: int) -> float:
    payload = struct.pack(">iiI", x % TILE, y % TILE, seed & 0xFFFFFFFF)
    digest = hashlib.md5(payload).digest()
    return int.from_bytes(digest[:4], "big") / 0xFFFFFFFF


def _wrap(v: int) -> int:
    return v % TILE


def _in_border(x: int, y: int) -> bool:
    return x < BORDER or x >= TILE - BORDER or y < BORDER or y >= TILE - BORDER


STAMPS: list[list[tuple[int, int, str]]] = [
    [(0, 0, "highlight"), (1, 0, "light"), (0, 1, "middle"), (1, 1, "dark")],
    [
        (-1, 0, "middle"),
        (0, 0, "light"),
        (1, 0, "highlight"),
        (0, 1, "middle"),
        (1, 1, "dark"),
        (2, 1, "deep"),
    ],
    [(0, 0, "light"), (1, 0, "middle"), (1, 1, "dark"), (2, 1, "deep")],
    [(0, 0, "middle"), (1, 0, "middle"), (0, 1, "dark"), (1, 1, "deep"), (2, 0, "dark")],
    [(0, 0, "highlight"), (1, 0, "light"), (0, 1, "middle")],
    [(0, 0, "dry"), (1, 0, "dry"), (0, 1, "middle"), (1, 1, "dark")],
    [
        (-1, 0, "dark"),
        (0, 0, "middle"),
        (1, 0, "middle"),
        (2, 0, "light"),
        (0, 1, "dark"),
        (1, 1, "dark"),
        (2, 1, "middle"),
    ],
    [
        (0, 0, "light"),
        (1, 0, "highlight"),
        (2, 0, "light"),
        (0, 1, "middle"),
        (1, 1, "dark"),
        (2, 1, "dark"),
    ],
]


def _blank_tile() -> list[list[str]]:
    return [["middle" for _ in range(TILE)] for _ in range(TILE)]


def _set_role(grid: list[list[str]], x: int, y: int, role: str) -> None:
    x = _wrap(x)
    y = _wrap(y)
    current = grid[y][x]
    if ROLE_RANK[role] > ROLE_RANK[current]:
        grid[y][x] = role
    elif role == "dry":
        grid[y][x] = role


def _stamp(grid: list[list[str]], cx: int, cy: int, stamp_idx: int, *, interior_only: bool) -> None:
    for dx, dy, role in STAMPS[stamp_idx % len(STAMPS)]:
        x = _wrap(cx + dx)
        y = _wrap(cy + dy)
        if interior_only and _in_border(x, y):
            continue
        _set_role(grid, x, y, role)


def _scatter(
    grid: list[list[str]],
    seed: int,
    count: int,
    stamp_pool: list[int],
    *,
    interior_only: bool,
) -> None:
    placed = 0
    attempt = 0
    while placed < count and attempt < count * 50:
        attempt += 1
        x = int(_hash01(attempt, seed, seed) * TILE)
        y = int(_hash01(seed, attempt, seed + 17) * TILE)
        if interior_only and _in_border(x, y):
            continue
        pick = stamp_pool[int(_hash01(x, y, seed + placed) * len(stamp_pool))]
        _stamp(grid, x, y, pick, interior_only=interior_only)
        placed += 1


def _periodic_fill(grid: list[list[str]], seed: int) -> None:
    for y in range(TILE):
        for x in range(TILE):
            n = _hash01(x, y, seed)
            if n < 0.12:
                grid[y][x] = "dark"
            elif n < 0.22:
                grid[y][x] = "light"
            elif n > 0.93:
                grid[y][x] = "highlight"


def _enforce_toroidal_seams(grid: list[list[str]]) -> None:
    for y in range(TILE):
        grid[y][TILE - 1] = grid[y][0]
    for x in range(TILE):
        grid[TILE - 1][x] = grid[0][x]
    grid[TILE - 1][TILE - 1] = grid[0][0]


def _soften_isolated_pixels(grid: list[list[str]]) -> None:
    for y in range(TILE):
        for x in range(TILE):
            role = grid[y][x]
            if role not in ("highlight", "deep", "dry"):
                continue
            same = 0
            for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                nx, ny = _wrap(x + dx), _wrap(y + dy)
                if grid[ny][nx] == role:
                    same += 1
            if same == 0:
                if role == "highlight":
                    grid[y][x] = "light"
                elif role == "deep":
                    grid[y][x] = "dark"


def _build_shared_base(seed: int = 0xC0FFEE) -> list[list[str]]:
    grid = _blank_tile()
    _periodic_fill(grid, seed)
    _scatter(grid, seed + 1, 56, [0, 1, 2, 3, 4, 6, 7], interior_only=False)
    _soften_isolated_pixels(grid)
    _enforce_toroidal_seams(grid)
    return grid


def _variant_default(grid: list[list[str]], seed: int) -> None:
    _scatter(grid, seed + 10, 20, [0, 1, 4, 2, 7], interior_only=True)


def _variant_darker(grid: list[list[str]], seed: int) -> None:
    _scatter(grid, seed + 20, 18, [3, 1, 6, 2], interior_only=True)
    for y in range(INTERIOR_LO, INTERIOR_HI):
        for x in range(INTERIOR_LO, INTERIOR_HI):
            roll = _hash01(x, y, seed + 33)
            role = grid[y][x]
            if roll < 0.09:
                if role == "middle":
                    grid[y][x] = "dark"
                elif role == "light":
                    grid[y][x] = "middle"
            elif roll < 0.11:
                if role in ("middle", "light"):
                    grid[y][x] = "deep"


def _variant_lighter(grid: list[list[str]], seed: int) -> None:
    _scatter(grid, seed + 30, 18, [4, 0, 1, 7], interior_only=True)
    for y in range(INTERIOR_LO, INTERIOR_HI):
        for x in range(INTERIOR_LO, INTERIOR_HI):
            roll = _hash01(x, y, seed + 44)
            role = grid[y][x]
            if roll < 0.07:
                if role == "middle":
                    grid[y][x] = "light"
                elif role == "dark":
                    grid[y][x] = "middle"
            elif roll > 0.985:
                grid[y][x] = "highlight"


def _variant_dry(grid: list[list[str]], seed: int) -> None:
    _scatter(grid, seed + 40, 12, [5, 4, 0], interior_only=True)
    for y in range(INTERIOR_LO, INTERIOR_HI):
        for x in range(INTERIOR_LO, INTERIOR_HI):
            if _hash01(x, y, seed + 55) < 0.03:
                grid[y][x] = "dry"


def _copy_border(dst: list[list[str]], src: list[list[str]]) -> None:
    for y in range(TILE):
        for x in range(TILE):
            if _in_border(x, y):
                dst[y][x] = src[y][x]


def _grid_to_image(grid: list[list[str]]) -> Image.Image:
    img = Image.new("RGBA", (TILE, TILE), (0, 0, 0, 255))
    px = img.load()
    for y in range(TILE):
        for x in range(TILE):
            r, g, b = PALETTE[grid[y][x]]
            px[x, y] = (r, g, b, 255)
    return img


def build_variant(mutator, seed: int, shared: list[list[str]]) -> Image.Image:
    grid = [row[:] for row in shared]
    mutator(grid, seed)
    _soften_isolated_pixels(grid)
    _copy_border(grid, shared)
    return _grid_to_image(grid)


def build_atlas() -> Image.Image:
    shared = _build_shared_base()
    variants = [_variant_default, _variant_darker, _variant_lighter, _variant_dry]
    atlas = Image.new("RGBA", (TILE * 4, TILE), (0, 0, 0, 255))
    for i, mutator in enumerate(variants):
        atlas.paste(build_variant(mutator, 1000 + i * 97, shared), (i * TILE, 0))
    return atlas


def _verify_borders_match(atlas: Image.Image) -> None:
    tiles = [atlas.crop((i * TILE, 0, (i + 1) * TILE, TILE)) for i in range(4)]
    ref = tiles[0].load()
    for idx in range(1, 4):
        px = tiles[idx].load()
        for y in range(TILE):
            for x in range(TILE):
                if _in_border(x, y) and px[x, y] != ref[x, y]:
                    raise RuntimeError(f"border mismatch at ({x},{y}) tile {idx}")


def _verify_toroidal(tile_px) -> None:
    for y in range(TILE):
        if tile_px[0, y] != tile_px[TILE - 1, y]:
            raise RuntimeError(f"horizontal seam mismatch at y={y}")
    for x in range(TILE):
        if tile_px[x, 0] != tile_px[x, TILE - 1]:
            raise RuntimeError(f"vertical seam mismatch at x={x}")


def main() -> None:
    repo = Path(__file__).resolve().parents[3]
    out_dir = repo / "client" / "assets" / "environment" / "starter"
    deliverable_dir = repo / "art" / "environment" / "deliverables"
    out_dir.mkdir(parents=True, exist_ok=True)
    deliverable_dir.mkdir(parents=True, exist_ok=True)

    atlas = build_atlas()
    _verify_borders_match(atlas)
    for i in range(4):
        tile = atlas.crop((i * TILE, 0, (i + 1) * TILE, TILE))
        _verify_toroidal(tile.load())

    target = out_dir / "grass_ground_variants.png"
    copy = deliverable_dir / "grass_ground_variants.png"
    atlas.save(target, format="PNG")
    atlas.save(copy, format="PNG")
    print(f"Wrote {target} ({atlas.size[0]}x{atlas.size[1]})")
    print(f"Wrote {copy}")


if __name__ == "__main__":
    main()
