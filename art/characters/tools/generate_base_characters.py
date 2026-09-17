#!/usr/bin/env python3
"""
Shared-template pixel-art character sheet generator.

Style lock: art/characters/STYLE_LOCK.md
Frame: 64x64, center X=32, baseline Y=55, upper-left light, no AA.
"""

from __future__ import annotations

import argparse
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Dict, Iterable, List, Optional, Sequence, Tuple

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SHEETS = ROOT / "sheets"
DELIVERABLES = ROOT / "deliverables"

CELL = 64
CX = 32
BASELINE = 55

Color = Tuple[int, int, int, int]
RGB = Tuple[int, int, int]


def rgba(r: int, g: int, b: int, a: int = 255) -> Color:
    return (r, g, b, a)


TRANSPARENT = rgba(0, 0, 0, 0)
OUTLINE = rgba(42, 28, 22, 255)  # dark umber, never pure black


@dataclass(frozen=True)
class ToneSet:
    shadow: Color
    mid: Color
    light: Color
    deep: Optional[Color] = None


@dataclass(frozen=True)
class Appearance:
    char_id: str
    skin: ToneSet
    hair: ToneSet
    shirt: ToneSet
    shorts: ToneSet
    eye: Color
    brow: Color
    lip: Color
    presenting: str  # "masc" | "fem"
    hair_style: str
    face: str
    facial_hair: str = "none"  # none|stubble|beard|moustache
    freckles: bool = False
    expression: str = "friendly"


def tone(shadow: RGB, mid: RGB, light: RGB, deep: Optional[RGB] = None) -> ToneSet:
    return ToneSet(
        shadow=rgba(*shadow),
        mid=rgba(*mid),
        light=rgba(*light),
        deep=rgba(*deep) if deep else None,
    )


# --- Appearances -------------------------------------------------------------

APPEARANCES: Dict[str, Appearance] = {
    "c01": Appearance(
        char_id="c01",
        skin=tone((120, 82, 58), (168, 122, 90), (198, 155, 118), (90, 58, 40)),
        hair=tone((45, 28, 18), (72, 44, 28), (98, 64, 40)),
        shirt=tone((130, 112, 82), (168, 148, 112), (190, 172, 138)),
        shorts=tone((72, 48, 32), (102, 72, 48), (128, 96, 68)),
        eye=rgba(78, 48, 28),
        brow=rgba(52, 32, 20),
        lip=rgba(140, 90, 78),
        presenting="masc",
        hair_style="short_crop",
        face="square_friendly",
    ),
    "c02": Appearance(
        char_id="c02",
        skin=tone((168, 118, 98), (212, 168, 140), (232, 198, 172), (140, 95, 78)),
        hair=tone((98, 42, 28), (148, 72, 48), (178, 98, 68)),
        shirt=tone((78, 102, 78), (112, 138, 108), (138, 162, 132)),
        shorts=tone((72, 48, 32), (102, 72, 48), (128, 96, 68)),
        eye=rgba(82, 98, 52),
        brow=rgba(92, 52, 36),
        lip=rgba(168, 108, 108),
        presenting="fem",
        hair_style="auburn_bob",
        face="soft_round",
        freckles=True,
    ),
    "c03": Appearance(
        char_id="c03",
        skin=tone((58, 34, 24), (92, 58, 40), (128, 86, 62), (40, 24, 16)),
        hair=tone((12, 10, 10), (28, 22, 20), (48, 40, 36)),
        shirt=tone((68, 78, 92), (98, 112, 128), (122, 136, 150)),
        shorts=tone((42, 28, 20), (68, 46, 32), (92, 66, 48)),
        eye=rgba(48, 30, 20),
        brow=rgba(22, 16, 14),
        lip=rgba(110, 70, 62),
        presenting="masc",
        hair_style="coiled_short",
        face="strong",
        facial_hair="beard",
    ),
    "c04": Appearance(
        char_id="c04",
        skin=tone((92, 58, 40), (140, 96, 68), (172, 128, 98), (68, 42, 28)),
        hair=tone((12, 10, 10), (28, 22, 20), (48, 40, 36)),
        shirt=tone((98, 48, 40), (138, 78, 62), (162, 102, 84)),
        shorts=tone((72, 48, 32), (102, 72, 48), (128, 96, 68)),
        eye=rgba(32, 22, 18),
        brow=rgba(22, 16, 14),
        lip=rgba(128, 78, 72),
        presenting="fem",
        hair_style="low_bun",
        face="oval_calm",
        expression="calm",
    ),
    "c05": Appearance(
        char_id="c05",
        skin=tone((168, 128, 102), (210, 172, 140), (230, 200, 172), (138, 102, 78)),
        hair=tone((140, 112, 58), (188, 156, 88), (212, 186, 122)),
        shirt=tone((68, 98, 68), (98, 132, 98), (122, 156, 122)),
        shorts=tone((68, 58, 48), (98, 86, 72), (122, 108, 92)),
        eye=rgba(88, 108, 128),
        brow=rgba(120, 92, 58),
        lip=rgba(158, 110, 98),
        presenting="masc",
        hair_style="side_part",
        face="narrow_friendly",
        facial_hair="stubble",
    ),
    "c06": Appearance(
        char_id="c06",
        skin=tone((120, 82, 58), (168, 122, 90), (198, 155, 118), (90, 58, 40)),
        hair=tone((38, 24, 16), (62, 40, 26), (88, 58, 38)),
        shirt=tone((92, 58, 78), (128, 88, 112), (152, 112, 134)),
        shorts=tone((72, 48, 32), (102, 72, 48), (128, 96, 68)),
        eye=rgba(72, 44, 28),
        brow=rgba(42, 26, 18),
        lip=rgba(148, 92, 92),
        presenting="fem",
        hair_style="curly_bob",
        face="confident",
        expression="confident",
    ),
    "c07": Appearance(
        char_id="c07",
        skin=tone((140, 96, 68), (188, 140, 102), (214, 172, 132), (108, 72, 48)),
        hair=tone((18, 14, 12), (36, 28, 24), (58, 46, 40)),
        shirt=tone((78, 78, 78), (112, 112, 112), (138, 138, 138)),
        shorts=tone((36, 28, 24), (58, 46, 38), (82, 66, 54)),
        eye=rgba(48, 30, 20),
        brow=rgba(28, 20, 16),
        lip=rgba(128, 82, 72),
        presenting="masc",
        hair_style="buzz",
        face="weathered",
        facial_hair="beard",
    ),
    "c08": Appearance(
        char_id="c08",
        skin=tone((58, 34, 24), (92, 58, 40), (128, 86, 62), (40, 24, 16)),
        hair=tone((12, 10, 10), (28, 22, 20), (48, 40, 36)),
        shirt=tone((128, 92, 42), (168, 128, 68), (190, 152, 92)),
        shorts=tone((68, 58, 48), (98, 86, 72), (122, 108, 92)),
        eye=rgba(48, 30, 20),
        brow=rgba(22, 16, 14),
        lip=rgba(120, 72, 64),
        presenting="fem",
        hair_style="short_braids",
        face="high_cheek",
    ),
    "c09": Appearance(
        char_id="c09",
        skin=tone((130, 98, 74), (178, 138, 106), (206, 170, 136), (98, 72, 52)),
        hair=tone((38, 24, 16), (62, 40, 26), (88, 58, 38)),
        shirt=tone((48, 78, 48), (72, 108, 72), (98, 132, 98)),
        shorts=tone((72, 48, 32), (102, 72, 48), (128, 96, 68)),
        eye=rgba(36, 26, 20),
        brow=rgba(42, 26, 18),
        lip=rgba(132, 88, 78),
        presenting="masc",
        hair_style="low_knot",
        face="thoughtful",
        expression="thoughtful",
    ),
    "c10": Appearance(
        char_id="c10",
        skin=tone((168, 138, 128), (214, 188, 176), (236, 216, 206), (140, 112, 102)),
        hair=tone((148, 148, 132), (196, 196, 178), (220, 220, 204)),
        shirt=tone((42, 58, 98), (68, 92, 138), (92, 118, 162)),
        shorts=tone((68, 58, 48), (98, 86, 72), (122, 108, 92)),
        eye=rgba(98, 118, 138),
        brow=rgba(52, 42, 38),
        lip=rgba(158, 112, 118),
        presenting="fem",
        hair_style="silver_bob",
        face="angular",
    ),
    "c11": Appearance(
        char_id="c11",
        skin=tone((98, 68, 48), (148, 108, 78), (178, 138, 106), (72, 48, 34)),
        hair=tone((12, 10, 10), (28, 22, 20), (48, 40, 36)),
        shirt=tone((118, 58, 42), (158, 86, 62), (178, 112, 86)),
        shorts=tone((42, 28, 20), (68, 46, 32), (92, 66, 48)),
        eye=rgba(62, 40, 26),
        brow=rgba(28, 20, 16),
        lip=rgba(120, 78, 68),
        presenting="masc",
        hair_style="wavy_short",
        face="older",
        facial_hair="moustache",
    ),
    "c12": Appearance(
        char_id="c12",
        skin=tone((140, 96, 68), (188, 140, 102), (214, 172, 132), (108, 72, 48)),
        hair=tone((78, 42, 28), (118, 68, 44), (148, 92, 62)),
        shirt=tone((42, 98, 98), (68, 132, 132), (98, 156, 156)),
        shorts=tone((72, 48, 32), (102, 72, 48), (128, 96, 68)),
        eye=rgba(98, 92, 48),
        brow=rgba(72, 42, 28),
        lip=rgba(158, 102, 92),
        presenting="fem",
        hair_style="cropped",
        face="energetic",
        freckles=True,
        expression="energetic",
    ),
}


