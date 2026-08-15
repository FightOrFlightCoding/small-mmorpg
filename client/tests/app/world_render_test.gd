extends GdUnitTestSuite

## Zone geometry and visual ID mapping.


func before_test() -> void:
	SceneRouter.reset_for_tests()
	AppState.reset_for_tests()
	NetworkService.reset_for_tests()
	assert_bool(ContentRegistry.load_bundle()).is_true()
	ContentRegistry.visuals.load_map()


func test_visual_ids_resolve_from_content() -> void:
	assert_str(ContentRegistry.visual_id_for_content("player.base")).is_equal("visual.player")
	assert_str(ContentRegistry.visual_id_for_content("npc.elder")).is_equal("visual.npc_elder")
	assert_str(ContentRegistry.visual_id_for_content("enemy.green_slime")).is_equal("visual.enemy_green_slime")
	assert_str(ContentRegistry.visual_id_for_content("zone.starter")).is_equal("visual.zone_starter")
	var slime: Dictionary = ContentRegistry.resolve_visual("visual.enemy_green_slime")
	assert_str(slime["visual_id"]).is_equal("visual.enemy_green_slime")
	assert_bool(bool(slime["missing"])).is_false()
	assert_str(slime["texture_path"]).contains("kenney_rpg_base")


func test_missing_visual_id_is_visible_fallback() -> void:
	var visual: Dictionary = ContentRegistry.resolve_visual("visual.unknown")
	assert_bool(bool(visual["missing"])).is_true()
	assert_str(visual["texture_path"]).is_equal("")


func test_zone_view_renders_bounds_floor_collisions_and_spawn() -> void:
	var zone_view: ZoneView = auto_free(ZoneView.new())
	add_child(zone_view)
	zone_view.render_zone(ContentRegistry.get_by_id("zone.starter"))
	assert_object(zone_view.get_node_or_null("Floor")).is_not_null()
	assert_object(zone_view.get_node_or_null("Bounds")).is_not_null()
	assert_object(zone_view.get_node_or_null("PlayerSpawn")).is_not_null()
	assert_int(zone_view.collision_count()).is_equal(6)


func test_world_and_avatar_scenes_instantiate() -> void:
	var paths: PackedStringArray = PackedStringArray([
		"res://scenes/world/world.tscn",
		"res://scenes/world/player_avatar.tscn",
		"res://scenes/world/npc_avatar.tscn",
		"res://scenes/world/enemy_avatar.tscn",
		"res://scenes/world/loot_avatar.tscn",
		"res://scenes/world/world_hud.tscn",
		"res://scenes/world/entity_registry.tscn",
	])
	for path in paths:
		var scene: PackedScene = load(path)
		assert_object(scene).is_not_null()
		var instance: Node = auto_free(scene.instantiate())
		assert_object(instance).is_not_null()
