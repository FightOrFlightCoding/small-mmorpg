extends SceneTree

## Headless builder for the reusable grass TileSet resource.

const GROUND_PATH := "res://assets/world/terrain/grass/grass_ground_atlas.png"
const DETAIL_PATH := "res://assets/world/terrain/grass/grass_detail_atlas.png"
const ROAD_PATH := "res://assets/world/terrain/roads/stone_road_terrain_atlas.png"
const TILESET_PATH := "res://resources/world/terrain/grass_foundation_tileset.tres"
const ROAD_SOURCE_ID: int = 2
const ROAD_TERRAIN_SET: int = 1
const ROAD_TERRAIN_ID: int = 0
const ROAD_CORNERS: Array[int] = [
	TileSet.CELL_NEIGHBOR_TOP_LEFT_CORNER,
	TileSet.CELL_NEIGHBOR_TOP_RIGHT_CORNER,
	TileSet.CELL_NEIGHBOR_BOTTOM_RIGHT_CORNER,
	TileSet.CELL_NEIGHBOR_BOTTOM_LEFT_CORNER,
]
const ROAD_CORNER_BITS: Array[int] = [1, 2, 4, 8]


func _init() -> void:
	var err := _build()
	if err != OK:
		push_error("grass foundation tileset build failed: %s" % str(err))
		quit(1)
		return
	quit(0)


func _build() -> int:
	var ground_tex: Texture2D = load(GROUND_PATH)
	var detail_tex: Texture2D = load(DETAIL_PATH)
	if ground_tex == null or detail_tex == null:
		push_error("grass foundation textures missing")
		return ERR_FILE_NOT_FOUND
	var tileset := TileSet.new()
	tileset.tile_size = Vector2i(64, 64)
	tileset.add_custom_data_layer(0)
	tileset.set_custom_data_layer_name(0, "surface_type")
	tileset.set_custom_data_layer_type(0, TYPE_STRING)
	tileset.add_custom_data_layer(1)
	tileset.set_custom_data_layer_name(1, "footstep_profile")
	tileset.set_custom_data_layer_type(1, TYPE_STRING)
	tileset.add_custom_data_layer(2)
	tileset.set_custom_data_layer_name(2, "movement_speed_multiplier")
	tileset.set_custom_data_layer_type(2, TYPE_FLOAT)
	tileset.add_custom_data_layer(3)
	tileset.set_custom_data_layer_name(3, "walkable")
	tileset.set_custom_data_layer_type(3, TYPE_BOOL)
	tileset.add_terrain_set(0)
	tileset.set_terrain_set_mode(0, TileSet.TERRAIN_MODE_MATCH_CORNERS_AND_SIDES)
	tileset.add_terrain(0, 0)
	tileset.set_terrain_name(0, 0, "Grass")
	tileset.set_terrain_color(0, 0, Color(0.30, 0.44, 0.25, 1.0))
	var ground := TileSetAtlasSource.new()
	ground.texture = ground_tex
	ground.texture_region_size = Vector2i(64, 64)
	var ground_id := tileset.add_source(ground, GrassFoundationPainter.GROUND_SOURCE_ID)
	if ground_id != GrassFoundationPainter.GROUND_SOURCE_ID:
		push_error("ground atlas source id %s" % str(ground_id))
		return ERR_CANT_CREATE
	for x in 4:
		var coords := Vector2i(x, 0)
		ground.create_tile(coords)
		var data: TileData = ground.get_tile_data(coords, 0)
		data.terrain_set = 0
		data.terrain = 0
		for bit in GrassFoundationPainter.peering_bits():
			data.set_terrain_peering_bit(bit, 0)
		data.set_custom_data("surface_type", "grass")
		data.set_custom_data("footstep_profile", "grass_soft")
		data.set_custom_data("movement_speed_multiplier", 1.0)
		data.set_custom_data("walkable", true)
	var details := TileSetAtlasSource.new()
	details.texture = detail_tex
	details.texture_region_size = Vector2i(64, 64)
	var detail_id := tileset.add_source(details, GrassFoundationPainter.DETAIL_SOURCE_ID)
	if detail_id != GrassFoundationPainter.DETAIL_SOURCE_ID:
		push_error("detail atlas source id %s" % str(detail_id))
		return ERR_CANT_CREATE
	for y in 2:
		for x in 4:
			details.create_tile(Vector2i(x, y))
	var road_err := _add_road_source(tileset)
	if road_err != OK:
		return road_err
	var dir := TILESET_PATH.get_base_dir()
	if not DirAccess.dir_exists_absolute(ProjectSettings.globalize_path(dir)):
		DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(dir))
	return ResourceSaver.save(tileset, TILESET_PATH)


func _add_road_source(tileset: TileSet) -> int:
	var road_tex: Texture2D = load(ROAD_PATH)
	if road_tex == null:
		push_error("stone road atlas missing")
		return ERR_FILE_NOT_FOUND
	tileset.add_terrain_set(ROAD_TERRAIN_SET)
	tileset.set_terrain_set_mode(ROAD_TERRAIN_SET, TileSet.TERRAIN_MODE_MATCH_CORNERS)
	tileset.add_terrain(ROAD_TERRAIN_SET, ROAD_TERRAIN_ID)
	tileset.set_terrain_name(ROAD_TERRAIN_SET, ROAD_TERRAIN_ID, "StoneRoad")
	tileset.set_terrain_color(ROAD_TERRAIN_SET, ROAD_TERRAIN_ID, Color(0.62, 0.58, 0.50, 1.0))
	var roads := TileSetAtlasSource.new()
	roads.texture = road_tex
	roads.texture_region_size = Vector2i(64, 64)
	var road_id := tileset.add_source(roads, ROAD_SOURCE_ID)
	if road_id != ROAD_SOURCE_ID:
		push_error("road atlas source id %s" % str(road_id))
		return ERR_CANT_CREATE
	for mask in 16:
		var coords := Vector2i(mask % 5, int(mask / 5))
		if mask == 15:
			coords = Vector2i(0, 3)
		roads.create_tile(coords)
		_configure_road_tile(roads.get_tile_data(coords, 0), mask)
	for variant in range(1, 5):
		var coords := Vector2i(variant, 3)
		roads.create_tile(coords)
		_configure_road_tile(roads.get_tile_data(coords, 0), 15)
	return OK


func _configure_road_tile(data: TileData, mask: int) -> void:
	if data == null:
		return
	if mask > 0:
		data.terrain_set = ROAD_TERRAIN_SET
		data.terrain = ROAD_TERRAIN_ID
		for i in ROAD_CORNERS.size():
			if mask & ROAD_CORNER_BITS[i]:
				data.set_terrain_peering_bit(ROAD_CORNERS[i], ROAD_TERRAIN_ID)
	data.set_custom_data("surface_type", "stone_road")
	data.set_custom_data("footstep_profile", "stone")
	data.set_custom_data("movement_speed_multiplier", 1.0)
	data.set_custom_data("walkable", true)
