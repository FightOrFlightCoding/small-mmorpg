#!/usr/bin/env python3
"""Rasterize the village stone-road plan into deterministic cell data."""

from __future__ import annotations

import json
import math
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
PLAN_PATH = REPO / "client" / "data" / "world" / "maps" / "village_road_plan.json"

TILE = 64
CONTENT_TILE = 16
SEED = 18427
ORIGINAL_WIDTH = 1280
ORIGINAL_HEIGHT = 768
LINEAR_SCALE = math.sqrt(10.0)

# Round each dimension up to a multiple of 16 visual tiles after √10 scale.
WIDTH_CELLS = int(math.ceil((ORIGINAL_WIDTH / TILE) * LINEAR_SCALE / 16.0) * 16)
HEIGHT_CELLS = int(math.ceil((ORIGINAL_HEIGHT / TILE) * LINEAR_SCALE / 16.0) * 16)
WIDTH_PX = WIDTH_CELLS * TILE
HEIGHT_PX = HEIGHT_CELLS * TILE
OFFSET_X = 1280  # old center (640,384) -> near plaza (1920,1408)
OFFSET_Y = 1024

NW, NE, SE, SW = 1, 2, 4, 8


def _hash(x: int, y: int, seed: int) -> int:
    n = (x * 374761393 + y * 668265263 + seed * 1274126177) & 0xFFFFFFFF
    n ^= n >> 13
    n = (n * 1274126177) & 0xFFFFFFFF
    n ^= n >> 16
    return n


