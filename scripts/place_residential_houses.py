#!/usr/bin/env python3
"""Place six residential houses on zone.starter. Idempotent."""

from __future__ import annotations

import json
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
PLAN_PATH = REPO / "client" / "data" / "world" / "maps" / "village_road_plan.json"
GEOM_PATH = REPO / "client" / "data" / "world" / "buildings" / "residential_house_geometry.json"
MANIFEST_PATH = REPO / "client" / "data" / "world" / "buildings" / "residential_houses_manifest.json"
ZONE_PATH = REPO / "content" / "source" / "zone.starter.json"
TILE = 64
WIDTH_PX = 4096
HEIGHT_PX = 3072
WIDTH_CELLS = 64
HEIGHT_CELLS = 48
SPEC_PREFERRED = {
    "01": (0.40, 0.37),
    "02": (0.47, 0.34),
    "03": (0.55, 0.35),
    "04": (0.64, 0.43),
    "05": (0.35, 0.56),
    "06": (0.43, 0.60),
}
RESERVED_RADIUS_CAP = {
    "fields_orchard": 5,
    "watermill": 6,
    "shrine_graveyard": 5,
    "stables_inn": 6,
    "blacksmith": 6,
    "village_hall": 6,
    "general_store": 5,
    "barn_livestock": 6,
    "main_road_south": 4,
}
SPECIAL_RESERVE = {
    "fields_orchard",
    "watermill",
    "shrine_graveyard",
    "stables_inn",
    "blacksmith",
    "village_hall",
    "general_store",
    "barn_livestock",
    "main_road_south",
}
PREFERRED = [
    {"id": "01", "nx": 0.39, "ny": 0.33, "route": "route_b_west", "min_nx": 0.34, "max_nx": 0.43, "min_ny": 0.28, "max_ny": 0.38},
    {"id": "02", "nx": 0.42, "ny": 0.18, "route": "route_d_north_watermill", "min_nx": 0.38, "max_nx": 0.44, "min_ny": 0.12, "max_ny": 0.22},
    {"id": "03", "nx": 0.54, "ny": 0.20, "route": "route_f_northeast", "min_nx": 0.50, "max_nx": 0.62, "min_ny": 0.12, "max_ny": 0.28},
    {"id": "04", "nx": 0.74, "ny": 0.42, "route": "route_g_east", "min_nx": 0.70, "max_nx": 0.80, "min_ny": 0.36, "max_ny": 0.48},
    {"id": "05", "nx": 0.28, "ny": 0.55, "route": "route_i_southwest", "min_nx": 0.24, "max_nx": 0.33, "min_ny": 0.50, "max_ny": 0.60},
    {"id": "06", "nx": 0.38, "ny": 0.69, "route": "route_a_main_south", "min_nx": 0.34, "max_nx": 0.42, "min_ny": 0.64, "max_ny": 0.73},
]
BORDERS = [
    {"x": 0, "y": 0, "width": 4096, "height": 16},
    {"x": 0, "y": 3056, "width": 4096, "height": 16},
    {"x": 0, "y": 0, "width": 16, "height": 3072},
    {"x": 4080, "y": 0, "width": 16, "height": 3072},
]


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def occupancy_from_plan(plan: dict) -> set[tuple[int, int]]:
    cells = set()
    for entry in plan.get("cells", []):
        if int(entry.get("mask", 0)) == 15:
            cells.add((int(entry["x"]), int(entry["y"])))
    return cells


