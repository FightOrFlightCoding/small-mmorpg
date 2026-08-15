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


static func from_content() -> MovementSim:
	var sim := MovementSim.new()
	var player: Dictionary = ContentRegistry.get_by_id("player.base")
	if not player.is_empty():
		sim.move_speed = float(player.get("moveSpeed", 120.0))
	var zone: Dictionary = ContentRegistry.get_by_id("zone.starter")
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

	var next_x := clampf(origin.x + delta.x, min_x, max_x)
	var hit_x := _overlap(Vector2(next_x, origin.y))
	if hit_x.size != Vector2.ZERO:
		if delta.x > 0.0:
			next_x = clampf(hit_x.position.x - half_extent, min_x, max_x)
		elif delta.x < 0.0:
			next_x = clampf(hit_x.position.x + hit_x.size.x + half_extent, min_x, max_x)
		else:
			next_x = origin.x
		if _overlap(Vector2(next_x, origin.y)).size != Vector2.ZERO:
			next_x = origin.x

	var next_y := clampf(origin.y + delta.y, min_y, max_y)
	var hit_y := _overlap(Vector2(next_x, next_y))
	if hit_y.size != Vector2.ZERO:
		if delta.y > 0.0:
			next_y = clampf(hit_y.position.y - half_extent, min_y, max_y)
		elif delta.y < 0.0:
			next_y = clampf(hit_y.position.y + hit_y.size.y + half_extent, min_y, max_y)
		else:
			next_y = origin.y
		if _overlap(Vector2(next_x, next_y)).size != Vector2.ZERO:
			next_y = origin.y

	return Vector2(next_x, next_y)


func _overlap(center: Vector2) -> Rect2:
	var body := Rect2(center.x - half_extent, center.y - half_extent, half_extent * 2.0, half_extent * 2.0)
	for box in collisions:
		if _aabb_overlap(body, box):
			return box
	return Rect2()


func _aabb_overlap(a: Rect2, b: Rect2) -> bool:
	return (
		a.position.x < b.position.x + b.size.x
		and a.position.x + a.size.x > b.position.x
		and a.position.y < b.position.y + b.size.y
		and a.position.y + a.size.y > b.position.y
	)