# --- Canvas helpers ----------------------------------------------------------

class Canvas:
    def __init__(self, w: int = CELL, h: int = CELL) -> None:
        self.w = w
        self.h = h
        self.px: List[List[Color]] = [[TRANSPARENT for _ in range(w)] for _ in range(h)]

    def in_bounds(self, x: int, y: int) -> bool:
        return 0 <= x < self.w and 0 <= y < self.h

    def set(self, x: int, y: int, c: Color) -> None:
        if self.in_bounds(x, y) and c[3] > 0:
            self.px[y][x] = c

    def get(self, x: int, y: int) -> Color:
        if not self.in_bounds(x, y):
            return TRANSPARENT
        return self.px[y][x]

    def fill_ellipse(self, cx: int, cy: int, rx: int, ry: int, c: Color) -> None:
        for y in range(cy - ry, cy + ry + 1):
            for x in range(cx - rx, cx + rx + 1):
                nx = (x - cx) / max(rx, 1)
                ny = (y - cy) / max(ry, 1)
                if nx * nx + ny * ny <= 1.0:
                    self.set(x, y, c)

    def fill_rect(self, x0: int, y0: int, x1: int, y1: int, c: Color) -> None:
        for y in range(min(y0, y1), max(y0, y1) + 1):
            for x in range(min(x0, x1), max(x0, x1) + 1):
                self.set(x, y, c)

    def fill_diamondish(self, points: Sequence[Tuple[int, int]], c: Color) -> None:
        if not points:
            return
        xs = [p[0] for p in points]
        ys = [p[1] for p in points]
        for y in range(min(ys), max(ys) + 1):
            row = [p[0] for p in points if p[1] == y]
            if len(row) >= 2:
                self.fill_rect(min(row), y, max(row), y, c)
            elif len(row) == 1:
                self.set(row[0], y, c)
        # scanfill for convex-ish polygon
        for y in range(min(ys), max(ys) + 1):
            crossings: List[int] = []
            n = len(points)
            for i in range(n):
                x0, y0 = points[i]
                x1, y1 = points[(i + 1) % n]
                if y0 == y1:
                    continue
                if (y0 <= y < y1) or (y1 <= y < y0):
                    t = (y - y0) / (y1 - y0)
                    crossings.append(int(round(x0 + t * (x1 - x0))))
            crossings.sort()
            for i in range(0, len(crossings) - 1, 2):
                self.fill_rect(crossings[i], y, crossings[i + 1], y, c)

    def outline_opaque(self, color: Color = OUTLINE) -> None:
        """Add selective dark outline around opaque silhouette (outer edge only)."""
        opaque = {(x, y) for y in range(self.h) for x in range(self.w) if self.px[y][x][3] == 255}
        add: List[Tuple[int, int]] = []
        for x, y in opaque:
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if not self.in_bounds(nx, ny) or self.px[ny][nx][3] == 0:
                    # outline goes on empty neighbor if inside canvas
                    if self.in_bounds(nx, ny) and self.px[ny][nx][3] == 0:
                        add.append((nx, ny))
        for x, y in add:
            self.px[y][x] = color

    def shade_upper_left(self, material_mask: Iterable[Tuple[int, int]], tones: ToneSet) -> None:
        """Simple discrete shade: light upper-left, mid default, shadow lower-right."""
        pts = list(material_mask)
        if not pts:
            return
        min_x = min(p[0] for p in pts)
        max_x = max(p[0] for p in pts)
        min_y = min(p[1] for p in pts)
        max_y = max(p[1] for p in pts)
        for x, y in pts:
            if self.get(x, y)[3] == 0:
                continue
            rx = 0 if max_x == min_x else (x - min_x) / (max_x - min_x)
            ry = 0 if max_y == min_y else (y - min_y) / (max_y - min_y)
            score = (1.0 - rx) * 0.55 + (1.0 - ry) * 0.45
            if score > 0.72:
                self.set(x, y, tones.light)
            elif score < 0.32:
                self.set(x, y, tones.shadow)
            else:
                self.set(x, y, tones.mid)

    def to_image(self) -> Image.Image:
        img = Image.new("RGBA", (self.w, self.h), (0, 0, 0, 0))
        for y in range(self.h):
            for x in range(self.w):
                c = self.px[y][x]
                if c[3]:
                    img.putpixel((x, y), c)
        return img


