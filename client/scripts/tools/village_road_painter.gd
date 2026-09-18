class_name VillageRoadPainter
extends RefCounted

## Applies baked village-road cells. Never runs per frame.

const PLAN_PATH := "res://data/world/maps/village_road_plan.json"
const ROAD_SOURCE_ID: int = 2
const TILE_SIZE: int = 64
const DETAIL_BUFFER: int = 1


static func atlas_coords(mask: int, variant: int = 0) -> Vector2i:
	if mask < 15:
		return Vector2i(mask % 5, int(mask / 5))
	return Vector2i(clampi(variant, 0, 4), 3)


func load_plan(path: String = PLAN_PATH) -> Dictionary:
	if not FileAccess.file_exists(path):
		return {}
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	if typeof(parsed) != TYPE_DICTIONARY:
		return {}
	return parsed as Dictionary


func paint_from_plan(
	roads: TileMapLayer,
	details: TileMapLayer,
	plan: Dictionary = {}
) -> Dictionary:
	var data: Dictionary = plan if not plan.is_empty() else load_plan()
	if data.is_empty():
		return {}
	roads.clear()
	var cells: Variant = data.get("cells", [])
	if typeof(cells) != TYPE_ARRAY:
		return data
	var occupied: Dictionary = {}
	for entry in cells:
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		if int(entry.get("mask", 0)) == 15:
			occupied[Vector2i(int(entry.get("x", 0)), int(entry.get("y", 0)))] = true
	for extra in ResidentialHousePlacer.access_path_cells():
		occupied[extra] = true
	var width := int((data.get("map", {}) as Dictionary).get("width_cells", 64))
	var height := int((data.get("map", {}) as Dictionary).get("height_cells", 48))
	var masks := occupancy_to_masks(occupied, width, height)
	var painted: Dictionary = {}
	for y in range(height):
		for x in range(width):
			var mask := int(masks.get(Vector2i(x, y), 0))
			if mask <= 0:
				continue
			var cell := Vector2i(x, y)
			var variant := 0
			if mask == 15:
				variant = occupancy_hash(x, y, 18427 + 19) % 5
			roads.set_cell(cell, ROAD_SOURCE_ID, atlas_coords(mask, variant))
			painted[cell] = true
	_clear_details_with_buffer(details, painted)
	return data


static func occupancy_to_masks(occupied: Dictionary, width: int, height: int) -> Dictionary:
	var verts: Dictionary = {}
	for cell: Vector2i in occupied.keys():
		verts[Vector2i(cell.x, cell.y)] = true
		verts[Vector2i(cell.x + 1, cell.y)] = true
		verts[Vector2i(cell.x, cell.y + 1)] = true
		verts[Vector2i(cell.x + 1, cell.y + 1)] = true
	var masks: Dictionary = {}
	for y in range(height):
		for x in range(width):
			var value := 0
			if verts.get(Vector2i(x, y), false):
				value |= 1
			if verts.get(Vector2i(x + 1, y), false):
				value |= 2
			if verts.get(Vector2i(x + 1, y + 1), false):
				value |= 4
			if verts.get(Vector2i(x, y + 1), false):
				value |= 8
			if value > 0:
				masks[Vector2i(x, y)] = value
	return masks


static func occupancy_hash(x: int, y: int, seed: int) -> int:
	var n := posmod(x * 374761393 + y * 668265263 + seed * 1274126177, 4294967296)
	n = n ^ (n >> 13)
	n = posmod(n * 1274126177, 4294967296)
	n = n ^ (n >> 16)
	return n


func _clear_details_with_buffer(details: TileMapLayer, occupied: Dictionary) -> void:
	if details == null:
		return
	for cell: Vector2i in occupied.keys():
		for dy in range(-DETAIL_BUFFER, DETAIL_BUFFER + 1):
			for dx in range(-DETAIL_BUFFER, DETAIL_BUFFER + 1):
				details.erase_cell(cell + Vector2i(dx, dy))


static func configure_layer(layer: TileMapLayer, tileset: TileSet) -> void:
	layer.tile_set = tileset
	layer.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	layer.y_sort_enabled = false
	layer.collision_enabled = false
	layer.navigation_enabled = false


static func spawn_pixel(plan: Dictionary) -> Vector2:
	var spawn: Dictionary = plan.get("spawn", {})
	var pixel: Variant = spawn.get("pixel", [2016, 2976])
	if typeof(pixel) == TYPE_ARRAY and (pixel as Array).size() >= 2:
		return Vector2(float((pixel as Array)[0]), float((pixel as Array)[1]))
	return Vector2(2016, 2976)


static func plaza_pixel(plan: Dictionary) -> Vector2:
	var plaza: Dictionary = plan.get("plaza", {})
	var pixel: Variant = plaza.get("pixel", [1952, 1440])
	if typeof(pixel) == TYPE_ARRAY and (pixel as Array).size() >= 2:
		return Vector2(float((pixel as Array)[0]), float((pixel as Array)[1]))
	return Vector2(1952, 1440)
