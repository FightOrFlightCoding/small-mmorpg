class_name MovementSim
extends RefCounted

## Client copy of server movement constants and collision. Presentation only.

const PLAYER_HALF_EXTENT := 12.0
const TICK_DT := 0.1
const TICK_RATE_HZ := 10.0

var move_speed: float = 120.0
var half_extent: float = PLAYER_HALF_EXTENT
var walkable: Rect2 = Rect2(16, 16, 1248, 736)
var collisions: Array[Rect2] = []
var dynamic_collisions: Array[Rect2] = []


static func from_content(zone_id: String = "zone.starter") -> MovementSim:
	var sim := MovementSim.new()
	var player: Dictionary = ContentRegistry.get_by_id("player.base")
	if not player.is_empty():
		sim.move_speed = float(player.get("moveSpeed", 120.0))
	var resolved := zone_id
	if resolved.is_empty():
		resolved = "zone.starter"
	var zone: Dictionary = ContentRegistry.get_by_id(resolved)
	if zone.is_empty():
		return sim
	var bounds: Dictionary = zone.get("walkableBounds", {})
	if not bounds.is_empty():
		sim.walkable = Rect2(
			float(bounds.get("x", 16.0)),
			float(bounds.get("y", 16.0)),
			float(bounds.get("width", 1248.0)),
			float(bounds.get("height", 736.0))
		)
	sim.collisions.clear()
	var boxes: Variant = zone.get("collisions", [])
	if typeof(boxes) == TYPE_ARRAY:
		for entry in boxes:
			if typeof(entry) != TYPE_DICTIONARY:
				continue
			var box: Dictionary = entry
			sim.collisions.append(Rect2(
				float(box.get("x", 0.0)),
				float(box.get("y", 0.0)),
				float(box.get("width", 0.0)),
				float(box.get("height", 0.0))
			))
	var npc_spawns: Variant = zone.get("npcs", [])
	if typeof(npc_spawns) == TYPE_ARRAY:
		var size := sim.half_extent * 2.0
		for entry in npc_spawns:
			if typeof(entry) != TYPE_DICTIONARY:
				continue
			var npc: Dictionary = entry
			var nx := float(npc.get("x", 0.0))
			var ny := float(npc.get("y", 0.0))
			sim.collisions.append(Rect2(nx - sim.half_extent, ny - sim.half_extent, size, size))
	return sim


static func sanitize_axes(axis: Vector2) -> Vector2:
	var x := clampf(axis.x, -1.0, 1.0)
	var y := clampf(axis.y, -1.0, 1.0)
	var length := Vector2(x, y).length()
	if length > 1.0:
		return Vector2(x, y) / length
	return Vector2(x, y)


func step(origin: Vector2, axis: Vector2, dt: float = TICK_DT) -> Vector2:
	var clean := sanitize_axes(axis)
	var delta := clean * move_speed * dt
	return resolve_move(origin, delta)


func resolve_move(origin: Vector2, delta: Vector2) -> Vector2:
	var min_x := walkable.position.x + half_extent
	var max_x := walkable.position.x + walkable.size.x - half_extent
	var min_y := walkable.position.y + half_extent
	var max_y := walkable.position.y + walkable.size.y - half_extent
	var start := _depenetrate(origin)

	var next_x := clampf(start.x + delta.x, min_x, max_x)
	var hits_x := _collect_hits(Vector2(next_x, start.y))
	if not hits_x.is_empty():
		next_x = _snap_axis(start.x, next_x, delta.x, hits_x, min_x, max_x, true)
		if blocked_at(Vector2(next_x, start.y)):
			next_x = start.x

	var next_y := clampf(start.y + delta.y, min_y, max_y)
	var hits_y := _collect_hits(Vector2(next_x, next_y))
	if not hits_y.is_empty():
		next_y = _snap_axis(start.y, next_y, delta.y, hits_y, min_y, max_y, false)
		if blocked_at(Vector2(next_x, next_y)):
			next_y = start.y

	return Vector2(next_x, next_y)


func blocked_at(center: Vector2) -> bool:
	return not _collect_hits(center).is_empty()


func _depenetrate(origin: Vector2) -> Vector2:
	var min_x := walkable.position.x + half_extent
	var max_x := walkable.position.x + walkable.size.x - half_extent
	var min_y := walkable.position.y + half_extent
	var max_y := walkable.position.y + walkable.size.y - half_extent
	var px := clampf(origin.x, min_x, max_x)
	var py := clampf(origin.y, min_y, max_y)
	for _i in range(4):
		var hits := _collect_hits(Vector2(px, py))
		if hits.is_empty():
			return Vector2(px, py)
		var hit: Rect2 = hits[0]
		var body := Rect2(px - half_extent, py - half_extent, half_extent * 2.0, half_extent * 2.0)
		var overlap_left := body.position.x + body.size.x - hit.position.x
		var overlap_right := hit.position.x + hit.size.x - body.position.x
		var overlap_top := body.position.y + body.size.y - hit.position.y
		var overlap_bottom := hit.position.y + hit.size.y - body.position.y
		var x_push := -overlap_left if overlap_left < overlap_right else overlap_right
		var y_push := -overlap_top if overlap_top < overlap_bottom else overlap_bottom
		if absf(x_push) <= absf(y_push):
			px = clampf(px + x_push, min_x, max_x)
		else:
			py = clampf(py + y_push, min_y, max_y)
	return Vector2(px, py)


func _snap_axis(
	origin: float,
	attempted: float,
	delta: float,
	hits: Array[Rect2],
	axis_min: float,
	axis_max: float,
	horizontal: bool
) -> float:
	if delta == 0.0:
		return origin
	var snapped := attempted
	for hit in hits:
		if horizontal:
			if delta > 0.0:
				snapped = minf(snapped, hit.position.x - half_extent)
			else:
				snapped = maxf(snapped, hit.position.x + hit.size.x + half_extent)
		elif delta > 0.0:
			snapped = minf(snapped, hit.position.y - half_extent)
		else:
			snapped = maxf(snapped, hit.position.y + hit.size.y + half_extent)
	return clampf(snapped, axis_min, axis_max)


func _collect_hits(center: Vector2) -> Array[Rect2]:
	var body := Rect2(center.x - half_extent, center.y - half_extent, half_extent * 2.0, half_extent * 2.0)
	var hits: Array[Rect2] = []
	for box in collisions:
		if _aabb_overlap(body, box):
			hits.append(box)
	for box in dynamic_collisions:
		if _aabb_overlap(body, box):
			hits.append(box)
	return hits


func _aabb_overlap(a: Rect2, b: Rect2) -> bool:
	return (
		a.position.x < b.position.x + b.size.x
		and a.position.x + a.size.x > b.position.x
		and a.position.y < b.position.y + b.size.y
		and a.position.y + a.size.y > b.position.y
	)
