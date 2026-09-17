extends GdUnitTestSuite

## Hearthworn grass foundation atlases, TileSet metadata, and deterministic painting.


func before_test() -> void:
	SceneRouter.reset_for_tests()
	AppState.reset_for_tests()
	assert_bool(ContentRegistry.load_bundle()).is_true()


func test_ground_atlas_is_opaque_256x64() -> void:
	var image := _atlas_image("res://assets/world/terrain/grass/grass_ground_atlas.png")
	assert_int(image.get_width()).is_equal(256)
	assert_int(image.get_height()).is_equal(64)
	for y in image.get_height():
		for x in image.get_width():
			assert_float(image.get_pixel(x, y).a).is_equal(1.0)


func test_detail_atlas_is_binary_alpha_256x128() -> void:
	var image := _atlas_image("res://assets/world/terrain/grass/grass_detail_atlas.png")
	assert_int(image.get_width()).is_equal(256)
	assert_int(image.get_height()).is_equal(128)
	for y in image.get_height():
		for x in image.get_width():
			var pixel: Color = image.get_pixel(x, y)
			assert_bool(is_equal_approx(pixel.a, 0.0) or is_equal_approx(pixel.a, 1.0)).is_true()
			if is_equal_approx(pixel.a, 0.0):
				assert_float(pixel.r).is_equal(0.0)
				assert_float(pixel.g).is_equal(0.0)
				assert_float(pixel.b).is_equal(0.0)


func test_tileset_has_grass_sources_terrain_and_surface_data() -> void:
	var tileset: TileSet = load("res://resources/world/terrain/grass_foundation_tileset.tres")
	assert_object(tileset).is_not_null()
	assert_bool(tileset.tile_size == Vector2i(64, 64)).is_true()
	assert_int(tileset.get_source_count()).is_equal(2)
	assert_int(tileset.get_physics_layers_count()).is_equal(0)
	assert_int(tileset.get_navigation_layers_count()).is_equal(0)
	assert_str(tileset.get_custom_data_layer_name(0)).is_equal("surface_type")
	assert_str(tileset.get_custom_data_layer_name(1)).is_equal("footstep_profile")
	assert_str(tileset.get_custom_data_layer_name(2)).is_equal("movement_speed_multiplier")
	assert_str(tileset.get_custom_data_layer_name(3)).is_equal("walkable")
	assert_int(tileset.get_terrains_count(0)).is_equal(1)
	assert_str(tileset.get_terrain_name(0, 0)).is_equal("Grass")
	var ground: TileSetAtlasSource = tileset.get_source(0) as TileSetAtlasSource
	assert_object(ground).is_not_null()
	assert_bool(ground.texture_region_size == Vector2i(64, 64)).is_true()
	for x in 4:
		var data: TileData = ground.get_tile_data(Vector2i(x, 0), 0)
		assert_object(data).is_not_null()
		assert_int(data.terrain_set).is_equal(0)
		assert_int(data.terrain).is_equal(0)
		assert_str(String(data.get_custom_data("surface_type"))).is_equal("grass")
		assert_str(String(data.get_custom_data("footstep_profile"))).is_equal("grass_soft")
		assert_float(float(data.get_custom_data("movement_speed_multiplier"))).is_equal(1.0)
		assert_bool(bool(data.get_custom_data("walkable"))).is_true()
	var details: TileSetAtlasSource = tileset.get_source(1) as TileSetAtlasSource
	assert_object(details).is_not_null()
	assert_int(details.get_tiles_count()).is_equal(8)


