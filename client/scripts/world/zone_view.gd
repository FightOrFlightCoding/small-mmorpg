class_name ZoneView
extends Node2D

## Renders zone bounds, floor tiles, collision AABBs, and the player spawn from content IDs.


func render_zone(zone: Dictionary) -> void:
	for child in get_children():
		child.queue_free()
	if zone.is_empty():
		return
	var width := float(zone.get("width", 1280))
	var height := float(zone.get("height", 768))
	var visual_id := String(zone.get("visualId", "visual.zone_starter"))
	var visual: Dictionary = ContentRegistry.resolve_visual(visual_id)
	_add_floor(width, height, visual)
	_add_bounds(width, height)
	_add_collisions(zone.get("collisions", []), visual)
	_add_spawn(zone.get("playerSpawn", {}))


func _add_floor(width: float, height: float, visual: Dictionary) -> void:
	var floor_rect := ColorRect.new()
	floor_rect.name = "Floor"
	floor_rect.size = Vector2(width, height)
	floor_rect.color = Color(0.49, 0.75, 0.29, 1.0)
	if visual.get("fallback_color") is Color:
		floor_rect.color = visual["fallback_color"]
	floor_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(floor_rect)
	var texture_path := String(visual.get("texture_path", ""))
	if texture_path.is_empty():
		return
	var texture: Texture2D = load(texture_path)
	if texture == null:
		return
	var tiled := TextureRect.new()
	tiled.name = "FloorTiles"
	tiled.texture = texture
	tiled.stretch_mode = TextureRect.STRETCH_TILE
	tiled.size = Vector2(width, height)
	tiled.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(tiled)


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
	var index := 0
	for entry in collisions:
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		var rect: Dictionary = entry
		var box := ColorRect.new()
		box.name = "Collision_%s" % str(index)
		box.position = Vector2(float(rect.get("x", 0.0)), float(rect.get("y", 0.0)))
		box.size = Vector2(float(rect.get("width", 16.0)), float(rect.get("height", 16.0)))
		box.color = Color(0.35, 0.27, 0.22, 1.0)
		if visual.get("obstacle_fallback_color") is Color:
			box.color = visual["obstacle_fallback_color"]
		box.mouse_filter = Control.MOUSE_FILTER_IGNORE
		holder.add_child(box)
		if obstacle_tex != null:
			var overlay := TextureRect.new()
			overlay.texture = obstacle_tex
			overlay.stretch_mode = TextureRect.STRETCH_TILE
			overlay.size = box.size
			overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
			box.add_child(overlay)
		index += 1


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
