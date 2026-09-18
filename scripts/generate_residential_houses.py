#!/usr/bin/env python3
"""Generate Hearthworn Fantasy residential house exteriors and shadows."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image

REPO = Path(__file__).resolve().parents[1]
OUT_DIR = REPO / "client" / "assets" / "world" / "buildings" / "residential"
GEOM_PATH = REPO / "client" / "data" / "world" / "buildings" / "residential_house_geometry.json"
CANVAS_W = 512
CANVAS_H = 448
ORIGIN_X = 256
ORIGIN_Y = 400
SEED = 18427
TRANSPARENT = (0, 0, 0, 0)
SHADOW_RGB = (36, 30, 24)
SHADOW_A = 96
OUTLINE = (62, 48, 36, 255)
TIMBER_DARK = (54, 38, 26, 255)
TIMBER_MID = (72, 50, 34, 255)
TIMBER_LIT = (92, 64, 42, 255)
IRON = (72, 70, 68, 255)
MOSS = (94, 106, 72, 255)
MOSS_DARK = (74, 86, 56, 255)
FLOWER = (120, 92, 70, 255)

PLASTER = {
    "white": [(214, 201, 176, 255), (196, 182, 158, 255), (178, 164, 140, 255), (160, 146, 124, 255), (148, 134, 112, 255)],
    "cream": [(214, 192, 158, 255), (198, 176, 144, 255), (180, 160, 128, 255), (164, 144, 114, 255), (148, 128, 100, 255)],
    "beige": [(204, 178, 142, 255), (188, 164, 130, 255), (172, 148, 116, 255), (156, 134, 104, 255), (140, 120, 92, 255)],
    "graywhite": [(204, 198, 186, 255), (186, 180, 168, 255), (170, 164, 152, 255), (154, 148, 136, 255), (138, 132, 122, 255)],
}
STONE = [(168, 158, 140, 255), (152, 146, 132, 255), (176, 164, 142, 255), (132, 124, 110, 255), (116, 108, 94, 255)]
SLATE = [(118, 126, 138, 255), (98, 108, 120, 255), (138, 144, 154, 255), (82, 90, 102, 255), (154, 158, 166, 255)]
THATCH = [(168, 140, 82, 255), (148, 122, 68, 255), (128, 104, 56, 255), (184, 156, 96, 255), (112, 92, 50, 255)]
TERRACOTTA = [(156, 92, 72, 255), (140, 80, 62, 255), (172, 108, 86, 255), (124, 72, 56, 255), (108, 64, 50, 255)]
RUST = [(148, 78, 62, 255), (132, 68, 54, 255), (160, 90, 72, 255), (116, 62, 50, 255), (100, 54, 44, 255)]
SHINGLE = [(128, 118, 102, 255), (112, 104, 90, 255), (144, 132, 114, 255), (96, 88, 76, 255), (156, 146, 128, 255)]
DOOR = [(96, 68, 44, 255), (78, 54, 34, 255), (58, 40, 26, 255), (118, 86, 56, 255)]
SHUTTER_BROWN = [(102, 74, 48, 255), (84, 60, 38, 255)]
SHUTTER_GREEN = [(90, 102, 78, 255), (74, 86, 64, 255)]
GLASS = [(58, 64, 74, 255), (48, 54, 64, 255), (70, 74, 82, 255), (64, 58, 48, 255)]


def _hash(x: int, y: int, seed: int) -> int:
    n = (x * 374761393 + y * 668265263 + seed * 1274126177) & 0xFFFFFFFF
    n ^= n >> 13
    n = (n * 1274126177) & 0xFFFFFFFF
    n ^= n >> 16
    return n


def _unit(x: int, y: int, seed: int) -> float:
    return _hash(x, y, seed) / 4294967295.0


class Canvas:
    def __init__(self) -> None:
        self.w = CANVAS_W
        self.h = CANVAS_H
        self.px = [TRANSPARENT] * (CANVAS_W * CANVAS_H)

    def get(self, x: int, y: int) -> tuple[int, int, int, int]:
        if 0 <= x < self.w and 0 <= y < self.h:
            return self.px[y * self.w + x]
        return TRANSPARENT

    def set(self, x: int, y: int, color: tuple[int, int, int, int]) -> None:
        if 0 <= x < self.w and 0 <= y < self.h:
            self.px[y * self.w + x] = color

    def fill_rect(self, x0: int, y0: int, x1: int, y1: int, color: tuple[int, int, int, int]) -> None:
        if x0 > x1:
            x0, x1 = x1, x0
        if y0 > y1:
            y0, y1 = y1, y0
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.set(x, y, color)

    def save(self, path: Path) -> None:
        img = Image.new("RGBA", (self.w, self.h), TRANSPARENT)
        img.putdata(self.px)
        path.parent.mkdir(parents=True, exist_ok=True)
        img.save(path)


def _shade(base: tuple[int, int, int, int], delta: int) -> tuple[int, int, int, int]:
    return (
        max(0, min(255, base[0] + delta)),
        max(0, min(255, base[1] + delta)),
        max(0, min(255, base[2] + delta)),
        255,
    )


def _pick(colors: list[tuple[int, int, int, int]], x: int, y: int, seed: int) -> tuple[int, int, int, int]:
    return colors[_hash(x, y, seed) % len(colors)]


def _cluster(colors: list[tuple[int, int, int, int]], x: int, y: int, seed: int, cell: int = 5) -> tuple[int, int, int, int]:
    cx, cy = x // cell, y // cell
    idx = 1 + (_hash(cx, cy, seed) % max(1, len(colors) - 2))
    return colors[idx]


def bresenham(x0: int, y0: int, x1: int, y1: int) -> list[tuple[int, int]]:
    pts: list[tuple[int, int]] = []
    dx = abs(x1 - x0)
    dy = -abs(y1 - y0)
    sx = 1 if x0 < x1 else -1
    sy = 1 if y0 < y1 else -1
    err = dx + dy
    x, y = x0, y0
    while True:
        pts.append((x, y))
        if x == x1 and y == y1:
            break
        e2 = 2 * err
        if e2 >= dy:
            err += dy
            x += sx
        if e2 <= dx:
            err += dx
            y += sy
    return pts


def fill_poly(c: Canvas, pts: list[tuple[int, int]], color_fn) -> None:
    if len(pts) < 3:
        return
    ys = [p[1] for p in pts]
    y0, y1 = min(ys), max(ys)
    n = len(pts)
    for y in range(y0, y1 + 1):
        xs: list[int] = []
        for i in range(n):
            x_a, y_a = pts[i]
            x_b, y_b = pts[(i + 1) % n]
            if y_a == y_b:
                continue
            if y_a > y_b:
                x_a, y_a, x_b, y_b = x_b, y_b, x_a, y_a
            if y < y_a or y >= y_b:
                continue
            t = (y - y_a) / float(y_b - y_a)
            xs.append(int(round(x_a + t * (x_b - x_a))))
        xs.sort()
        for i in range(0, len(xs) - 1, 2):
            xa, xb = xs[i], xs[i + 1]
            if xa > xb:
                xa, xb = xb, xa
            for x in range(xa, xb + 1):
                c.set(x, y, color_fn(x, y))


def stroke_poly(c: Canvas, pts: list[tuple[int, int]], color: tuple[int, int, int, int], closed: bool = True) -> None:
    count = len(pts) if closed else len(pts) - 1
    for i in range(count):
        x0, y0 = pts[i]
        x1, y1 = pts[(i + 1) % len(pts)]
        for x, y in bresenham(x0, y0, x1, y1):
            c.set(x, y, color)


def silhouette_outline(c: Canvas) -> None:
    marked: list[tuple[int, int]] = []
    for y in range(c.h):
        for x in range(c.w):
            if c.get(x, y)[3] != 255:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                if c.get(x + dx, y + dy)[3] == 0:
                    marked.append((x, y))
                    break
    for x, y in marked:
        c.set(x, y, OUTLINE)


def plaster_fn(palette: list[tuple[int, int, int, int]], seed: int, shade: int, cracks: bool = False):
    def fn(x: int, y: int) -> tuple[int, int, int, int]:
        color = _cluster(palette, x, y, seed, 6)
        lit = shade
        if (x + y) % 17 == 0:
            lit -= 6
        color = _shade(color, lit)
        if cracks and _unit(x, y, seed + 9) < 0.008 and (x // 8 + y // 10) % 5 == 0:
            color = _shade(color, -18)
        return color

    return fn


def stone_fn(seed: int, shade: int):
    def fn(x: int, y: int) -> tuple[int, int, int, int]:
        bx, by = x // 11, y // 7
        color = STONE[_hash(bx, by, seed) % len(STONE)]
        if x % 11 == 0 or y % 7 == 0:
            color = _shade(color, -22)
        return _shade(color, shade)

    return fn


def roof_fn(kind: str, colors: list[tuple[int, int, int, int]], seed: int, shade: int, moss: bool, patches: bool):
    def fn(x: int, y: int) -> tuple[int, int, int, int]:
        if kind == "thatch":
            wave = _hash(x // 7, 0, seed) % 3
            band = (y + wave) // 4
            color = colors[band % len(colors)]
            if _unit(x, y, seed) < 0.04:
                color = _shade(color, -10)
        elif kind == "slate":
            row = y // 5
            stagger = (row % 2) * 4
            col = (x - stagger) // 8
            color = colors[_hash(col, row, seed) % len(colors)]
            if (x - stagger) % 8 == 0 or y % 5 == 0:
                color = _shade(color, -18)
        elif kind in ("tile", "rust"):
            row = y // 6
            stagger = (row % 2) * 4
            col = (x - stagger) // 9
            color = colors[_hash(col, row, seed) % len(colors)]
            if y % 6 == 0:
                color = _shade(color, -16)
            if (x - stagger) % 9 == 0:
                color = _shade(color, -10)
        else:
            row = y // 5
            stagger = (row % 2) * 5
            col = (x - stagger) // 10
            color = colors[_hash(col, row, seed) % len(colors)]
            if (x - stagger) % 10 == 0 or y % 5 == 0:
                color = _shade(color, -14)
        if patches and _unit(x // 6, y // 6, seed + 21) < 0.08:
            color = _shade(color, -24)
        if moss and y % 9 > 5 and _unit(x, y, seed + 4) < 0.12:
            color = MOSS if _unit(x, y, seed + 5) < 0.6 else MOSS_DARK
        return _shade(color, shade)

    return fn


def draw_door(c: Canvas, cx: int, bot: int, seed: int) -> tuple[int, int, int, int]:
    w, h = 34, 54
    x0 = cx - w // 2
    y0 = bot - h
    for y in range(y0, bot + 1):
        for x in range(x0, x0 + w + 1):
            plank = (x - x0) // 7
            color = DOOR[plank % 3]
            if y == y0 or y == bot or x == x0 or x == x0 + w:
                color = TIMBER_DARK
            elif (x - x0) % 7 == 0:
                color = TIMBER_MID
            c.set(x, y, color)
    c.fill_rect(x0, y0, x0 + w, y0 + 3, TIMBER_DARK)
    c.set(x0 + w - 7, y0 + h // 2, IRON)
    c.set(x0 + w - 6, y0 + h // 2, IRON)
    c.set(x0 + w - 7, y0 + h // 2 + 1, IRON)
    step_y0 = bot + 1
    step_y1 = bot + 8
    fill_poly(
        c,
        [(x0 - 8, step_y0), (x0 + w + 8, step_y0), (x0 + w + 6, step_y1), (x0 - 6, step_y1)],
        stone_fn(seed + 3, -4),
    )
    stroke_poly(
        c,
        [(x0 - 8, step_y0), (x0 + w + 8, step_y0), (x0 + w + 6, step_y1), (x0 - 6, step_y1)],
        OUTLINE,
    )
    return cx, step_y1, w, h


def draw_window(
    c: Canvas,
    cx: int,
    cy: int,
    shutter: list[tuple[int, int, int, int]],
    flower: bool,
    seed: int,
    side: bool = False,
) -> None:
    w, h = (16, 14) if side else (20, 18)
    x0 = cx - w // 2
    y0 = cy - h // 2
    c.fill_rect(x0, y0, x0 + w, y0 + h, GLASS[_hash(cx, cy, seed) % 3])
    c.set(cx, y0 + h // 2, TIMBER_DARK)
    for y in range(y0, y0 + h + 1):
        c.set(cx, y, TIMBER_MID)
    for x in range(x0, x0 + w + 1):
        c.set(x, cy, TIMBER_MID)
    c.fill_rect(x0 - 1, y0 - 1, x0 + w + 1, y0, TIMBER_DARK)
    c.fill_rect(x0 - 1, y0 + h, x0 + w + 1, y0 + h + 1, TIMBER_DARK)
    c.fill_rect(x0 - 1, y0, x0, y0 + h, TIMBER_DARK)
    c.fill_rect(x0 + w, y0, x0 + w + 1, y0 + h, TIMBER_DARK)
    if not side:
        c.fill_rect(x0 - 6, y0, x0 - 2, y0 + h, shutter[0])
        c.fill_rect(x0 + w + 2, y0, x0 + w + 6, y0 + h, shutter[-1])
        c.fill_rect(x0 - 6, y0, x0 - 2, y0, TIMBER_DARK)
        c.fill_rect(x0 + w + 2, y0, x0 + w + 6, y0, TIMBER_DARK)
    if flower and not side:
        c.fill_rect(x0 - 2, y0 + h + 2, x0 + w + 2, y0 + h + 6, TIMBER_LIT)
        for x in range(x0, x0 + w, 4):
            c.set(x, y0 + h + 3, MOSS)
            c.set(x + 1, y0 + h + 2, FLOWER)


def draw_chimney(c: Canvas, left: int, top: int, seed: int) -> None:
    w, d, h = 20, 12, 34
    front = [
        (left, top + h),
        (left + w, top + h),
        (left + w, top + 8),
        (left, top + 8),
    ]
    side = [
        (left + w, top + h),
        (left + w + d, top + h - 7),
        (left + w + d, top + 1),
        (left + w, top + 8),
    ]
    cap = [
        (left - 2, top + 8),
        (left + w + 2, top + 8),
        (left + w + d, top + 1),
        (left + d - 2, top + 1),
    ]
    fill_poly(c, front, stone_fn(seed, 4))
    fill_poly(c, side, stone_fn(seed + 2, -16))
    fill_poly(c, cap, stone_fn(seed + 4, 10))
    stroke_poly(c, front, OUTLINE)
    stroke_poly(c, side, OUTLINE)
    stroke_poly(c, cap, OUTLINE)


def draw_house(spec: dict) -> tuple[Canvas, Canvas, dict]:
    c = Canvas()
    seed = SEED + int(spec["seed"])
    foot_w = int(spec["foot_w"])
    wall_h = int(spec["wall_h"])
    roof_h = int(spec["roof_h"])
    side_x = int(spec["side_x"])
    side_y = int(spec["side_y"])
    left = ORIGIN_X - foot_w // 2
    right = left + foot_w
    front = ORIGIN_Y
    found_h = 16
    wall_bot = front - found_h
    wall_top = wall_bot - wall_h
    eaves = wall_top + 4
    peak = eaves - roof_h
    over = 10

    eaves_l = (left - over, eaves)
    eaves_fr = (right + over, eaves)
    eaves_br = (right + over + side_x, eaves - side_y)
    ridge_l = (left + int(foot_w * 0.20), peak)
    ridge_fr = (right - int(foot_w * 0.10), peak)
    ridge_br = (ridge_fr[0] + side_x, peak)

    front_wall = [
        (left, wall_bot),
        (right, wall_bot),
        (right, wall_top),
        (left, wall_top),
    ]
    side_wall = [
        (right, wall_bot),
        (right + side_x, wall_bot - side_y),
        (right + side_x, wall_top - side_y),
        (right, wall_top),
    ]
    found_front = [
        (left - 2, front),
        (right + 2, front),
        (right, wall_bot),
        (left, wall_bot),
    ]
    found_side = [
        (right + 2, front),
        (right + side_x + 2, front - side_y),
        (right + side_x, wall_bot - side_y),
        (right, wall_bot),
    ]

    # Foundation first, then walls, then roof so the roof overlaps the wall top.
    fill_poly(c, found_front, stone_fn(seed, -2))
    fill_poly(c, found_side, stone_fn(seed + 1, -18))
    stroke_poly(c, found_front, OUTLINE)
    stroke_poly(c, found_side, OUTLINE)

    plaster = spec["plaster"]
    if spec.get("stone_course"):
        course = wall_bot - wall_h // 3
        fill_poly(
            c,
            [(left, wall_bot), (right, wall_bot), (right, course), (left, course)],
            stone_fn(seed + 6, 2),
        )
        fill_poly(
            c,
            [(left, course), (right, course), (right, wall_top), (left, wall_top)],
            plaster_fn(plaster, seed, 8, spec.get("cracks", False)),
        )
    else:
        fill_poly(c, front_wall, plaster_fn(plaster, seed, 8, spec.get("cracks", False)))
    fill_poly(c, side_wall, plaster_fn(plaster, seed + 3, -18, False))

    if spec["timber_heavy"]:
        posts = [left + 3, left + foot_w // 3, left + 2 * foot_w // 3, right - 3]
        beam_y = wall_top + wall_h // 2
        for px in posts:
            for y in range(wall_top + 1, wall_bot):
                c.set(px, y, TIMBER_MID)
                c.set(px + 1, y, TIMBER_LIT)
        for x in range(left + 1, right):
            c.set(x, beam_y, TIMBER_MID)
            c.set(x, wall_top + 7, TIMBER_DARK)
    else:
        for y in range(wall_top + 1, wall_bot):
            c.set(left + 2, y, TIMBER_MID)
            c.set(right - 2, y, TIMBER_DARK)
        for x in range(left + 1, right):
            c.set(x, wall_top + wall_h // 2, TIMBER_MID)

    if spec.get("repair_plaster"):
        rx, ry = ORIGIN_X + spec["repair_plaster"][0], wall_bot - spec["repair_plaster"][1]
        c.fill_rect(rx, ry, rx + 18, ry + 12, _shade(plaster[0], -8))

    stroke_poly(c, front_wall, OUTLINE)
    stroke_poly(c, side_wall, OUTLINE)

    fill_poly(c, [eaves_l, eaves_fr, ridge_fr, ridge_l], roof_fn(spec["roof_kind"], spec["roof"], seed, 8, spec["moss"], spec["patches"]))
    fill_poly(c, [eaves_fr, eaves_br, ridge_br, ridge_fr], roof_fn(spec["roof_kind"], spec["roof"], seed + 7, -18, spec["moss"], spec["patches"]))
    stroke_poly(c, [eaves_l, eaves_fr, ridge_fr, ridge_l], OUTLINE)
    stroke_poly(c, [eaves_fr, eaves_br, ridge_br, ridge_fr], OUTLINE)
    stroke_poly(c, [ridge_l, ridge_fr, ridge_br], OUTLINE, closed=False)

    if spec["roof_kind"] == "thatch":
        for x, y in bresenham(eaves_l[0], eaves_l[1], eaves_fr[0], eaves_fr[1]):
            drop = _hash(x, 0, seed) % 4
            for dy in range(drop):
                c.set(x, y + dy, _shade(spec["roof"][2], -6))

    if spec.get("lean_to"):
        lx0 = right - 36
        lx1 = right + side_x + 10
        ly0 = eaves + 10
        ly1 = wall_bot + 4
        lean_front = [(lx0, ly1), (right + 6, ly1), (right + 6, ly0 - 16), (lx0 + 12, ly0 - 28)]
        lean_side = [(right + 6, ly1), (lx1, ly1 - side_y + 8), (lx1, ly0 - 22), (right + 6, ly0 - 16)]
        fill_poly(c, lean_front, plaster_fn(plaster, seed + 8, 4))
        fill_poly(c, lean_side, plaster_fn(plaster, seed + 9, -20))
        lean_roof = [(lx0 + 8, ly0 - 20), (right + 10, ly0 - 8), (lx1 + 2, ly0 - 8), (lx0 + 28, ly0 - 20)]
        fill_poly(c, lean_roof, roof_fn(spec["roof_kind"], spec["roof"], seed + 11, -4, True, True))
        stroke_poly(c, lean_front, OUTLINE)
        stroke_poly(c, lean_side, OUTLINE)
        stroke_poly(c, lean_roof, OUTLINE)

    chim_x = left + max(spec["chimney_dx"], int(foot_w * 0.22))
    chim_top = peak + 16
    draw_chimney(c, chim_x, chim_top, seed)

    door_cx = ORIGIN_X + spec["door_dx"]
    entrance_x, entrance_y, door_w, door_h = draw_door(c, door_cx, wall_bot + 1, seed)
    shutter = spec["shutter"]
    for wx, wy, flower, is_side in spec["windows"]:
        if is_side:
            draw_window(c, right + spec["side_x"] // 2 + wx, wall_top + wy, shutter, False, seed, True)
        else:
            draw_window(c, ORIGIN_X + wx, wall_top + wy, shutter, flower, seed, False)

    if spec.get("lantern"):
        lx = door_cx + 22
        ly = wall_bot - door_h + 8
        c.fill_rect(lx, ly, lx + 3, ly + 8, IRON)
        c.fill_rect(lx - 2, ly + 8, lx + 5, ly + 14, TIMBER_MID)

    silhouette_outline(c)
    shadow = make_shadow(c)

    coll_w = int(spec["tiles"][0] * 64)
    coll_d = int(spec["tiles"][1] * 64)
    # Front-center origin; leave the stone step walkable.
    coll_x = -coll_w // 2
    coll_y = -coll_d
    coll_h = coll_d - 10
    meta = {
        "id": spec["id"],
        "house_id": f"residence_{spec['id']}",
        "canvas_size": [CANVAS_W, CANVAS_H],
        "asset_origin": [ORIGIN_X, ORIGIN_Y],
        "tiles": spec["tiles"],
        "approximate_footprint_tiles": spec["tiles"],
        "footprint_polygon_local": [
            [coll_x, coll_y],
            [coll_x + coll_w, coll_y],
            [coll_x + coll_w, coll_y + coll_h],
            [coll_x, coll_y + coll_h],
        ],
        "collision_aabb_local": [coll_x, coll_y, coll_w, coll_h],
        "door_local": [door_cx - ORIGIN_X, wall_bot - ORIGIN_Y],
        "door_area_local": [spec["door_dx"], 4, 40, 22],
        "entrance_marker_local": [spec["door_dx"], 18],
        "occlusion_polygon_local": [
            [left - ORIGIN_X, wall_top - ORIGIN_Y],
            [right - ORIGIN_X, wall_top - ORIGIN_Y],
            [right + side_x - ORIGIN_X, wall_top - side_y - ORIGIN_Y],
            [right + side_x - ORIGIN_X, front - side_y - ORIGIN_Y],
            [right - ORIGIN_X, front - ORIGIN_Y],
            [left - ORIGIN_X, front - ORIGIN_Y],
        ],
        "sort_local": [0, 0],
        "visible_bbox": bbox(c),
    }
    return c, shadow, meta


def bbox(c: Canvas) -> list[int]:
    minx, miny, maxx, maxy = c.w, c.h, -1, -1
    for y in range(c.h):
        for x in range(c.w):
            if c.get(x, y)[3] == 255:
                minx = min(minx, x)
                miny = min(miny, y)
                maxx = max(maxx, x)
                maxy = max(maxy, y)
    return [minx, miny, maxx, maxy]


def make_shadow(src: Canvas) -> Canvas:
    s = Canvas()
    occupied: list[tuple[int, int]] = []
    minx, miny, maxx, maxy = src.w, src.h, -1, -1
    for y in range(src.h):
        for x in range(src.w):
            if src.get(x, y)[3] == 255:
                occupied.append((x, y))
                minx = min(minx, x)
                miny = min(miny, y)
                maxx = max(maxx, x)
                maxy = max(maxy, y)
    if not occupied:
        return s
    ox, oy = 16, 12
    for x, y in occupied:
        sx = x + ox
        sy = y + oy
        if sx > maxx + 40 or sy > maxy + 40:
            continue
        s.set(sx, sy, (*SHADOW_RGB, SHADOW_A))
    bottom_xs = [x for x, y in occupied if y >= ORIGIN_Y - 28]
    if bottom_xs:
        left = min(bottom_xs)
        right = max(bottom_xs)
        for y in range(ORIGIN_Y - 4, ORIGIN_Y + 14):
            t = abs((y - (ORIGIN_Y + 4)) / 14.0)
            inset = int(10 + t * 22)
            for x in range(left + inset, right - inset + 1):
                s.set(x + 10, y + 8, (*SHADOW_RGB, SHADOW_A))
    for i, p in enumerate(s.px):
        if p[3] == 0:
            s.px[i] = TRANSPARENT
        else:
            s.px[i] = (*SHADOW_RGB, SHADOW_A)
    return s


def validate(c: Canvas, shadow: bool) -> None:
    for y in range(c.h):
        for x in range(c.w):
            p = c.get(x, y)
            if shadow:
                if p[3] not in (0, SHADOW_A):
                    raise SystemExit(f"shadow alpha {p[3]} at {x},{y}")
                if p[3] == 0 and p[:3] != (0, 0, 0):
                    raise SystemExit(f"shadow rgb leak at {x},{y}")
            else:
                if p[3] not in (0, 255):
                    raise SystemExit(f"exterior alpha {p[3]} at {x},{y}")
                if p[3] == 0 and p[:3] != (0, 0, 0):
                    raise SystemExit(f"exterior rgb leak at {x},{y}")
    if not shadow:
        for y in range(c.h):
            for x in range(c.w):
                if c.get(x, y)[3] != 0 and (x < 16 or y < 16 or x >= c.w - 16 or y >= c.h - 16):
                    raise SystemExit(f"pixel too close to canvas edge at {x},{y}")


HOUSE_SPECS = [
    {
        "id": "01",
        "foot_w": 300,
        "wall_h": 124,
        "roof_h": 132,
        "side_x": 48,
        "side_y": 26,
        "plaster": PLASTER["white"],
        "roof": SLATE,
        "roof_kind": "slate",
        "timber_heavy": False,
        "chimney_dx": 22,
        "door_dx": -16,
        "windows": [(-78, 58, False, False), (58, 60, True, False)],
        "shutter": SHUTTER_BROWN,
        "moss": True,
        "patches": False,
        "lean_to": False,
        "lantern": True,
        "seed": 11,
        "tiles": [5, 3],
    },
    {
        "id": "02",
        "foot_w": 308,
        "wall_h": 120,
        "roof_h": 140,
        "side_x": 46,
        "side_y": 24,
        "plaster": PLASTER["cream"],
        "roof": THATCH,
        "roof_kind": "thatch",
        "timber_heavy": True,
        "chimney_dx": 36,
        "door_dx": 8,
        "windows": [(-86, 56, True, False), (72, 58, False, False)],
        "shutter": SHUTTER_GREEN,
        "moss": False,
        "patches": False,
        "lean_to": False,
        "seed": 22,
        "tiles": [5, 3],
    },
    {
        "id": "03",
        "foot_w": 336,
        "wall_h": 148,
        "roof_h": 156,
        "side_x": 42,
        "side_y": 26,
        "plaster": PLASTER["graywhite"],
        "roof": SHINGLE,
        "roof_kind": "shingle",
        "timber_heavy": False,
        "chimney_dx": 28,
        "door_dx": -10,
        "windows": [(-110, 70, False, False), (16, 66, False, False), (96, 72, True, False)],
        "shutter": SHUTTER_BROWN,
        "moss": False,
        "patches": False,
        "lean_to": False,
        "stone_course": True,
        "cracks": True,
        "seed": 33,
        "tiles": [6, 3.0],
    },
    {
        "id": "04",
        "foot_w": 316,
        "wall_h": 126,
        "roof_h": 136,
        "side_x": 50,
        "side_y": 26,
        "plaster": PLASTER["beige"],
        "roof": TERRACOTTA,
        "roof_kind": "tile",
        "timber_heavy": True,
        "chimney_dx": 24,
        "door_dx": 26,
        "windows": [(-92, 58, False, False), (88, 70, True, False)],
        "shutter": SHUTTER_BROWN,
        "moss": False,
        "patches": True,
        "lean_to": False,
        "seed": 44,
        "tiles": [5, 3.0],
    },
    {
        "id": "05",
        "foot_w": 248,
        "wall_h": 118,
        "roof_h": 130,
        "side_x": 40,
        "side_y": 22,
        "plaster": PLASTER["graywhite"],
        "roof": RUST,
        "roof_kind": "rust",
        "timber_heavy": False,
        "chimney_dx": 16,
        "door_dx": -8,
        "windows": [(-58, 52, False, False), (8, 50, False, True)],
        "shutter": SHUTTER_BROWN,
        "moss": False,
        "patches": False,
        "lean_to": False,
        "repair_plaster": [28, 22],
        "seed": 55,
        "tiles": [4, 2.5],
    },
    {
        "id": "06",
        "foot_w": 312,
        "wall_h": 122,
        "roof_h": 134,
        "side_x": 46,
        "side_y": 24,
        "plaster": PLASTER["cream"],
        "roof": SHINGLE,
        "roof_kind": "shingle",
        "timber_heavy": True,
        "chimney_dx": 30,
        "door_dx": -20,
        "windows": [(-80, 58, True, False), (60, 60, False, False)],
        "shutter": SHUTTER_GREEN,
        "moss": True,
        "patches": True,
        "lean_to": True,
        "seed": 66,
        "tiles": [5, 3],
    },
]


IMPORT_TEMPLATE = """[remap]