# --- Pose parameters ---------------------------------------------------------

@dataclass
class LimbPose:
    # arm offsets relative to shoulder anchor (pixels)
    l_hand: Tuple[int, int] = (-10, 10)
    r_hand: Tuple[int, int] = (10, 10)
    # leg foot targets relative to hip
    l_foot: Tuple[int, int] = (-5, 18)
    r_foot: Tuple[int, int] = (5, 18)
    torso_bob: int = 0
    lean_x: int = 0
    # special flags for grip poses
    r_grip: bool = False
    l_bow: bool = False


def idle_pose(_: str) -> LimbPose:
    return LimbPose()


def move_pose(frame: int, direction: str) -> LimbPose:
    # 0 L contact, 1 L pass, 2 R contact, 3 R pass — all distinct
    if direction == "side":
        extras = [
            LimbPose(l_hand=(-7, 8), r_hand=(11, 12), l_foot=(-4, 18), r_foot=(9, 15), torso_bob=0),
            LimbPose(l_hand=(-8, 9), r_hand=(12, 10), l_foot=(-1, 16), r_foot=(7, 17), torso_bob=-1),
            LimbPose(l_hand=(-7, 12), r_hand=(11, 8), l_foot=(-5, 15), r_foot=(8, 18), torso_bob=0),
            LimbPose(l_hand=(-8, 10), r_hand=(12, 9), l_foot=(-2, 17), r_foot=(6, 16), torso_bob=-1),
        ]
        return extras[frame % 4]
    cycle = [
        LimbPose(l_hand=(-9, 8), r_hand=(9, 12), l_foot=(-7, 18), r_foot=(6, 15), torso_bob=0),
        LimbPose(l_hand=(-10, 9), r_hand=(10, 11), l_foot=(-4, 16), r_foot=(4, 17), torso_bob=-1),
        LimbPose(l_hand=(-9, 12), r_hand=(9, 8), l_foot=(-6, 15), r_foot=(7, 18), torso_bob=0),
        LimbPose(l_hand=(-10, 11), r_hand=(10, 9), l_foot=(-4, 17), r_foot=(4, 16), torso_bob=-1),
    ]
    return cycle[frame % 4]


def unarmed_pose(frame: int, direction: str) -> LimbPose:
    poses = [
        LimbPose(l_hand=(-11, 9), r_hand=(9, 9), l_foot=(-5, 18), r_foot=(5, 18)),  # compact
        LimbPose(l_hand=(-11, 10), r_hand=(7, 4), l_foot=(-6, 18), r_foot=(4, 18)),  # wind-up
        LimbPose(l_hand=(-10, 11), r_hand=(14, 6), l_foot=(-7, 18), r_foot=(3, 18), lean_x=1),  # punch
        LimbPose(l_hand=(-10, 10), r_hand=(11, 9), l_foot=(-5, 18), r_foot=(5, 18)),  # recover
    ]
    if direction == "side":
        poses = [
            LimbPose(l_hand=(-8, 9), r_hand=(10, 8), l_foot=(-3, 18), r_foot=(6, 18)),
            LimbPose(l_hand=(-8, 10), r_hand=(6, 3), l_foot=(-4, 18), r_foot=(5, 18)),
            LimbPose(l_hand=(-7, 11), r_hand=(16, 7), l_foot=(-5, 18), r_foot=(4, 18), lean_x=2),
            LimbPose(l_hand=(-8, 10), r_hand=(11, 9), l_foot=(-3, 18), r_foot=(6, 18)),
        ]
    if direction == "up":
        poses = [
            LimbPose(l_hand=(-10, 9), r_hand=(10, 9), l_foot=(-5, 18), r_foot=(5, 18)),
            LimbPose(l_hand=(-10, 10), r_hand=(8, 3), l_foot=(-5, 18), r_foot=(5, 18)),
            LimbPose(l_hand=(-10, 11), r_hand=(12, 2), l_foot=(-5, 18), r_foot=(5, 18)),
            LimbPose(l_hand=(-10, 10), r_hand=(10, 8), l_foot=(-5, 18), r_foot=(5, 18)),
        ]
    return poses[frame % 4]