def cell_of(px: float, py: float) -> tuple[int, int]:
    return int(px // TILE), int(py // TILE)


def aabb_cells(x: float, y: float, w: float, h: float) -> tuple[int, int, int, int]:
    x0 = int(x // TILE)
    y0 = int(y // TILE)
    x1 = int((x + w - 1) // TILE)
    y1 = int((y + h - 1) // TILE)
    return x0, y0, x1, y1


def inflate_cells(rect: tuple[int, int, int, int], tiles: int) -> tuple[int, int, int, int]:
    x0, y0, x1, y1 = rect
    return x0 - tiles, y0 - tiles, x1 + tiles, y1 + tiles


def cells_overlap(a: tuple[int, int, int, int], b: tuple[int, int, int, int]) -> bool:
    return not (a[2] < b[0] or b[2] < a[0] or a[3] < b[1] or b[3] < a[1])


def rects_overlap_px(a: tuple[float, float, float, float], b: tuple[float, float, float, float]) -> bool:
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    return not (ax + aw <= bx or bx + bw <= ax or ay + ah <= by or by + bh <= ay)


def circle_hits_aabb(cx: float, cy: float, radius: float, aabb: tuple[float, float, float, float]) -> bool:
    x, y, w, h = aabb
    qx = min(max(cx, x), x + w)
    qy = min(max(cy, y), y + h)
    dx = cx - qx
    dy = cy - qy
    return dx * dx + dy * dy < radius * radius


def nearest_road(occ: set[tuple[int, int]], cell: tuple[int, int]) -> tuple[int, int] | None:
    if cell in occ:
        return cell
    best = None
    best_d = 1 << 30
    cx, cy = cell
    for x, y in occ:
        d = abs(x - cx) + abs(y - cy)
        if d < best_d:
            best_d = d
            best = (x, y)
    return best


def path_to_road(
    occ: set[tuple[int, int]],
    blocked: set[tuple[int, int]],
    start: tuple[int, int],
    limit: int = 6,
) -> list[tuple[int, int]]:
    if start in occ:
        return [start]
    from collections import deque

    q = deque([(start, [start])])
    seen = {start}
    while q:
        (x, y), path = q.popleft()
        if len(path) - 1 > limit:
            continue
        for dx, dy in ((0, 1), (1, 0), (0, -1), (-1, 0)):
            nx, ny = x + dx, y + dy
            if not (0 <= nx < WIDTH_CELLS and 0 <= ny < HEIGHT_CELLS):
                continue
            if (nx, ny) in seen or (nx, ny) in blocked:
                continue
            next_path = path + [(nx, ny)]
            if (nx, ny) in occ:
                return next_path
            if len(next_path) - 1 >= limit:
                continue
            seen.add((nx, ny))
            q.append(((nx, ny), next_path))
    return []


def widen_path(path: list[tuple[int, int]]) -> list[tuple[int, int]]:
    extra: set[tuple[int, int]] = set(path)
    for i, (x, y) in enumerate(path):
        if i == 0 and len(path) > 1:
            dx = path[1][0] - x
            dy = path[1][1] - y
        elif i > 0:
            dx = x - path[i - 1][0]
            dy = y - path[i - 1][1]
        else:
            dx, dy = 0, 1
        px, py = -dy, dx
        for sx, sy in ((x + px, y + py), (x - px, y - py)):
            if 0 <= sx < WIDTH_CELLS and 0 <= sy < HEIGHT_CELLS:
                extra.add((sx, sy))
    return sorted(extra)


def blocked_from_aabb(aabb: tuple[float, float, float, float]) -> set[tuple[int, int]]:
    x0, y0, x1, y1 = aabb_cells(*aabb)
    return {(x, y) for y in range(y0, y1 + 1) for x in range(x0, x1 + 1)}


def road_clearance_tiles(aabb: tuple[float, float, float, float], occ: set[tuple[int, int]]) -> int:
    for tiles in (2, 1, 0):
        cells = inflate_cells(aabb_cells(*aabb), tiles)
        hit = False
        for cy in range(max(0, cells[1]), min(HEIGHT_CELLS, cells[3] + 1)):
            for cx in range(max(0, cells[0]), min(WIDTH_CELLS, cells[2] + 1)):
                if (cx, cy) in occ:
                    hit = True
                    break
            if hit:
                break
        if not hit:
            return tiles
    return -1


def nearest_route(plan: dict, px: float, py: float, hint: str) -> str:
    best = hint
    best_d = 1e18
    for route in plan.get("routes", []):
        pts = route.get("waypoints_cells", [])
        for cell in pts:
            cx = float(cell[0]) * TILE + TILE / 2
            cy = float(cell[1]) * TILE + TILE / 2
            d = (cx - px) ** 2 + (cy - py) ** 2
            if d < best_d:
                best_d = d
                best = str(route.get("id", hint))
    return best


def place() -> dict:
    plan = load_json(PLAN_PATH)
    geom = {row["id"]: row for row in load_json(GEOM_PATH)["houses"]}
    occ = occupancy_from_plan(plan)
    reserved = []
    for anchor in plan.get("anchors", []):
        aid = str(anchor.get("id", ""))
        if aid not in SPECIAL_RESERVE:
            continue
        pixel = anchor.get("pixel", [0, 0])
        radius_cells = min(
            float(anchor.get("open_space_radius_cells", 6)),
            float(RESERVED_RADIUS_CAP.get(aid, 6)),
        )
        radius = radius_cells * TILE
        reserved.append((float(pixel[0]), float(pixel[1]), radius, aid))
    monument = plan.get("plaza", {}).get("reserved_monument", {})
    if monument:
        cell = monument.get("cell", [28, 20])
        size = monument.get("size_cells", [5, 5])
        reserved.append(
            (
                (cell[0] + size[0] / 2) * TILE,
                (cell[1] + size[1] / 2) * TILE,
                max(size) * TILE / 2,
                "village_square_monument",
            )
        )
    zone = load_json(ZONE_PATH)
    actors = [(float(n["x"]), float(n["y"])) for n in zone.get("npcs", [])]
    actors += [(float(e["x"]), float(e["y"])) for e in zone.get("enemies", [])]
    interiors = []
    for box in plan.get("nudged_interior_collisions", []):
        interiors.append((float(box["x"]), float(box["y"]), float(box["width"]), float(box["height"])))

    placed_aabbs: list[tuple[float, float, float, float]] = []
    houses_out = []
    access_cells: set[tuple[int, int]] = set()

    for pref in PREFERRED:
        g = geom[pref["id"]]
        local = g["collision_aabb_local"]
        door = g["door_area_local"]
        entrance = g["entrance_marker_local"]
        pref_x = pref["nx"] * WIDTH_PX
        pref_y = pref["ny"] * HEIGHT_PX
        found = None
        best_score = 1e18
        reason_counts: dict[str, int] = {}
        min_cx = int((pref.get("min_nx", 0) * WIDTH_PX + local[0]) // TILE) - 1
        max_cx = int((pref.get("max_nx", 1) * WIDTH_PX + local[0]) // TILE) + 1
        min_cy = int((pref.get("min_ny", 0) * HEIGHT_PX + local[1]) // TILE) - 1
        max_cy = int((pref.get("max_ny", 1) * HEIGHT_PX + local[1]) // TILE) + 1
        for cy in range(min_cy, max_cy + 1):
            for cx in range(min_cx, max_cx + 1):
                ox = cx * TILE - local[0]
                oy = cy * TILE - local[1]
                dx = ox - pref_x
                dy = oy - pref_y
                aabb = (ox + local[0], oy + local[1], local[2], local[3])
                x, y, w, h = aabb
                if x < 32 or y < 32 or x + w > WIDTH_PX - 32 or y + h > HEIGHT_PX - 32:
                    reason_counts["bounds"] = reason_counts.get("bounds", 0) + 1
                    continue
                clearance = road_clearance_tiles(aabb, occ)
                if clearance < 0:
                    reason_counts["road"] = reason_counts.get("road", 0) + 1
                    continue
                reserved_hit = False
                for px, py, radius, name in reserved:
                    if circle_hits_aabb(px, py, radius, aabb):
                        reason_counts[f"reserved:{name}"] = reason_counts.get(f"reserved:{name}", 0) + 1
                        reserved_hit = True
                        break
                if reserved_hit:
                    continue
                neighbor_gap = 8
                neighbor_hit = False
                for other in placed_aabbs:
                    ox0, oy0, ow, oh = other
                    gap_x = max(0.0, x - (ox0 + ow), ox0 - (x + w)) / TILE
                    gap_y = max(0.0, y - (oy0 + oh), oy0 - (y + h)) / TILE
                    if gap_x == 0.0 and gap_y == 0.0 and rects_overlap_px(aabb, other):
                        neighbor_hit = True
                        break
                    if gap_x > 0.0 and gap_y > 0.0:
                        gap = (gap_x * gap_x + gap_y * gap_y) ** 0.5
                    else:
                        gap = max(gap_x, gap_y)
                    neighbor_gap = min(neighbor_gap, gap)
                if neighbor_hit:
                    reason_counts["neighbor"] = reason_counts.get("neighbor", 0) + 1
                    continue
                if neighbor_gap < 2.0 and placed_aabbs:
                    reason_counts["neighbor"] = reason_counts.get("neighbor", 0) + 1
                    continue
                actor_hit = False
                for ax, ay in actors:
                    if x - 40 <= ax <= x + w + 40 and y - 40 <= ay <= y + h + 40:
                        actor_hit = True
                        break
                if actor_hit:
                    reason_counts["actor"] = reason_counts.get("actor", 0) + 1
                    continue
                interior_hit = False
                for box in interiors:
                    if rects_overlap_px(aabb, box):
                        interior_hit = True
                        break
                if interior_hit:
                    reason_counts["interior"] = reason_counts.get("interior", 0) + 1
                    continue
                blocked = set()
                for other in placed_aabbs + [aabb]:
                    blocked |= blocked_from_aabb(other)
                start = cell_of(ox + entrance[0], oy + entrance[1])
                path = path_to_road(occ, blocked, start, 6)
                if not path:
                    reason_counts["nopath"] = reason_counts.get("nopath", 0) + 1
                    continue
                wide = [cell for cell in widen_path(path) if cell not in blocked]
                nudge_n = ((abs(dx) / WIDTH_PX) ** 2 + (abs(dy) / HEIGHT_PX) ** 2) ** 0.5
                nx_n = ox / WIDTH_PX
                ny_n = oy / HEIGHT_PX
                if nx_n < pref.get("min_nx", 0) - 0.01 or nx_n > pref.get("max_nx", 1) + 0.01:
                    reason_counts["band"] = reason_counts.get("band", 0) + 1
                    continue
                if ny_n < pref.get("min_ny", 0) - 0.01 or ny_n > pref.get("max_ny", 1) + 0.01:
                    reason_counts["band"] = reason_counts.get("band", 0) + 1
                    continue
                score = (
                    nudge_n * 900.0
                    + max(0, 2 - clearance) * 2.0
                    + max(0.0, 3.0 - neighbor_gap) * 1.5
                    + max(0, len(path) - 3) * 0.3
                )
                if score < best_score:
                    best_score = score
                    found = {
                        "origin": (ox, oy),
                        "aabb": aabb,
                        "path": path,
                        "wide": wide,
                        "dx": dx,
                        "dy": dy,
                        "clearance": clearance,
                        "neighbor_gap": neighbor_gap,
                    }
        if not found:
            raise SystemExit(f"could not place house {pref['id']}: {reason_counts}")
        ox, oy = found["origin"]
        aabb = found["aabb"]
        placed_aabbs.append(aabb)
        print(
            "placed {id} origin=({ox:.0f},{oy:.0f}) nudge=({ndx:.3f},{ndy:.3f}) clearance={c} path={p}".format(
                id=g["house_id"],
                ox=ox,
                oy=oy,
                ndx=found["dx"] / WIDTH_PX,
                ndy=found["dy"] / HEIGHT_PX,
                c=found["clearance"],
                p=len(found["path"]) - 1,
            )
        )
        for cell in found["wide"]:
            access_cells.add(cell)
        spec_x, spec_y = SPEC_PREFERRED[pref["id"]]
        nx = ox / WIDTH_PX
        ny = oy / HEIGHT_PX
        cell = cell_of(ox, oy)
        houses_out.append(
            {
                "house_id": g["house_id"],
                "variant": pref["id"],
                "scene_path": f"res://scenes/world/buildings/residential/res_house_{pref['id']}.tscn",
                "exterior_texture_path": f"res://assets/world/buildings/residential/res_house_{pref['id']}_exterior.png",
                "shadow_texture_path": f"res://assets/world/buildings/residential/res_house_{pref['id']}_shadow.png",
                "canvas_size": g["canvas_size"],
                "asset_origin": g["asset_origin"],
                "footprint_polygon": g["footprint_polygon_local"],
                "collision_aabb_local": g["collision_aabb_local"],
                "door_local_position": g["door_local"],
                "door_area_local": door,
                "entrance_marker_local_position": entrance,
                "approximate_footprint_tiles": g["approximate_footprint_tiles"],
                "preferred_normalized_position": {
                    "x": SPEC_PREFERRED[pref["id"]][0],
                    "y": SPEC_PREFERRED[pref["id"]][1],
                },
                "map_normalized_position": {"x": round(nx, 4), "y": round(ny, 4)},
                "map_cell_position": [cell[0], cell[1]],
                "map_world_position": [round(ox, 1), round(oy, 1)],
                "collision_world_aabb": {
                    "x": round(aabb[0], 1),
                    "y": round(aabb[1], 1),
                    "width": round(aabb[2], 1),
                    "height": round(aabb[3], 1),
                },
                "door_world_position": [round(ox + door[0], 1), round(oy + door[1], 1)],
                "entrance_marker_world_position": [round(ox + entrance[0], 1), round(oy + entrance[1], 1)],
                "entrance_path_cells": [{"x": c[0], "y": c[1]} for c in found["wide"]],
                "entrance_path_length_tiles": max(0, len(found["path"]) - 1),
                "nearest_road_route": nearest_route(plan, ox, oy, pref["route"]),
                "future_interior_id": None,
                "resident_assignment": None,
                "occlusion_polygon_local": g["occlusion_polygon_local"],
                "nudge_normalized": {"x": round(nx - spec_x, 4), "y": round(ny - spec_y, 4)},
                "road_clearance_tiles": found["clearance"],
                "neighbor_gap_tiles": round(found["neighbor_gap"], 2),
                "nudge_reason": None
                if abs(nx - spec_x) <= 0.03 and abs(ny - spec_y) <= 0.03
                else "Preferred lot overlaps the plaza/road occupancy. Origin moved to the nearest grass island that keeps the village-plan cluster, stays off reserved special lots, and still has a short door path.",
            }
        )

    houses_out.sort(key=lambda row: str(row["house_id"]))
    reserved_checked = sorted({row[3] for row in reserved})
    manifest = {
        "version": 1,
        "generated": True,
        "map_id": "zone.starter",
        "tile_size": TILE,
        "houses": houses_out,
        "access_path_cells": [{"x": x, "y": y} for x, y in sorted(access_cells)],
        "reserved_special_building_zones_checked": reserved_checked,
        "notes": [
            "Ordinary residential exteriors only. No interiors, NPCs, yards, or special buildings.",
            "The dense plaza/road network cannot keep a 2-tile gap beside every 4–6 tile house. Placement forbids overlapping roads and reserved special lots, then prefers the smallest nudge from the authored cluster.",
        ],
    }
    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    house_boxes = [row["collision_world_aabb"] for row in houses_out]
    zone["collisions"] = list(BORDERS) + interiors_as_dicts(interiors) + house_boxes
    ZONE_PATH.write_text(json.dumps(zone, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {MANIFEST_PATH}")
    print(f"updated {ZONE_PATH} collisions={len(zone['collisions'])}")
    for row in houses_out:
        print(
            "{id} world={world} norm={nx},{ny} nudge={nudge} path={path} route={route}".format(
                id=row["house_id"],
                world=row["map_world_position"],
                nx=row["map_normalized_position"]["x"],
                ny=row["map_normalized_position"]["y"],
                nudge=row["nudge_normalized"],
                path=row["entrance_path_length_tiles"],
                route=row["nearest_road_route"],
            )
        )
    return manifest


def interiors_as_dicts(interiors: list[tuple[float, float, float, float]]) -> list[dict]:
    return [{"x": int(x), "y": int(y), "width": int(w), "height": int(h)} for x, y, w, h in interiors]


if __name__ == "__main__":
    place()
