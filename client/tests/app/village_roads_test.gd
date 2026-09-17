extends GdUnitTestSuite

## Stone-road atlas, TileSet overlay, baked village plan, and connectivity.


func before_test() -> void:
	SceneRouter.reset_for_tests()
	AppState.reset_for_tests()
	assert_bool(ContentRegistry.load_bundle()).is_true()


func test_stone_road_atlas_contract() -> void:
	var image := _atlas_image("res://assets/world/terrain/roads/stone_road_terrain_atlas.png")
	assert_int(image.get_width()).is_equal(320)
	assert_int(image.get_height()).is_equal(256)
	for y in image.get_height():
		for x in image.get_width():
			var pixel: Color = image.get_pixel(x, y)
			assert_bool(is_equal_approx(pixel.a, 0.0) or is_equal_approx(pixel.a, 1.0)).is_true()
			if is_equal_approx(pixel.a, 0.0):
				assert_float(pixel.r).is_equal(0.0)
				assert_float(pixel.g).is_equal(0.0)
				assert_float(pixel.b).is_equal(0.0)
	assert_float(image.get_pixel(0, 0).a).is_equal(0.0)
	assert_float(image.get_pixel(32, 32).a).is_equal(0.0)
	assert_float(image.get_pixel(32, 224).a).is_equal(1.0)


func test_tileset_has_stone_road_overlay() -> void:
	var tileset: TileSet = load("res://resources/world/terrain/grass_foundation_tileset.tres")
	assert_object(tileset).is_not_null()
	assert_int(tileset.get_source_count()).is_equal(3)
	assert_int(tileset.get_terrain_sets_count()).is_equal(2)
	assert_int(tileset.get_terrain_set_mode(1)).is_equal(TileSet.TERRAIN_MODE_MATCH_CORNERS)
	assert_str(tileset.get_terrain_name(1, 0)).is_equal("StoneRoad")
	assert_int(tileset.get_physics_layers_count()).is_equal(0)
	assert_int(tileset.get_navigation_layers_count()).is_equal(0)
	var roads: TileSetAtlasSource = tileset.get_source(2) as TileSetAtlasSource
	assert_object(roads).is_not_null()
	assert_bool(roads.texture_region_size == Vector2i(64, 64)).is_true()
	assert_int(roads.get_tiles_count()).is_equal(20)
	var full: TileData = roads.get_tile_data(Vector2i(0, 3), 0)
	assert_object(full).is_not_null()
	assert_int(full.terrain_set).is_equal(1)
	assert_int(full.terrain).is_equal(0)
	assert_str(String(full.get_custom_data("surface_type"))).is_equal("stone_road")
	assert_str(String(full.get_custom_data("footstep_profile"))).is_equal("stone")
	assert_float(float(full.get_custom_data("movement_speed_multiplier"))).is_equal(1.0)
	assert_bool(bool(full.get_custom_data("walkable"))).is_true()
	for variant in range(1, 5):
		var data: TileData = roads.get_tile_data(Vector2i(variant, 3), 0)
		assert_object(data).is_not_null()
		assert_int(data.terrain_set).is_equal(1)
		assert_int(data.terrain).is_equal(0)


func test_village_road_plan_and_painter_are_deterministic() -> void:
	var painter := VillageRoadPainter.new()
	var plan: Dictionary = painter.load_plan()
	assert_bool(plan.is_empty()).is_false()
	assert_int(int(plan.get("atlas_source_id", -1))).is_equal(2)
	assert_int(int(plan.get("terrain_set_id", -1))).is_equal(1)
	var map_info: Dictionary = plan.get("map", {})
	assert_int(int(map_info.get("width_cells", 0))).is_equal(64)
	assert_int(int(map_info.get("height_cells", 0))).is_equal(48)
	assert_int(int(map_info.get("area_cells", 0))).is_equal(3072)
	var connectivity: Dictionary = plan.get("connectivity", {})
	assert_bool(bool(connectivity.get("ok", false))).is_true()
	assert_bool(bool(connectivity.get("main_road_reaches_bottom", false))).is_true()
	assert_bool(bool(connectivity.get("spawn_on_road", false))).is_true()
	var spawn: Dictionary = plan.get("spawn", {})
	assert_str(String(spawn.get("id", ""))).is_equal("main_road_south")
	assert_str(String(spawn.get("facing", ""))).is_equal("north")
	var tileset: TileSet = load("res://resources/world/terrain/grass_foundation_tileset.tres")
	var roads_a: TileMapLayer = auto_free(TileMapLayer.new())
	var roads_b: TileMapLayer = auto_free(TileMapLayer.new())
	var details: TileMapLayer = auto_free(TileMapLayer.new())
	add_child(roads_a)
	add_child(roads_b)
	add_child(details)
	VillageRoadPainter.configure_layer(roads_a, tileset)
	VillageRoadPainter.configure_layer(roads_b, tileset)
	GrassFoundationPainter.configure_layer(details, tileset)
	painter.paint_from_plan(roads_a, details, plan)
	painter.paint_from_plan(roads_b, details, plan)
	var used := roads_a.get_used_cells()
	assert_int(used.size()).is_equal(roads_b.get_used_cells().size())
	assert_int(used.size()).is_greater(800)
	var spawn_cell := Vector2i(int((spawn.get("cell", [31, 46]) as Array)[0]), int((spawn.get("cell", [31, 46]) as Array)[1]))
	assert_int(roads_a.get_cell_source_id(spawn_cell)).is_equal(2)
	assert_bool(roads_a.get_cell_atlas_coords(spawn_cell).y == 3).is_true()
	assert_int(details.get_cell_source_id(spawn_cell)).is_equal(-1)


func test_starter_zone_spawn_and_camera_use_expanded_bounds() -> void:
	var zone: Dictionary = ContentRegistry.get_by_id("zone.starter")
	assert_int(int(zone.get("width", 0))).is_equal(4096)
	assert_int(int(zone.get("height", 0))).is_equal(3072)
	var spawn: Dictionary = zone.get("playerSpawn", {})
	assert_float(float(spawn.get("x", 0))).is_equal(2016.0)
	assert_float(float(spawn.get("y", 0))).is_equal(2976.0)
	var zone_view: ZoneView = auto_free(ZoneView.new())
	add_child(zone_view)
	zone_view.render_zone(zone)
	var roads: TileMapLayer = zone_view.get_node_or_null("WorldTerrain/StoneRoads") as TileMapLayer
	assert_object(roads).is_not_null()
	assert_int(roads.get_used_cells().size()).is_greater(800)
	var marker: Node2D = zone_view.get_node_or_null("PlayerSpawn") as Node2D
	assert_object(marker).is_not_null()
	assert_vector(marker.position).is_equal(Vector2(2016, 2976))
	var scene: PackedScene = load("res://scenes/world/terrain/village_roads_test.tscn")
	assert_object(scene).is_not_null()
	var root: Node = auto_free(scene.instantiate())
	add_child(root)
	await get_tree().process_frame
	var player: PlayerAvatar = root.get_node("PlayerAvatar") as PlayerAvatar
	assert_object(player).is_not_null()
	assert_vector(player.position).is_equal(Vector2(2016, 2976))


func _atlas_image(path: String) -> Image:
	var texture: Texture2D = load(path)
	assert_object(texture).is_not_null()
	var image: Image = texture.get_image()
	assert_object(image).is_not_null()
	return image