def melee_pose(frame: int, direction: str) -> LimbPose:
    poses = [
        LimbPose(l_hand=(-10, 10), r_hand=(10, 6), r_grip=True, l_foot=(-5, 18), r_foot=(5, 18)),
        LimbPose(l_hand=(-11, 11), r_hand=(6, 1), r_grip=True, l_foot=(-6, 18), r_foot=(4, 18)),
        LimbPose(l_hand=(-9, 12), r_hand=(15, 8), r_grip=True, l_foot=(-7, 18), r_foot=(3, 18), lean_x=2),
        LimbPose(l_hand=(-10, 10), r_hand=(12, 10), r_grip=True, l_foot=(-5, 18), r_foot=(5, 18)),
    ]
    if direction == "side":
        poses = [
            LimbPose(l_hand=(-7, 10), r_hand=(11, 5), r_grip=True, l_foot=(-3, 18), r_foot=(6, 18)),
            LimbPose(l_hand=(-8, 11), r_hand=(5, 0), r_grip=True, l_foot=(-4, 18), r_foot=(5, 18)),
            LimbPose(l_hand=(-6, 12), r_hand=(17, 8), r_grip=True, l_foot=(-5, 18), r_foot=(4, 18), lean_x=2),
            LimbPose(l_hand=(-7, 10), r_hand=(12, 9), r_grip=True, l_foot=(-3, 18), r_foot=(6, 18)),
        ]
    if direction == "up":
        poses = [
            LimbPose(l_hand=(-10, 10), r_hand=(10, 4), r_grip=True),
            LimbPose(l_hand=(-10, 11), r_hand=(7, -1), r_grip=True),
            LimbPose(l_hand=(-10, 12), r_hand=(13, 3), r_grip=True),
            LimbPose(l_hand=(-10, 10), r_hand=(11, 8), r_grip=True),
        ]
    return poses[frame % 4]


def bow_pose(frame: int, direction: str) -> LimbPose:
    # L holds bow, R draws
    poses = [
        LimbPose(l_hand=(-8, 6), r_hand=(8, 8), l_bow=True, r_grip=True),
        LimbPose(l_hand=(-12, 2), r_hand=(6, 6), l_bow=True, r_grip=True),
        LimbPose(l_hand=(-12, 2), r_hand=(2, 4), l_bow=True, r_grip=True),
        LimbPose(l_hand=(-12, 2), r_hand=(-2, 3), l_bow=True, r_grip=True),
        LimbPose(l_hand=(-11, 3), r_hand=(4, 5), l_bow=True, r_grip=True),
    ]
    if direction == "side":
        poses = [
            LimbPose(l_hand=(8, 5), r_hand=(-2, 7), l_bow=True, r_grip=True),
            LimbPose(l_hand=(12, 2), r_hand=(-2, 6), l_bow=True, r_grip=True),
            LimbPose(l_hand=(12, 2), r_hand=(-6, 4), l_bow=True, r_grip=True),
            LimbPose(l_hand=(12, 2), r_hand=(-9, 3), l_bow=True, r_grip=True),
            LimbPose(l_hand=(11, 3), r_hand=(-4, 5), l_bow=True, r_grip=True),
        ]
    if direction == "up":
        poses = [
            LimbPose(l_hand=(-8, 4), r_hand=(8, 6), l_bow=True, r_grip=True),
            LimbPose(l_hand=(-11, 0), r_hand=(6, 4), l_bow=True, r_grip=True),
            LimbPose(l_hand=(-11, 0), r_hand=(2, 2), l_bow=True, r_grip=True),
            LimbPose(l_hand=(-11, 0), r_hand=(-1, 1), l_bow=True, r_grip=True),
            LimbPose(l_hand=(-10, 1), r_hand=(4, 3), l_bow=True, r_grip=True),
        ]
    return poses[frame % 5]


def cast_pose(frame: int, direction: str) -> LimbPose:
    poses = [
        LimbPose(l_hand=(-10, 10), r_hand=(10, 8)),
        LimbPose(l_hand=(-10, 10), r_hand=(9, 1)),
        LimbPose(l_hand=(-9, 9), r_hand=(11, -2)),
        LimbPose(l_hand=(-10, 10), r_hand=(10, 6)),
    ]
    if direction == "side":
        poses = [
            LimbPose(l_hand=(-7, 10), r_hand=(11, 7)),
            LimbPose(l_hand=(-7, 10), r_hand=(12, 0)),
            LimbPose(l_hand=(-6, 9), r_hand=(13, -3)),
            LimbPose(l_hand=(-7, 10), r_hand=(11, 5)),
        ]
    return poses[frame % 4]


def hurt_pose(_: int, direction: str) -> LimbPose:
    lean = -1 if direction != "side" else -2
    return LimbPose(
        l_hand=(-9, 11),
        r_hand=(8, 7),
        l_foot=(-4, 18),
        r_foot=(5, 18),
        lean_x=lean,
        torso_bob=0,
    )


def death_pose(frame: int) -> LimbPose:
    poses = [
        LimbPose(l_hand=(-8, 9), r_hand=(10, 6), l_foot=(-2, 18), r_foot=(7, 17), lean_x=2, torso_bob=0),
        LimbPose(l_hand=(-6, 12), r_hand=(12, 10), l_foot=(0, 16), r_foot=(8, 15), lean_x=3, torso_bob=2),
        LimbPose(l_hand=(-2, 14), r_hand=(14, 13), l_foot=(2, 12), r_foot=(10, 11), lean_x=4, torso_bob=6),
        LimbPose(l_hand=(2, 15), r_hand=(16, 15), l_foot=(4, 10), r_foot=(12, 10), lean_x=5, torso_bob=10),
    ]
    return poses[frame % 4]


# --- Drawing character -------------------------------------------------------

