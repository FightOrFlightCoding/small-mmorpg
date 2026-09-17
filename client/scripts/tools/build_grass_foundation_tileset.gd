extends SceneTree

## Headless builder for the reusable grass TileSet resource.

const GROUND_PATH := "res://assets/world/terrain/grass/grass_ground_atlas.png"
const DETAIL_PATH := "res://assets/world/terrain/grass/grass_detail_atlas.png"
const TILESET_PATH := "res://resources/world/terrain/grass_foundation_tileset.tres"


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
	var dir := TILESET_PATH.get_base_dir()
	if not DirAccess.dir_exists_absolute(ProjectSettings.globalize_path(dir)):
		DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(dir))
	return ResourceSaver.save(tileset, TILESET_PATH)
