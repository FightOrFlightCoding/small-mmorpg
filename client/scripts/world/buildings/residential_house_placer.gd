class_name ResidentialHousePlacer
extends RefCounted

## Loads the residential-house manifest and instances static map content.

const MANIFEST_PATH := "res://data/world/buildings/residential_houses_manifest.json"
const SORT_Z := 6


static func load_manifest(path: String = MANIFEST_PATH) -> Dictionary:
	if not FileAccess.file_exists(path):
		return {}
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	if typeof(parsed) != TYPE_DICTIONARY:
		return {}
	return parsed as Dictionary


static func houses(manifest: Dictionary = {}) -> Array:
	var data: Dictionary = manifest if not manifest.is_empty() else load_manifest()
	var rows: Variant = data.get("houses", [])
	if typeof(rows) != TYPE_ARRAY:
		return []
	return rows


static func definition_for(house_id: String) -> Dictionary:
	for entry in houses():
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		if String((entry as Dictionary).get("house_id", "")) == house_id:
			return entry
	return {}


static func access_path_cells(manifest: Dictionary = {}) -> Array[Vector2i]:
	var data: Dictionary = manifest if not manifest.is_empty() else load_manifest()
	var cells: Array[Vector2i] = []
	var rows: Variant = data.get("access_path_cells", [])
	if typeof(rows) != TYPE_ARRAY:
		return cells
	for entry in rows:
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		cells.append(Vector2i(int(entry.get("x", 0)), int(entry.get("y", 0))))
	return cells


static func house_collision_rects(manifest: Dictionary = {}) -> Array[Rect2]:
	var rects: Array[Rect2] = []
	for entry in houses(manifest):
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		var box: Dictionary = (entry as Dictionary).get("collision_world_aabb", {})
		rects.append(
			Rect2(
				float(box.get("x", 0.0)),
				float(box.get("y", 0.0)),
				float(box.get("width", 0.0)),
				float(box.get("height", 0.0)),
			)
		)
	return rects


static func is_house_collision(rect: Rect2, manifest: Dictionary = {}) -> bool:
	for house_rect in house_collision_rects(manifest):
		if absf(house_rect.position.x - rect.position.x) < 0.6 and absf(house_rect.position.y - rect.position.y) < 0.6:
			if absf(house_rect.size.x - rect.size.x) < 0.6 and absf(house_rect.size.y - rect.size.y) < 0.6:
				return true
	return false


static func sync_into(parent: Node2D, manifest: Dictionary = {}) -> void:
	if parent == null:
		return
	parent.y_sort_enabled = true
	var data: Dictionary = manifest if not manifest.is_empty() else load_manifest()
	var keep: Dictionary = {}
	for entry in houses(data):
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		var definition: Dictionary = entry
		var id := String(definition.get("house_id", ""))
		if id.is_empty():
			continue
		keep[id] = true
		var node: Node = parent.get_node_or_null(id)
		if node == null:
			var scene_path := String(definition.get("scene_path", ""))
			if scene_path.is_empty() or not ResourceLoader.exists(scene_path):
				continue
			var packed: PackedScene = load(scene_path)
			if packed == null:
				continue
			node = packed.instantiate()
			node.name = id
			parent.add_child(node)
		var world: Variant = definition.get("map_world_position", [0, 0])
		if node is Node2D and typeof(world) == TYPE_ARRAY and (world as Array).size() >= 2:
			(node as Node2D).position = Vector2(float((world as Array)[0]), float((world as Array)[1]))
			(node as Node2D).z_index = SORT_Z
		if node is ResidentialHouse2D:
			(node as ResidentialHouse2D).apply_definition(definition)
	var stale: Array = []
	for child in parent.get_children():
		if String(child.name).begins_with("residence_") and not keep.has(String(child.name)):
			stale.append(child)
	for child in stale:
		parent.remove_child(child)
		child.queue_free()