importer="texture"
type="CompressedTexture2D"
uid="uid://{uid}"
path="res://.godot/imported/{name}.png-{hash}.ctex"
metadata={{
"vram_texture": false
}}

[deps]

source_file="res://assets/world/buildings/residential/{name}.png"
dest_files=["res://.godot/imported/{name}.png-{hash}.ctex"]

[params]

compress/mode=0
compress/high_quality=false
compress/lossy_quality=0.7
compress/uastc_level=0
compress/rdo_quality_loss=0.0
compress/hdr_compression=1
compress/normal_map=0
compress/channel_pack=0
mipmaps/generate=false
mipmaps/limit=-1
roughness/mode=0
roughness/src_normal=""
process/channel_remap/red=0
process/channel_remap/green=1
process/channel_remap/blue=2
process/channel_remap/alpha=3
process/fix_alpha_border=false
process/premult_alpha=false
process/normal_map_invert_y=false
process/hdr_as_srgb=false
process/hdr_clamp_exposure=false
process/size_limit=0
detect_3d/compress_to=1
"""


def _uid(name: str) -> str:
    digest = hashlib.sha1(f"hearthworn-house:{name}".encode("utf-8")).digest()
    alphabet = "abcdefghijklmnopqrstuvwxyz0123456789"
    chars = [alphabet[digest[0] % 26]]
    n = int.from_bytes(digest[1:9], "big")
    for _ in range(12):
        chars.append(alphabet[n % 36])
        n //= 36
    return "".join(chars)


def write_import(path: Path) -> None:
    name = path.stem
    source = f"res://assets/world/buildings/residential/{name}.png"
    dest_hash = hashlib.md5(source.encode("utf-8")).hexdigest()
    text = IMPORT_TEMPLATE.format(uid=_uid(name), name=name, hash=dest_hash)
    path.with_suffix(".png.import").write_text(text, encoding="utf-8")


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    GEOM_PATH.parent.mkdir(parents=True, exist_ok=True)
    metas = []
    for spec in HOUSE_SPECS:
        tiles = spec["tiles"]
        spec = dict(spec)
        spec["tiles"] = [float(tiles[0]), float(tiles[1])]
        exterior, shadow, meta = draw_house(spec)
        try:
            validate(exterior, False)
            validate(shadow, True)
        except SystemExit as exc:
            raise SystemExit(f"house {spec['id']}: {exc}") from exc
        ext_path = OUT_DIR / f"res_house_{spec['id']}_exterior.png"
        sh_path = OUT_DIR / f"res_house_{spec['id']}_shadow.png"
        exterior.save(ext_path)
        shadow.save(sh_path)
        write_import(ext_path)
        write_import(sh_path)
        metas.append(meta)
        print(f"wrote {ext_path.name} bbox={meta['visible_bbox']}")
    GEOM_PATH.write_text(json.dumps({"version": 1, "houses": metas}, indent=2) + "\n", encoding="utf-8")
    print(f"houses={len(metas)}")


if __name__ == "__main__":
    main()
