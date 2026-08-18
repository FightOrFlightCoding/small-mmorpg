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
	assert_object(zone_view.get_node_or_null("FloorTiles")).is_not_null()
	assert_bool(zone_view.get_node("FloorTiles") is Polygon2D).is_true()
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


func test_world_hud_panels_do_not_cover_chat_or_allocate_buttons() -> void:
	var viewport := get_viewport()
	viewport.size = Vector2i(1280, 720)
	var hud: WorldHud = auto_free(preload("res://scenes/world/world_hud.tscn").instantiate())
	var chat: ChatPanel = auto_free(preload("res://scenes/world/chat_panel.tscn").instantiate())
	var overlay: NetDebugOverlay = auto_free(preload("res://scenes/world/net_debug_overlay.tscn").instantiate())
	add_child(hud)
	add_child(chat)
	add_child(overlay)
	await get_tree().process_frame
	assert_int(hud.layer).is_greater(chat.layer)
	var progression: Control = hud.get_node("Root/Progression")
	var inventory: Control = hud.get_node("Root/Inventory")
	var journal: Control = hud.get_node("Root/Journal")
	var chat_root: Control = chat.get_node("Root")
	var debug_root: Control = overlay.get_node("Root")
	assert_bool(progression.get_global_rect().intersects(chat_root.get_global_rect())).is_false()
	assert_bool(inventory.get_global_rect().intersects(chat_root.get_global_rect())).is_false()
	assert_bool(journal.get_global_rect().intersects(inventory.get_global_rect())).is_false()
	var party: Control = hud.get_node("Root/Party")
	assert_object(party).is_not_null()
	assert_bool(party.get_global_rect().intersects(chat_root.get_global_rect())).is_false()
	assert_bool(party.get_global_rect().intersects(progression.get_global_rect())).is_false()
	assert_float(party.anchor_bottom).is_equal(1.0)
	viewport.size = Vector2i(1280, 600)
	await get_tree().process_frame
	assert_bool(party.get_global_rect().intersects(progression.get_global_rect())).is_false()
	viewport.size = Vector2i(1280, 720)
	var party_chat: Label = hud.get_node("Root/Party/Margin/Scroll/VBox/ChatScroll/ChatHistory")
	assert_str(party_chat.get_class()).is_equal("Label")
	assert_str(party_chat.get_class()).is_not_equal("RichTextLabel")
	assert_bool(debug_root.get_global_rect().intersects(progression.get_global_rect())).is_false()
	assert_bool(debug_root.get_global_rect().intersects(chat_root.get_global_rect())).is_false()
	assert_int(int(debug_root.mouse_filter)).is_equal(Control.MOUSE_FILTER_IGNORE)