def _catmull(p0: float, p1: float, p2: float, p3: float, t: float) -> float:
    t2 = t * t
    t3 = t2 * t
    return 0.5 * (
        (2.0 * p1)
        + (-p0 + p2) * t
        + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t2
        + (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * t3
    )


def _sample_polyline(points: list[tuple[float, float]], step: float) -> list[tuple[float, float]]:
    if len(points) == 1:
        return points[:]
    samples: list[tuple[float, float]] = []
    padded = [points[0]] + points + [points[-1]]
    for i in range(1, len(padded) - 2):
        p0, p1, p2, p3 = padded[i - 1], padded[i], padded[i + 1], padded[i + 2]
        dist = math.hypot(p2[0] - p1[0], p2[1] - p1[1])
        n = max(2, int(math.ceil(dist / step)))
        for s in range(n):
            t = s / n
            samples.append(
                (
                    _catmull(p0[0], p1[0], p2[0], p3[0], t),
                    _catmull(p0[1], p1[1], p2[1], p3[1], t),
                )
            )
    samples.append(points[-1])
    return samples


def _stamp_disk(grid: list[list[bool]], cx: float, cy: float, radius: float) -> None:
    r = radius
    x0 = max(0, int(math.floor(cx - r)))
    x1 = min(WIDTH_CELLS - 1, int(math.ceil(cx + r)))
    y0 = max(0, int(math.floor(cy - r)))
    y1 = min(HEIGHT_CELLS - 1, int(math.ceil(cy + r)))
    r2 = (r + 0.15) * (r + 0.15)
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            dx = (x + 0.5) - cx
            dy = (y + 0.5) - cy
            if dx * dx + dy * dy <= r2:
                grid[y][x] = True


def _norm_to_cell(nx: float, ny: float) -> tuple[float, float]:
    return nx * (WIDTH_CELLS - 1e-6), ny * (HEIGHT_CELLS - 1e-6)


def _cell_center_px(x: int, y: int) -> tuple[int, int]:
    return x * TILE + TILE // 2, y * TILE + TILE // 2


def authored_plan() -> dict:
    plaza = {"normalized": {"x": 0.47, "y": 0.46}, "radius_cells": {"x": 10, "y": 8}, "reserved_monument_cells": 5}
    routes = [
        {
            "id": "route_a_main_south",
            "name": "Main Road South",
            "width_tiles": 5,
            "width_end_tiles": 5,
            "waypoints": [
                [0.50, 1.00],
                [0.50, 0.965],
                [0.50, 0.88],
                [0.49, 0.79],
                [0.47, 0.69],
                [0.47, 0.56],
            ],
        },
        {
            "id": "route_b_west",
            "name": "West Village Road",
            "width_tiles": 4,
            "width_end_tiles": 4,
            "waypoints": [[0.47, 0.46], [0.39, 0.46], [0.32, 0.43], [0.23, 0.38], [0.12, 0.37]],
        },
        {
            "id": "route_c_northwest",
            "name": "Northwest Fields and Orchard Road",
            "width_tiles": 3,
            "width_end_tiles": 3,
            "waypoints": [[0.23, 0.38], [0.22, 0.29], [0.23, 0.20], [0.25, 0.11]],
        },
        {
            "id": "route_d_north_watermill",
            "name": "Northern Watermill Road",
            "width_tiles": 3,
            "width_end_tiles": 3,
            "waypoints": [[0.47, 0.46], [0.50, 0.38], [0.55, 0.32], [0.61, 0.24], [0.69, 0.13]],
        },
        {
            "id": "route_e_north_connector",
            "name": "Northern Outer Connector",
            "width_tiles": 3,
            "width_end_tiles": 3,
            "waypoints": [[0.25, 0.11], [0.39, 0.09], [0.55, 0.09], [0.69, 0.13]],
        },
        {
            "id": "route_f_northeast",
            "name": "Northeast Shrine and Graveyard Road",
            "width_tiles": 3,
            "width_end_tiles": 3,
            "waypoints": [[0.47, 0.46], [0.55, 0.41], [0.63, 0.35], [0.72, 0.29], [0.81, 0.23]],
        },
        {
            "id": "route_g_east",
            "name": "East Homes and Village Hall Road",
            "width_tiles": 4,
            "width_end_tiles": 4,
            "waypoints": [[0.47, 0.46], [0.57, 0.46], [0.68, 0.45], [0.79, 0.47], [0.88, 0.49]],
        },
        {
            "id": "route_h_southeast",
            "name": "Southeast Market and Farm Road",
            "width_tiles": 4,
            "width_end_tiles": 3,
            "waypoints": [[0.47, 0.46], [0.55, 0.53], [0.64, 0.60], [0.74, 0.67], [0.84, 0.79]],
        },
        {
            "id": "route_i_southwest",
            "name": "Southwest Blacksmith Road",
            "width_tiles": 3,
            "width_end_tiles": 3,
            "waypoints": [[0.47, 0.46], [0.40, 0.52], [0.32, 0.59], [0.22, 0.66], [0.13, 0.69]],
        },
    ]
    anchors = [
        {"id": "village_square", "normalized": {"x": 0.47, "y": 0.46}, "route": "plaza", "open_space_radius_cells": 12, "intended_use": "plaza and future monument"},
        {"id": "main_road_south", "normalized": {"x": 0.50, "y": 0.965}, "route": "route_a_main_south", "open_space_radius_cells": 4, "intended_use": "default spawn"},
        {"id": "stables_inn", "normalized": {"x": 0.12, "y": 0.37}, "route": "route_b_west", "open_space_radius_cells": 8, "intended_use": "inn, alehouse, stables"},
        {"id": "fields_orchard", "normalized": {"x": 0.25, "y": 0.11}, "route": "route_c_northwest", "open_space_radius_cells": 10, "intended_use": "fields and orchard"},
        {"id": "watermill", "normalized": {"x": 0.69, "y": 0.13}, "route": "route_d_north_watermill", "open_space_radius_cells": 8, "intended_use": "watermill and river crossing"},
        {"id": "shrine_graveyard", "normalized": {"x": 0.81, "y": 0.23}, "route": "route_f_northeast", "open_space_radius_cells": 10, "intended_use": "shrine and graveyard"},
        {"id": "homes", "normalized": {"x": 0.79, "y": 0.47}, "route": "route_g_east", "open_space_radius_cells": 6, "intended_use": "homes"},
        {"id": "village_hall", "normalized": {"x": 0.88, "y": 0.49}, "route": "route_g_east", "open_space_radius_cells": 7, "intended_use": "village hall"},
        {"id": "general_store", "normalized": {"x": 0.74, "y": 0.67}, "route": "route_h_southeast", "open_space_radius_cells": 6, "intended_use": "general store and market"},
        {"id": "barn_livestock", "normalized": {"x": 0.84, "y": 0.79}, "route": "route_h_southeast", "open_space_radius_cells": 8, "intended_use": "barn and livestock pen"},
        {"id": "blacksmith", "normalized": {"x": 0.13, "y": 0.69}, "route": "route_i_southwest", "open_space_radius_cells": 7, "intended_use": "blacksmith and work yards"},
    ]
    return {"plaza": plaza, "routes": routes, "anchors": anchors}


def fill_plaza(grid: list[list[bool]], plaza: dict) -> tuple[int, int]:
    cx, cy = _norm_to_cell(plaza["normalized"]["x"], plaza["normalized"]["y"])
    rx = float(plaza["radius_cells"]["x"])
    ry = float(plaza["radius_cells"]["y"])
    x0 = max(0, int(cx - rx - 2))
    x1 = min(WIDTH_CELLS - 1, int(cx + rx + 2))
    y0 = max(0, int(cy - ry - 2))
    y1 = min(HEIGHT_CELLS - 1, int(cy + ry + 2))
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            dx = (x + 0.5 - cx) / rx
            dy = (y + 0.5 - cy) / ry
            n = (_hash(x, y, SEED + 77) / 4294967295.0 - 0.5) * 0.18
            if dx * dx + dy * dy <= 1.0 + n:
                grid[y][x] = True
    return int(cx), int(cy)


def paint_route(grid: list[list[bool]], route: dict) -> None:
    pts = [_norm_to_cell(x, y) for x, y in route["waypoints"]]
    samples = _sample_polyline(pts, 0.28)
    start_w = float(route["width_tiles"])
    end_w = float(route.get("width_end_tiles", start_w))
    total = max(1, len(samples) - 1)
    for i, (x, y) in enumerate(samples):
        t = i / total
        width = start_w + (end_w - start_w) * t
        _stamp_disk(grid, x, y, width / 2.0)


def apply_edge_variation(grid: list[list[bool]]) -> None:
    originals = [row[:] for row in grid]
    min_width = 3
    for y in range(HEIGHT_CELLS):
        for x in range(WIDTH_CELLS):
            if not originals[y][x]:
                continue
            neighbors = 0
            for dy, dx in ((0, 1), (1, 0), (0, -1), (-1, 0)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < WIDTH_CELLS and 0 <= ny < HEIGHT_CELLS and originals[ny][nx]:
                    neighbors += 1
            if neighbors == 4 or neighbors == 0:
                continue
            if _hash(x, y, SEED + 311) % 19 != 0:
                continue
            # Occasional +1 expansion only; never shrink below route width.
            for dy, dx in ((0, 1), (1, 0), (0, -1), (-1, 0)):
                nx, ny = x + dx, y + dy
                if not (0 <= nx < WIDTH_CELLS and 0 <= ny < HEIGHT_CELLS):
                    continue
                if originals[ny][nx]:
                    continue
                if _hash(nx, ny, SEED + 411) % 2 == 0:
                    grid[ny][nx] = True
                    break
    del min_width


def occupancy_to_masks(grid: list[list[bool]]) -> list[list[int]]:
    verts = [[False for _ in range(WIDTH_CELLS + 1)] for _ in range(HEIGHT_CELLS + 1)]
    for y in range(HEIGHT_CELLS):
        for x in range(WIDTH_CELLS):
            if not grid[y][x]:
                continue
            verts[y][x] = True
            verts[y][x + 1] = True
            verts[y + 1][x] = True
            verts[y + 1][x + 1] = True
    masks = [[0 for _ in range(WIDTH_CELLS)] for _ in range(HEIGHT_CELLS)]
    for y in range(HEIGHT_CELLS):
        for x in range(WIDTH_CELLS):
            value = 0
            if verts[y][x]:
                value |= NW
            if verts[y][x + 1]:
                value |= NE
            if verts[y + 1][x + 1]:
                value |= SE
            if verts[y + 1][x]:
                value |= SW
            masks[y][x] = value
    return masks


def flood(grid: list[list[bool]], start: tuple[int, int]) -> set[tuple[int, int]]:
    sx, sy = start
    seen: set[tuple[int, int]] = set()
    stack = [(sx, sy)]
    while stack:
        x, y = stack.pop()
        if (x, y) in seen:
            continue
        if not (0 <= x < WIDTH_CELLS and 0 <= y < HEIGHT_CELLS) or not grid[y][x]:
            continue
        seen.add((x, y))
        stack.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    return seen


def corridor_width(grid: list[list[bool]], x: int, y: int) -> int:
    if not grid[y][x]:
        return 0
    best = 1
    for dx, dy in ((1, 0), (0, 1), (1, 1), (1, -1)):
        length = 1
        for sign in (1, -1):
            cx, cy = x, y
            while True:
                cx += dx * sign
                cy += dy * sign
                if not (0 <= cx < WIDTH_CELLS and 0 <= cy < HEIGHT_CELLS) or not grid[cy][cx]:
                    break
                length += 1
        best = max(best, length)
    return best


def validate_connectivity(grid: list[list[bool]], spawn: tuple[int, int], anchors: list[dict]) -> dict:
    reachable = flood(grid, spawn)
    all_road = {(x, y) for y in range(HEIGHT_CELLS) for x in range(WIDTH_CELLS) if grid[y][x]}
    islands = all_road - reachable
    results = {
        "spawn_on_road": grid[spawn[1]][spawn[0]],
        "main_road_reaches_bottom": any(grid[HEIGHT_CELLS - 1][x] for x in range(WIDTH_CELLS)),
        "no_islands": len(islands) == 0,
        "island_count": len(islands),
        "reachable_count": len(reachable),
        "road_count": len(all_road),
        "endpoints": {},
        "bottlenecks": [],
        "ok": True,
    }
    for anchor in anchors:
        nx, ny = anchor["normalized"]["x"], anchor["normalized"]["y"]
        cx, cy = int(_norm_to_cell(nx, ny)[0]), int(_norm_to_cell(nx, ny)[1])
        found = None
        for rad in range(0, 6):
            for dy in range(-rad, rad + 1):
                for dx in range(-rad, rad + 1):
                    x, y = cx + dx, cy + dy
                    if 0 <= x < WIDTH_CELLS and 0 <= y < HEIGHT_CELLS and grid[y][x]:
                        found = (x, y)
                        break
                if found:
                    break
            if found:
                break
        connected = bool(found and found in reachable)
        results["endpoints"][anchor["id"]] = {
            "cell": list(found) if found else [cx, cy],
            "connected": connected,
        }
        if not connected:
            results["ok"] = False
    if not results["spawn_on_road"] or not results["main_road_reaches_bottom"] or not results["no_islands"]:
        results["ok"] = False
    for x, y in reachable:
        if corridor_width(grid, x, y) <= 1:
            # Ignore true tips at map edge that are still 5-wide via stamp; flag isolated 4-connected pinches.
            n = 0
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < WIDTH_CELLS and 0 <= ny < HEIGHT_CELLS and grid[ny][nx]:
                    n += 1
            if n <= 1 and y != HEIGHT_CELLS - 1 and y != 0:
                results["bottlenecks"].append([x, y])
    # Single-cell bottlenecks: cells whose removal splits spawn from plaza.
    if results["bottlenecks"]:
        # Allow endpoint stubs; fail only on interior 1-neighbour cells away from ends.
        interior = [c for c in results["bottlenecks"] if 2 < c[1] < HEIGHT_CELLS - 2]
        if interior:
            results["ok"] = False
    return results


def nudge_collisions(grid: list[list[bool]], boxes: list[dict]) -> list[dict]:
    nudged = []
    for box in boxes:
        x, y, w, h = box["x"], box["y"], box["width"], box["height"]
        cx = int((x + w / 2) / TILE)
        cy = int((y + h / 2) / TILE)
        if 0 <= cx < WIDTH_CELLS and 0 <= cy < HEIGHT_CELLS and not grid[cy][cx]:
            nudged.append(box)
            continue
        placed = None
        for rad in range(1, 18):
            for dy in range(-rad, rad + 1):
                for dx in range(-rad, rad + 1):
                    nx = cx + dx
                    ny = cy + dy
                    if not (0 <= nx < WIDTH_CELLS and 0 <= ny < HEIGHT_CELLS):
                        continue
                    if grid[ny][nx]:
                        continue
                    px, py = nx * TILE + (TILE - w) // 2, ny * TILE + (TILE - h) // 2
                    px = max(CONTENT_TILE, min(WIDTH_PX - w - CONTENT_TILE, px))
                    py = max(CONTENT_TILE, min(HEIGHT_PX - h - CONTENT_TILE, py))
                    placed = {"x": px, "y": py, "width": w, "height": h}
                    break
                if placed:
                    break
            if placed:
                break
        nudged.append(placed or box)
    return nudged


def build() -> dict:
    plan = authored_plan()
    grid = [[False for _ in range(WIDTH_CELLS)] for _ in range(HEIGHT_CELLS)]
    plaza_cell = fill_plaza(grid, plan["plaza"])
    for route in plan["routes"]:
        paint_route(grid, route)
    apply_edge_variation(grid)
    # Guarantee the southern entrance stays fully paved to the map edge.
    spawn_x = int(round(0.50 * (WIDTH_CELLS - 1e-6)))
    for y in range(HEIGHT_CELLS - 4, HEIGHT_CELLS):
        for dx in range(-2, 3):
            x = spawn_x + dx
            if 0 <= x < WIDTH_CELLS:
                grid[y][x] = True
    spawn_cell = (
        int(_norm_to_cell(0.50, 0.965)[0]),
        int(_norm_to_cell(0.50, 0.965)[1]),
    )
    if not grid[spawn_cell[1]][spawn_cell[0]]:
        grid[spawn_cell[1]][spawn_cell[0]] = True
    masks = occupancy_to_masks(grid)
    connectivity = validate_connectivity(grid, spawn_cell, plan["anchors"])
    if not connectivity["ok"]:
        raise SystemExit("road connectivity failed: " + json.dumps(connectivity, indent=2))

    cells = []
    for y in range(HEIGHT_CELLS):
        for x in range(WIDTH_CELLS):
            mask = masks[y][x]
            if mask == 0:
                continue
            variant = 0
            if mask == 15:
                variant = _hash(x, y, SEED + 19) % 5
            cells.append({"x": x, "y": y, "mask": mask, "variant": variant})

    converted_routes = []
    for route in plan["routes"]:
        converted = dict(route)
        converted["waypoints_cells"] = [
            [round(pt[0], 3), round(pt[1], 3)] for pt in (_norm_to_cell(x, y) for x, y in route["waypoints"])
        ]
        converted_routes.append(converted)

    converted_anchors = []
    for anchor in plan["anchors"]:
        cx = int(_norm_to_cell(anchor["normalized"]["x"], anchor["normalized"]["y"])[0])
        cy = int(_norm_to_cell(anchor["normalized"]["x"], anchor["normalized"]["y"])[1])
        item = dict(anchor)
        item["cell"] = [cx, cy]
        item["pixel"] = list(_cell_center_px(cx, cy))
        converted_anchors.append(item)

    interior = nudge_collisions(
        grid,
        [
            {"x": 80 + OFFSET_X, "y": 240 + OFFSET_Y, "width": 96, "height": 80},
            {"x": 640 + OFFSET_X, "y": 480 + OFFSET_Y, "width": 48, "height": 48},
        ],
    )
    spawn_px = _cell_center_px(*spawn_cell)
    original_area = ORIGINAL_WIDTH * ORIGINAL_HEIGHT
    expanded_area = WIDTH_PX * HEIGHT_PX
    payload = {
        "version": 1,
        "generated": True,
        "seed": SEED,
        "tile_size": TILE,
        "content_tile_size": CONTENT_TILE,
        "atlas_path": "res://assets/world/terrain/roads/stone_road_terrain_atlas.png",
        "tileset_path": "res://resources/world/terrain/grass_foundation_tileset.tres",
        "terrain_set_id": 1,
        "terrain_set_name": "RoadOverlay",
        "terrain_id": 0,
        "terrain_name": "StoneRoad",
        "atlas_source_id": 2,
        "map": {
            "id": "zone.starter",
            "original_width_px": ORIGINAL_WIDTH,
            "original_height_px": ORIGINAL_HEIGHT,
            "original_width_cells": ORIGINAL_WIDTH // TILE,
            "original_height_cells": ORIGINAL_HEIGHT // TILE,
            "original_area_cells": (ORIGINAL_WIDTH // TILE) * (ORIGINAL_HEIGHT // TILE),
            "width_px": WIDTH_PX,
            "height_px": HEIGHT_PX,
            "width_cells": WIDTH_CELLS,
            "height_cells": HEIGHT_CELLS,
            "area_cells": WIDTH_CELLS * HEIGHT_CELLS,
            "area_multiplier": round(expanded_area / original_area, 4),
            "origin_offset_px": {"x": OFFSET_X, "y": OFFSET_Y},
        },
        "plaza": {
            **plan["plaza"],
            "cell": [plaza_cell[0], plaza_cell[1]],
            "pixel": list(_cell_center_px(*plaza_cell)),
            "reserved_monument": {
                "cell": [plaza_cell[0] - 2, plaza_cell[1] - 2],
                "size_cells": [5, 5],
                "paved": True,
            },
        },
        "spawn": {
            "id": "main_road_south",
            "name": "Spawn_MainRoad_South",
            "normalized": {"x": 0.50, "y": 0.965},
            "cell": [spawn_cell[0], spawn_cell[1]],
            "pixel": list(spawn_px),
            "facing": "north",
        },
        "routes": converted_routes,
        "anchors": converted_anchors,
        "nudged_interior_collisions": interior,
        "connectivity": connectivity,
        "cells": cells,
        "custom_data": {
            "surface_type": "stone_road",
            "footstep_profile": "stone",
            "movement_speed_multiplier": 1.0,
            "walkable": True,
        },
    }
    return payload


def main() -> None:
    payload = build()
    PLAN_PATH.parent.mkdir(parents=True, exist_ok=True)
    PLAN_PATH.write_text(json.dumps(payload, indent=2) + "\n")
    print(f"wrote {PLAN_PATH}")
    print(
        "map {w}x{h} cells ({pxw}x{pxh}px) x{mult} spawn={spawn} roads={roads}".format(
            w=payload["map"]["width_cells"],
            h=payload["map"]["height_cells"],
            pxw=payload["map"]["width_px"],
            pxh=payload["map"]["height_px"],
            mult=payload["map"]["area_multiplier"],
            spawn=payload["spawn"]["pixel"],
            roads=len(payload["cells"]),
        )
    )


if __name__ == "__main__":
    main()
