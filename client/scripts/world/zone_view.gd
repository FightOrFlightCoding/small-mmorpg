class_name ZoneView
extends Node2D

## Renders zone bounds, floor tiles, collision AABBs, and the player spawn from content IDs.

const GRASS_TILESET_PATH := "res://resources/world/terrain/grass_foundation_tileset.tres"

var _grass_details: TileMapLayer
var _grass_painter: GrassFoundationPainter = GrassFoundationPainter.new()


func render_zone(zone: Dictionary) -> void:
	_grass_details = null
	for child in get_children():
		child.queue_free()
	if zone.is_empty():
		return
	var width := float(zone.get("width", 1280))
	var height := float(zone.get("height", 768))
	var visual_id := String(zone.get("visualId", "visual.zone_starter"))
	var visual: Dictionary = ContentRegistry.resolve_visual(visual_id)
	_add_floor(width, height, visual, String(zone.get("id", "")))
	_add_bounds(width, height)
	_add_collisions(zone.get("collisions", []), visual)
	_clear_grass_details_under_collisions(zone.get("collisions", []))
	_add_spawn(zone.get("playerSpawn", {}))


func _add_floor(width: float, height: float, visual: Dictionary, zone_id: String) -> void:
	var floor_poly := Polygon2D.new()
	floor_poly.name = "Floor"
	floor_poly.polygon = PackedVector2Array([
		Vector2.ZERO,
		Vector2(width, 0.0),
		Vector2(width, height),
		Vector2(0.0, height),
	])
	floor_poly.color = Color(0.30, 0.44, 0.25, 1.0)
	if visual.get("fallback_color") is Color:
		floor_poly.color = visual["fallback_color"]
	add_child(floor_poly)
	if _add_grass_terrain(width, height, visual, zone_id):
		return
	var texture_path := String(visual.get("texture_path", ""))
	if texture_path.is_empty():
		return
	var texture: Texture2D = load(texture_path)
	if texture == null:
		return
	add_child(_repeating_fill("FloorTiles", texture, Rect2(0.0, 0.0, width, height), 0))


func _add_grass_terrain(width: float, height: float, visual: Dictionary, zone_id: String) -> bool:
	var tileset_path := String(visual.get("tileset_path", ""))
	if tileset_path.is_empty():
		tileset_path = GRASS_TILESET_PATH if String(visual.get("visual_id", "")) == "visual.zone_starter" else ""
	if tileset_path.is_empty() or not ResourceLoader.exists(tileset_path):
		return false
	var tileset: TileSet = load(tileset_path) as TileSet
	if tileset == null:
		return false
	var holder := Node2D.new()
	holder.name = "WorldTerrain"
	add_child(holder)
	var ground := TileMapLayer.new()
	ground.name = "GrassGround"
	ground.z_index = 0
	var details := TileMapLayer.new()
	details.name = "GrassDetails"
	details.z_index = 1
	holder.add_child(ground)
	holder.add_child(details)
	GrassFoundationPainter.configure_layer(ground, tileset)
	GrassFoundationPainter.configure_layer(details, tileset)
	var seed := GrassFoundationPainter.seed_for_zone(zone_id)
	_grass_painter.paint_world_rect(ground, details, Vector2(width, height), seed)
	_grass_details = details
	return true


func _clear_grass_details_under_collisions(collisions: Variant) -> void:
	if _grass_details == null or typeof(collisions) != TYPE_ARRAY:
		return
	for entry in collisions:
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		var rect: Dictionary = entry
		_grass_painter.clear_details_under_pixel_rect(
			_grass_details,
			Rect2(
				float(rect.get("x", 0.0)),
				float(rect.get("y", 0.0)),
				float(rect.get("width", 16.0)),
				float(rect.get("height", 16.0)),
			),
		)


func _add_bounds(width: float, height: float) -> void:
	var line := Line2D.new()
	line.name = "Bounds"
	line.width = 2.0
	line.default_color = Color(0.95, 0.95, 0.9, 0.85)
	line.points = PackedVector2Array([
		Vector2(0, 0),
		Vector2(width, 0),
		Vector2(width, height),
		Vector2(0, height),
		Vector2(0, 0),
	])
	line.z_index = 1
	add_child(line)


func _add_collisions(collisions: Variant, visual: Dictionary) -> void:
	if typeof(collisions) != TYPE_ARRAY:
		return
	var holder := Node2D.new()
	holder.name = "Collisions"
	holder.z_index = 1
	add_child(holder)
	var obstacle_tex: Texture2D = null
	var obstacle_path := String(visual.get("obstacle_texture_path", ""))
	if not obstacle_path.is_empty():
		obstacle_tex = load(obstacle_path)
	var fill := Color(0.35, 0.27, 0.22, 1.0)
	if visual.get("obstacle_fallback_color") is Color:
		fill = visual["obstacle_fallback_color"]
	var index := 0
	for entry in collisions:
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		var rect: Dictionary = entry
		var box := Rect2(
			float(rect.get("x", 0.0)),
			float(rect.get("y", 0.0)),
			float(rect.get("width", 16.0)),
			float(rect.get("height", 16.0)),
		)
		var poly := Polygon2D.new()
		poly.name = "Collision_%s" % str(index)
		poly.position = box.position
		poly.polygon = PackedVector2Array([
			Vector2.ZERO,
			Vector2(box.size.x, 0.0),
			box.size,
			Vector2(0.0, box.size.y),
		])
		poly.color = fill
		holder.add_child(poly)
		if obstacle_tex != null:
			poly.add_child(_repeating_fill("Tiles", obstacle_tex, Rect2(Vector2.ZERO, box.size), 0))
		index += 1


func _repeating_fill(p_name: String, texture: Texture2D, rect: Rect2, z: int) -> Polygon2D:
	var poly := Polygon2D.new()
	poly.name = p_name
	poly.position = rect.position
	poly.z_index = z
	poly.polygon = PackedVector2Array([
		Vector2.ZERO,
		Vector2(rect.size.x, 0.0),
		rect.size,
		Vector2(0.0, rect.size.y),
	])
	poly.uv = PackedVector2Array([
		Vector2.ZERO,
		Vector2(rect.size.x, 0.0),
		rect.size,
		Vector2(0.0, rect.size.y),
	])
	poly.texture = texture
	poly.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	poly.texture_repeat = CanvasItem.TEXTURE_REPEAT_ENABLED
	return poly


func _add_spawn(spawn: Variant) -> void:
	if typeof(spawn) != TYPE_DICTIONARY:
		return
	var point: Dictionary = spawn
	var marker := Node2D.new()
	marker.name = "PlayerSpawn"
	marker.position = Vector2(float(point.get("x", 0.0)), float(point.get("y", 0.0)))
	marker.z_index = 2
	var diamond := Polygon2D.new()
	diamond.color = Color(0.95, 0.95, 0.2, 0.85)
	diamond.polygon = PackedVector2Array([
		Vector2(0, -10),
		Vector2(10, 0),
		Vector2(0, 10),
		Vector2(-10, 0),
	])
	marker.add_child(diamond)
	var label := Label.new()
	label.text = "Spawn"
	label.position = Vector2(-24, 12)
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.add_theme_font_size_override("font_size", 11)
	marker.add_child(label)
	add_child(marker)


func collision_count() -> int:
	var holder := get_node_or_null("Collisions")
	if holder == null:
		return 0
	return holder.get_child_count()