def _line(c: Canvas, x0: int, y0: int, x1: int, y1: int, color: Color, thickness: int = 2) -> None:
    steps = max(abs(x1 - x0), abs(y1 - y0), 1)
    for i in range(steps + 1):
        t = i / steps
        x = int(round(x0 + (x1 - x0) * t))
        y = int(round(y0 + (y1 - y0) * t))
        for dx in range(-(thickness // 2), thickness - thickness // 2):
            for dy in range(-(thickness // 2), thickness - thickness // 2):
                c.set(x + dx, y + dy, color)


def _hand(c: Canvas, x: int, y: int, skin: ToneSet, grip: bool = False) -> None:
    c.fill_rect(x - 2, y - 2, x + 2, y + 2, skin.mid)
    c.set(x - 2, y - 2, skin.light)
    c.set(x + 2, y + 2, skin.shadow)
    c.set(x - 1, y + 2, skin.mid)
    c.set(x + 1, y + 2, skin.mid)
    if grip:
        c.set(x, y - 3, skin.shadow)
        c.set(x + 1, y - 2, skin.mid)


def _foot(c: Canvas, x: int, y: int, skin: ToneSet, facing: str) -> None:
    if facing == "side":
        c.fill_rect(x - 1, y - 1, x + 5, y + 1, skin.mid)
        c.set(x - 1, y - 1, skin.light)
        c.set(x + 5, y, skin.shadow)
        c.set(x + 4, y + 1, skin.shadow)
    elif facing == "up":
        c.fill_rect(x - 3, y - 1, x + 3, y + 1, skin.mid)
        c.set(x - 2, y - 1, skin.light)
        c.set(x + 2, y + 1, skin.shadow)
    else:
        c.fill_rect(x - 3, y - 1, x + 3, y + 1, skin.mid)
        c.set(x - 2, y - 1, skin.light)
        c.set(x + 3, y, skin.shadow)
        c.set(x + 2, y + 1, skin.shadow)


def _hair_crown_down(c: Canvas, app: Appearance, hx: int, hy: int) -> None:
    """Hair on top/sides only — face stays clear below hy+1."""
    hair = app.hair
    style = app.hair_style
    # top cap
    c.fill_ellipse(hx, hy - 3, 8, 5, hair.mid)
    c.fill_rect(hx - 7, hy - 5, hx + 7, hy - 1, hair.mid)
    c.fill_rect(hx - 6, hy - 6, hx + 6, hy - 4, hair.light)
    # sideburns / temples (not over eyes)
    c.fill_rect(hx - 8, hy - 2, hx - 6, hy + 2, hair.mid)
    c.fill_rect(hx + 6, hy - 2, hx + 8, hy + 2, hair.mid)
    c.set(hx - 5, hy - 4, hair.light)
    c.set(hx + 3, hy - 2, hair.shadow)

    if style in ("auburn_bob", "curly_bob", "silver_bob"):
        c.fill_rect(hx - 9, hy, hx - 6, hy + 6, hair.mid)
        c.fill_rect(hx + 6, hy, hx + 9, hy + 6, hair.mid)
        c.set(hx - 8, hy + 5, hair.shadow)
        c.set(hx + 8, hy + 5, hair.shadow)
        if style == "curly_bob":
            for ox, oy in ((-8, 2), (-7, 4), (7, 2), (8, 4)):
                c.set(hx + ox, hy + oy, hair.light)
    elif style == "low_bun":
        c.fill_ellipse(hx, hy + 7, 4, 3, hair.mid)
        c.set(hx, hy + 6, hair.light)
    elif style == "low_knot":
        c.fill_ellipse(hx, hy + 6, 3, 3, hair.mid)
    elif style == "short_braids":
        _line(c, hx - 6, hy + 2, hx - 8, hy + 12, hair.mid, 2)
        _line(c, hx + 6, hy + 2, hx + 8, hy + 12, hair.mid, 2)
    elif style == "side_part":
        c.fill_rect(hx - 1, hy - 6, hx + 7, hy - 3, hair.light)
    elif style == "buzz":
        c.fill_ellipse(hx, hy - 3, 7, 4, hair.shadow)
    elif style == "coiled_short":
        for ox, oy in ((-5, -4), (-2, -6), (1, -5), (4, -4), (-6, -1), (5, -1)):
            c.fill_ellipse(hx + ox, hy + oy, 2, 2, hair.light if ox % 2 == 0 else hair.mid)
    elif style == "wavy_short":
        for ox in (-5, -2, 1, 4):
            c.set(hx + ox, hy - 1, hair.light)
            c.set(hx + ox + 1, hy, hair.shadow)


def _hair_crown_side(c: Canvas, app: Appearance, hx: int, hy: int) -> None:
    hair = app.hair
    style = app.hair_style
    # back of head + top; leave face (right side) clear
    c.fill_ellipse(hx - 1, hy - 2, 7, 7, hair.mid)
    c.fill_rect(hx - 7, hy - 5, hx + 2, hy + 2, hair.mid)
    c.fill_rect(hx - 5, hy - 6, hx + 1, hy - 3, hair.light)
    c.fill_rect(hx - 8, hy - 1, hx - 5, hy + 4, hair.shadow)  # nape
    if style in ("auburn_bob", "curly_bob", "silver_bob"):
        c.fill_rect(hx - 6, hy + 2, hx + 1, hy + 8, hair.mid)
        c.set(hx - 4, hy + 7, hair.shadow)
    elif style == "low_bun":
        c.fill_ellipse(hx - 5, hy + 5, 3, 3, hair.mid)
    elif style == "low_knot":
        c.fill_ellipse(hx - 4, hy + 4, 3, 3, hair.mid)
    elif style == "short_braids":
        _line(c, hx - 2, hy + 3, hx - 1, hy + 12, hair.mid, 2)
        _line(c, hx + 1, hy + 4, hx + 2, hy + 11, hair.shadow, 2)
    elif style == "side_part":
        c.fill_rect(hx - 2, hy - 6, hx + 3, hy - 3, hair.light)
    elif style == "buzz":
        c.fill_ellipse(hx - 1, hy - 2, 6, 5, hair.shadow)
    elif style == "coiled_short":
        for ox, oy in ((-4, -3), (-1, -5), (1, -3), (-5, 0)):
            c.fill_ellipse(hx + ox, hy + oy, 2, 2, hair.mid)


def _hair_crown_up(c: Canvas, app: Appearance, hx: int, hy: int) -> None:
    hair = app.hair
    style = app.hair_style
    c.fill_ellipse(hx, hy, 9, 8, hair.mid)
    c.fill_ellipse(hx - 2, hy - 2, 6, 5, hair.light)
    c.fill_ellipse(hx + 2, hy + 2, 6, 5, hair.shadow)
    if style in ("auburn_bob", "curly_bob", "silver_bob"):
        c.fill_ellipse(hx, hy + 5, 9, 5, hair.mid)
    elif style == "low_bun":
        c.fill_ellipse(hx, hy + 7, 4, 3, hair.mid)
        c.set(hx, hy + 6, hair.light)
    elif style == "low_knot":
        c.fill_ellipse(hx, hy + 6, 3, 3, hair.mid)
    elif style == "short_braids":
        _line(c, hx - 5, hy + 4, hx - 6, hy + 13, hair.mid, 2)
        _line(c, hx + 5, hy + 4, hx + 6, hy + 13, hair.mid, 2)
    elif style == "buzz":
        c.fill_ellipse(hx, hy, 8, 7, hair.shadow)
    elif style == "coiled_short":
        for ox, oy in ((-4, -3), (0, -5), (4, -2), (-5, 1), (3, 2), (0, 0)):
            c.fill_ellipse(hx + ox, hy + oy, 2, 2, hair.light if (ox + oy) % 2 else hair.mid)


def _draw_face_down(c: Canvas, app: Appearance, hx: int, hy: int) -> None:
    skin = app.skin
    # face plate (overwrites any hair bleed)
    c.fill_ellipse(hx, hy + 2, 7, 6, skin.mid)
    c.fill_rect(hx - 5, hy, hx + 5, hy + 7, skin.mid)
    c.set(hx - 3, hy, skin.light)
    c.set(hx - 2, hy + 1, skin.light)
    c.set(hx + 3, hy + 5, skin.shadow)
    # eyes with sclera
    c.set(hx - 3, hy + 2, rgba(245, 240, 230, 255))
    c.set(hx + 2, hy + 2, rgba(245, 240, 230, 255))
    c.set(hx - 2, hy + 2, app.eye)
    c.set(hx + 3, hy + 2, app.eye)
    # strong brows
    for ox in (-4, -3, -2):
        c.set(hx + ox, hy + 1, app.brow)
    for ox in (1, 2, 3):
        c.set(hx + ox, hy + 1, app.brow)
    c.set(hx, hy + 4, skin.shadow)  # nose
    c.set(hx - 1, hy + 6, app.lip)
    c.set(hx, hy + 6, app.lip)
    c.set(hx + 1, hy + 6, app.lip)
    if app.freckles:
        for ox, oy in ((-4, 4), (-2, 5), (2, 5), (4, 4)):
            c.set(hx + ox, hy + oy, rgba(168, 108, 88, 255))
    _facial_hair_down(c, app, hx, hy)


def _draw_face_side(c: Canvas, app: Appearance, hx: int, hy: int) -> None:
    skin = app.skin
    # profile face toward +X (right)
    c.fill_ellipse(hx + 2, hy + 1, 5, 7, skin.mid)
    c.fill_rect(hx - 1, hy - 1, hx + 5, hy + 7, skin.mid)
    # nose bump
    c.set(hx + 6, hy + 2, skin.mid)
    c.set(hx + 7, hy + 3, skin.mid)
    c.set(hx + 6, hy + 4, skin.shadow)
    c.set(hx + 3, hy, skin.light)
    # eye
    c.set(hx + 3, hy + 2, rgba(245, 240, 230, 255))
    c.set(hx + 4, hy + 2, app.eye)
    c.set(hx + 3, hy + 1, app.brow)
    c.set(hx + 4, hy + 1, app.brow)
    c.set(hx + 5, hy + 6, app.lip)
    if app.freckles:
        for ox, oy in ((4, 4), (5, 5)):
            c.set(hx + ox, hy + oy, rgba(168, 108, 88, 255))
    _facial_hair_side(c, app, hx, hy)


def _facial_hair_down(c: Canvas, app: Appearance, hx: int, hy: int) -> None:
    if app.facial_hair == "none":
        return
    col = app.hair.mid
    sh = app.hair.shadow
    if app.facial_hair == "stubble":
        for ox, oy in ((-3, 7), (-1, 8), (1, 8), (3, 7), (0, 7), (-2, 8), (2, 8)):
            c.set(hx + ox, hy + oy, sh)
    elif app.facial_hair == "beard":
        c.fill_ellipse(hx, hy + 8, 6, 4, col)
        c.fill_rect(hx - 5, hy + 6, hx + 5, hy + 10, col)
        c.set(hx, hy + 9, sh)
    elif app.facial_hair == "moustache":
        for ox in (-2, -1, 0, 1, 2):
            c.set(hx + ox, hy + 5, col)


def _facial_hair_side(c: Canvas, app: Appearance, hx: int, hy: int) -> None:
    if app.facial_hair == "none":
        return
    col = app.hair.mid
    sh = app.hair.shadow
    if app.facial_hair == "stubble":
        for ox, oy in ((3, 6), (4, 7), (5, 7), (4, 8)):
            c.set(hx + ox, hy + oy, sh)
    elif app.facial_hair == "beard":
        c.fill_rect(hx + 1, hy + 6, hx + 5, hy + 10, col)
        c.set(hx + 4, hy + 9, sh)
    elif app.facial_hair == "moustache":
        c.set(hx + 4, hy + 5, col)
        c.set(hx + 5, hy + 5, col)
        c.set(hx + 6, hy + 5, col)


def draw_character(app: Appearance, direction: str, pose: LimbPose, death_floor: bool = False) -> Canvas:
    c = Canvas()
    bob = pose.torso_bob
    lean = pose.lean_x

    hip_x = CX + lean
    hip_y = 37 + bob
    if death_floor:
        hip_y = min(48, 37 + bob)

    shoulder_y = hip_y - 13
    # side view shifts head slightly forward (right)
    head_x = hip_x + (2 if direction == "side" else 0)
    head_y = shoulder_y - 9

    shoulder_w = 11 if app.presenting == "masc" else 10
    hip_w = 9 if app.presenting == "masc" else 10
    shirt, shorts, skin = app.shirt, app.shorts, app.skin

    # legs
    if direction == "side":
        l_hip = (hip_x - 1, hip_y + 1)
        r_hip = (hip_x + 2, hip_y + 1)
    else:
        l_hip = (hip_x - 4, hip_y + 1)
        r_hip = (hip_x + 4, hip_y + 1)

    l_foot = (hip_x + pose.l_foot[0], min(BASELINE, max(BASELINE - 4, BASELINE + pose.l_foot[1] - 18)))
    r_foot = (hip_x + pose.r_foot[0], min(BASELINE, max(BASELINE - 4, BASELINE + pose.r_foot[1] - 18)))
    if death_floor and pose.torso_bob >= 6:
        l_foot = (hip_x + pose.l_foot[0], min(BASELINE, hip_y + 8))
        r_foot = (hip_x + pose.r_foot[0], min(BASELINE, hip_y + 8))

    _line(c, l_hip[0], l_hip[1], l_foot[0], l_foot[1] - 2, skin.mid, 3)
    _line(c, r_hip[0], r_hip[1], r_foot[0], r_foot[1] - 2, skin.mid, 3)
    c.set((l_hip[0] + l_foot[0]) // 2 + 1, (l_hip[1] + l_foot[1]) // 2, skin.shadow)
    c.set((r_hip[0] + r_foot[0]) // 2 + 1, (r_hip[1] + r_foot[1]) // 2, skin.shadow)

    # shorts
    if direction == "side":
        c.fill_rect(hip_x - 3, hip_y - 2, hip_x + 5, hip_y + 6, shorts.mid)
        c.fill_rect(hip_x - 2, hip_y - 1, hip_x + 2, hip_y + 2, shorts.light)
        c.fill_rect(hip_x + 3, hip_y + 2, hip_x + 5, hip_y + 6, shorts.shadow)
    else:
        c.fill_rect(hip_x - hip_w + 1, hip_y - 2, hip_x + hip_w - 1, hip_y + 6, shorts.mid)
        c.fill_rect(hip_x - hip_w + 2, hip_y - 1, hip_x - 1, hip_y + 2, shorts.light)
        c.fill_rect(hip_x + 1, hip_y + 2, hip_x + hip_w - 2, hip_y + 6, shorts.shadow)

    # torso / shirt
    if direction == "side":
        c.fill_rect(hip_x - 3, shoulder_y, hip_x + 6, hip_y, shirt.mid)
        c.fill_rect(hip_x - 2, shoulder_y + 1, hip_x + 2, hip_y - 2, shirt.light)
        c.fill_rect(hip_x + 3, shoulder_y + 4, hip_x + 6, hip_y - 1, shirt.shadow)
        # chest forward read
        c.set(hip_x + 6, shoulder_y + 5, shirt.mid)
        c.set(hip_x + 7, shoulder_y + 6, shirt.shadow)
    elif direction == "up":
        c.fill_rect(hip_x - shoulder_w + 1, shoulder_y, hip_x + shoulder_w - 1, hip_y, shirt.mid)
        c.fill_rect(hip_x - 4, shoulder_y + 1, hip_x + 4, shoulder_y + 4, shirt.shadow)
        c.set(hip_x - 5, shoulder_y + 3, shirt.light)
    else:
        c.fill_rect(hip_x - shoulder_w + 1, shoulder_y, hip_x + shoulder_w - 1, hip_y, shirt.mid)
        c.fill_rect(hip_x - shoulder_w + 2, shoulder_y + 1, hip_x - 1, hip_y - 3, shirt.light)
        c.fill_rect(hip_x + 2, shoulder_y + 4, hip_x + shoulder_w - 2, hip_y - 1, shirt.shadow)
        c.set(hip_x - 1, shoulder_y + 1, shirt.light)
        c.set(hip_x, shoulder_y + 1, skin.mid)
        c.set(hip_x + 1, shoulder_y + 1, shirt.light)

    # neck
    if direction == "side":
        c.fill_rect(head_x - 1, head_y + 6, head_x + 2, shoulder_y + 1, skin.mid)
    else:
        c.fill_rect(head_x - 2, head_y + 6, head_x + 2, shoulder_y + 1, skin.mid)

    # arms
    if direction == "side":
        # far (left) arm slightly behind, near (right) arm forward
        l_shoulder = (hip_x - 1, shoulder_y + 4)
        r_shoulder = (hip_x + 4, shoulder_y + 3)
    else:
        l_shoulder = (hip_x - shoulder_w + 2, shoulder_y + 3)
        r_shoulder = (hip_x + shoulder_w - 2, shoulder_y + 3)

    l_hand = (max(3, min(60, l_shoulder[0] + pose.l_hand[0])), max(3, min(60, l_shoulder[1] + pose.l_hand[1])))
    r_hand = (max(3, min(60, r_shoulder[0] + pose.r_hand[0])), max(3, min(60, r_shoulder[1] + pose.r_hand[1])))

    if direction == "side":
        # draw far arm first
        _line(c, l_shoulder[0], l_shoulder[1], l_hand[0], l_hand[1], skin.shadow, 3)
        _line(c, l_shoulder[0], l_shoulder[1], (l_shoulder[0] + l_hand[0]) // 2, (l_shoulder[1] + l_hand[1]) // 2, shirt.shadow, 3)
        _hand(c, l_hand[0], l_hand[1], skin, grip=pose.l_bow)

    _line(c, r_shoulder[0], r_shoulder[1], r_hand[0], r_hand[1], skin.mid, 3)
    _line(
        c,
        r_shoulder[0],
        r_shoulder[1],
        (r_shoulder[0] + r_hand[0]) // 2,
        (r_shoulder[1] + r_hand[1]) // 2,
        shirt.mid if direction == "side" else shirt.shadow,
        3,
    )
    _hand(c, r_hand[0], r_hand[1], skin, grip=pose.r_grip)

    if direction != "side":
        _line(c, l_shoulder[0], l_shoulder[1], l_hand[0], l_hand[1], skin.mid, 3)
        _line(
            c,
            l_shoulder[0],
            l_shoulder[1],
            (l_shoulder[0] + l_hand[0]) // 2,
            (l_shoulder[1] + l_hand[1]) // 2,
            shirt.shadow,
            3,
        )
        _hand(c, l_hand[0], l_hand[1], skin, grip=pose.l_bow)

    # head sphere
    if direction == "side":
        c.fill_ellipse(head_x, head_y, 7, 8, skin.mid)
        c.set(head_x - 2, head_y - 2, skin.light)
        c.set(head_x + 2, head_y + 3, skin.shadow)
        _hair_crown_side(c, app, head_x, head_y)
        _draw_face_side(c, app, head_x, head_y)
        # ear
        c.fill_rect(head_x - 6, head_y, head_x - 4, head_y + 3, skin.mid)
        c.set(head_x - 5, head_y + 1, skin.shadow)
    elif direction == "up":
        c.fill_ellipse(head_x, head_y, 8, 8, skin.mid)
        _hair_crown_up(c, app, head_x, head_y)
        # ears
        c.fill_rect(head_x - 9, head_y + 1, head_x - 7, head_y + 4, skin.mid)
        c.fill_rect(head_x + 7, head_y + 1, head_x + 9, head_y + 4, skin.mid)
        # neck hint under hair
        c.fill_rect(head_x - 2, head_y + 7, head_x + 2, shoulder_y + 1, skin.shadow)
    else:
        c.fill_ellipse(head_x, head_y, 8, 8, skin.mid)
        c.set(head_x - 3, head_y - 2, skin.light)
        c.set(head_x + 3, head_y + 3, skin.shadow)
        _hair_crown_down(c, app, head_x, head_y)
        _draw_face_down(c, app, head_x, head_y)

    # feet
    face_ft = "side" if direction == "side" else ("up" if direction == "up" else "down")
    _foot(c, l_foot[0], l_foot[1], skin, face_ft)
    _foot(c, r_foot[0], r_foot[1], skin, face_ft)

    c.outline_opaque(OUTLINE)
    return c


# --- Sheet builders ----------------------------------------------------------

DIRECTIONS_3 = ("down", "side", "up")


def compose_sheet(frames: Sequence[Sequence[Image.Image]]) -> Image.Image:
    """frames[row][col] each 64x64."""
    rows = len(frames)
    cols = max(len(r) for r in frames)
    sheet = Image.new("RGBA", (cols * CELL, rows * CELL), (0, 0, 0, 0))
    for ry, row in enumerate(frames):
        for cx, fr in enumerate(row):
            sheet.paste(fr, (cx * CELL, ry * CELL), fr)
    return sheet


def render_frame(app: Appearance, direction: str, pose: LimbPose, death: bool = False) -> Image.Image:
    return draw_character(app, direction, pose, death_floor=death).to_image()


def make_idle(app: Appearance) -> Image.Image:
    rows = []
    for d in DIRECTIONS_3:
        rows.append([render_frame(app, d, idle_pose(d))])
    return compose_sheet(rows)


def make_move(app: Appearance) -> Image.Image:
    rows = []
    for d in DIRECTIONS_3:
        rows.append([render_frame(app, d, move_pose(i, d)) for i in range(4)])
    return compose_sheet(rows)


def make_attack_unarmed(app: Appearance) -> Image.Image:
    rows = []
    for d in DIRECTIONS_3:
        rows.append([render_frame(app, d, unarmed_pose(i, d)) for i in range(4)])
    return compose_sheet(rows)


def make_attack_melee(app: Appearance) -> Image.Image:
    rows = []
    for d in DIRECTIONS_3:
        rows.append([render_frame(app, d, melee_pose(i, d)) for i in range(4)])
    return compose_sheet(rows)


def make_attack_bow(app: Appearance) -> Image.Image:
    rows = []
    for d in DIRECTIONS_3:
        rows.append([render_frame(app, d, bow_pose(i, d)) for i in range(5)])
    return compose_sheet(rows)


def make_cast(app: Appearance) -> Image.Image:
    rows = []
    for d in DIRECTIONS_3:
        rows.append([render_frame(app, d, cast_pose(i, d)) for i in range(4)])
    return compose_sheet(rows)


def make_hurt(app: Appearance) -> Image.Image:
    rows = []
    for d in DIRECTIONS_3:
        rows.append([render_frame(app, d, hurt_pose(0, d))])
    return compose_sheet(rows)


def make_death(app: Appearance) -> Image.Image:
    row = [render_frame(app, "side", death_pose(i), death=True) for i in range(4)]
    return compose_sheet([row])


SHEET_BUILDERS: Dict[str, Callable[[Appearance], Image.Image]] = {
    "idle": make_idle,
    "move": make_move,
    "attack_unarmed": make_attack_unarmed,
    "attack_melee": make_attack_melee,
    "attack_bow": make_attack_bow,
    "cast": make_cast,
    "hurt": make_hurt,
    "death": make_death,
}

EXPECTED_SIZES = {
    "idle": (64, 192),
    "move": (256, 192),
    "attack_unarmed": (256, 192),
    "attack_melee": (256, 192),
    "attack_bow": (320, 192),
    "cast": (256, 192),
    "hurt": (64, 192),
    "death": (256, 64),
}


def save_sheet(app: Appearance, anim: str) -> Path:
    builder = SHEET_BUILDERS[anim]
    img = builder(app)
    expected = EXPECTED_SIZES[anim]
    if img.size != expected:
        raise RuntimeError(f"{app.char_id}_{anim} size {img.size} != {expected}")
    out_dir = SHEETS / app.char_id
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"{app.char_id}_{anim}.png"
    img.save(path, optimize=True)
    return path


def write_preview_grid(paths: Sequence[Path], out: Path, scale: int = 4) -> None:
    """Nearest-neighbor scaled montage for human review."""
    images = [Image.open(p).convert("RGBA") for p in paths]
    pad = 8
    widths = [im.width * scale for im in images]
    heights = [im.height * scale for im in images]
    total_w = max(widths) + pad * 2
    total_h = sum(heights) + pad * (len(images) + 1)
    canvas = Image.new("RGBA", (total_w, total_h), (36, 32, 28, 255))
    y = pad
    for im, h in zip(images, heights):
        scaled = im.resize((im.width * scale, im.height * scale), Image.NEAREST)
        x = pad + (max(widths) - scaled.width) // 2
        canvas.paste(scaled, (x, y), scaled)
        y += h + pad
    out.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out)


def zip_paths(paths: Sequence[Path], zip_path: Path) -> Path:
    zip_path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.write(ROOT / "STYLE_LOCK.md", arcname="STYLE_LOCK.md")
        for p in paths:
            zf.write(p, arcname=f"sheets/{p.parent.name}/{p.name}")
        preview = DELIVERABLES / "c01_validation_preview.png"
        if preview.exists():
            zf.write(preview, arcname="c01_validation_preview.png")
    return zip_path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--batch",
        choices=["c01_validation", "c01_full", "all"],
        default="c01_validation",
    )
    args = parser.parse_args()

    if args.batch == "c01_validation":
        anims = ["idle", "move", "attack_unarmed", "attack_melee"]
        chars = ["c01"]
    elif args.batch == "c01_full":
        anims = list(SHEET_BUILDERS.keys())
        chars = ["c01"]
    else:
        anims = list(SHEET_BUILDERS.keys())
        chars = list(APPEARANCES.keys())

    written: List[Path] = []
    for cid in chars:
        app = APPEARANCES[cid]
        for anim in anims:
            path = save_sheet(app, anim)
            written.append(path)
            print(f"wrote {path.relative_to(ROOT)} {Image.open(path).size}")

    if args.batch == "c01_validation":
        preview = DELIVERABLES / "c01_validation_preview.png"
        write_preview_grid(written, preview, scale=3)
        print(f"wrote preview {preview}")
        zpath = DELIVERABLES / "c01_validation_batch.zip"
        zip_paths(written, zpath)
        print(f"wrote zip {zpath}")


if __name__ == "__main__":
    main()