func test_painter_is_deterministic_and_details_are_removable() -> void:
	var tileset: TileSet = load("res://resources/world/terrain/grass_foundation_tileset.tres")
	var ground_a: TileMapLayer = auto_free(TileMapLayer.new())
	var ground_b: TileMapLayer = auto_free(TileMapLayer.new())
	var details_a: TileMapLayer = auto_free(TileMapLayer.new())
	var details_b: TileMapLayer = auto_free(TileMapLayer.new())
	add_child(ground_a)
	add_child(ground_b)
	add_child(details_a)
	add_child(details_b)
	GrassFoundationPainter.configure_layer(ground_a, tileset)
	GrassFoundationPainter.configure_layer(ground_b, tileset)
	GrassFoundationPainter.configure_layer(details_a, tileset)
	GrassFoundationPainter.configure_layer(details_b, tileset)
	var painter := GrassFoundationPainter.new()
	painter.paint_test_map(ground_a, details_a, 18427)
	painter.paint_test_map(ground_b, details_b, 18427)
	var used_ground: Dictionary = {}
	var detail_count: int = 0
	var no_detail_count: int = 0
	for y in GrassFoundationPainter.TEST_MAP_SIZE.y:
		for x in GrassFoundationPainter.TEST_MAP_SIZE.x:
			var cell := Vector2i(x, y)
			assert_int(ground_a.get_cell_source_id(cell)).is_equal(0)
			assert_bool(ground_a.get_cell_atlas_coords(cell) == ground_b.get_cell_atlas_coords(cell)).is_true()
			assert_bool(details_a.get_cell_atlas_coords(cell) == details_b.get_cell_atlas_coords(cell)).is_true()
			used_ground[ground_a.get_cell_atlas_coords(cell)] = true
			if details_a.get_cell_source_id(cell) == 1:
				detail_count += 1
			if x < GrassFoundationPainter.TEST_NO_DETAIL_COLUMNS:
				assert_int(details_a.get_cell_source_id(cell)).is_equal(-1)
				no_detail_count += 1
	assert_int(used_ground.size()).is_greater_equal(3)
	assert_int(detail_count).is_greater(0)
	assert_int(no_detail_count).is_equal(GrassFoundationPainter.TEST_NO_DETAIL_COLUMNS * GrassFoundationPainter.TEST_MAP_SIZE.y)
	var sample := Vector2i(8, 4)
	if details_a.get_cell_source_id(sample) != 1:
		sample = Vector2i(9, 5)
		details_a.set_cell(sample, 1, Vector2i(0, 0))
	painter.clear_details_at(details_a, sample)
	assert_int(details_a.get_cell_source_id(sample)).is_equal(-1)


func test_grass_foundation_scene_instantiates_with_layers_and_player() -> void:
	var scene: PackedScene = load("res://scenes/world/terrain/grass_foundation_test.tscn")
	assert_object(scene).is_not_null()
	var root: Node = auto_free(scene.instantiate())
	add_child(root)
	await get_tree().process_frame
	var ground: TileMapLayer = root.get_node("WorldTerrain/GrassGround") as TileMapLayer
	var details: TileMapLayer = root.get_node("WorldTerrain/GrassDetails") as TileMapLayer
	var player: PlayerAvatar = root.get_node("PlayerAvatar") as PlayerAvatar
	assert_object(ground).is_not_null()
	assert_object(details).is_not_null()
	assert_object(player).is_not_null()
	assert_int(ground.z_index).is_less(details.z_index)
	assert_int(details.z_index).is_less(player.z_index)
	assert_bool(ground.y_sort_enabled).is_false()
	assert_bool(details.y_sort_enabled).is_false()
	assert_int(ground.get_used_cells().size()).is_equal(
		GrassFoundationPainter.TEST_MAP_SIZE.x * GrassFoundationPainter.TEST_MAP_SIZE.y
	)
	assert_object(player.get_node_or_null("AnimatedSprite2D")).is_not_null()
	assert_bool((player.get_node("AnimatedSprite2D") as AnimatedSprite2D).visible).is_true()
	assert_bool((player.get_node("Body") as CanvasItem).visible).is_false()
	assert_bool(ground.collision_enabled).is_false()
	assert_bool(details.collision_enabled).is_false()
	var start := player.position
	player.position += Vector2(48.0, 24.0)
	assert_bool(player.position.x > start.x).is_true()
	assert_bool(player.position.y > start.y).is_true()


func test_starter_zone_view_paints_grass_foundation() -> void:
	var zone_view: ZoneView = auto_free(ZoneView.new())
	add_child(zone_view)
	zone_view.render_zone(ContentRegistry.get_by_id("zone.starter"))
	var ground: TileMapLayer = zone_view.get_node_or_null("WorldTerrain/GrassGround") as TileMapLayer
	assert_object(ground).is_not_null()
	assert_int(ground.get_used_cells().size()).is_equal(240)
	assert_object(zone_view.get_node_or_null("FloorTiles")).is_null()


func _atlas_image(path: String) -> Image:
	var texture: Texture2D = load(path)
	assert_object(texture).is_not_null()
	var image: Image = texture.get_image()
	assert_object(image).is_not_null()
	return image
