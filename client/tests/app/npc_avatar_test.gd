extends GdUnitTestSuite

## Generic NpcAvatar is a placeholder actor with an interaction area and no physics body.


func before_test() -> void:
	SceneRouter.reset_for_tests()
	AppState.reset_for_tests()
	NetworkService.reset_for_tests()
	assert_bool(ContentRegistry.load_bundle()).is_true()
	ContentRegistry.visuals.load_map()


func test_placeholder_square_name_marker_and_interaction_area() -> void:
	var packed: PackedScene = load("res://scenes/world/npc_avatar.tscn")
	var avatar: NpcAvatar = auto_free(packed.instantiate()) as NpcAvatar
	add_child(avatar)
	await get_tree().process_frame
	avatar.configure("npc", "npc.elder", "Elder", ContentRegistry.resolve_visual("visual.npc_elder"))
	assert_bool(avatar is Node2D).is_true()
	assert_bool(avatar is NpcAvatar).is_true()
	var body: Polygon2D = avatar.get_node("Body") as Polygon2D
	assert_object(body).is_not_null()
	assert_bool(body.visible).is_true()
	assert_int(body.polygon.size()).is_equal(4)
	var label: Label = avatar.get_node("NameLabel") as Label
	assert_str(label.text).is_equal("Elder")
	assert_object(avatar.get_node("MarkerAnchor")).is_not_null()
	var area: Area2D = avatar.get_node("InteractionArea") as Area2D
	assert_object(area).is_not_null()
	assert_bool(area.monitoring).is_false()
	assert_bool(area.monitorable).is_false()
	assert_bool(area.input_pickable).is_true()
	assert_int(area.collision_mask).is_equal(0)
	assert_object(avatar.get_node_or_null("StaticBody2D")).is_null()
	assert_object(avatar.get_node_or_null("CharacterBody2D")).is_null()
	assert_object(avatar.get_node_or_null("RigidBody2D")).is_null()
	avatar.position = Vector2(1440, 1344)
	assert_bool(avatar.contains_world_point(Vector2(1440, 1344))).is_true()
	assert_bool(avatar.contains_world_point(Vector2(1440 + 47, 1344))).is_true()
	assert_bool(avatar.contains_world_point(Vector2(1440 + 80, 1344))).is_false()
	var sprite: Sprite2D = avatar.get_node("Sprite") as Sprite2D
	assert_bool(sprite.visible).is_false()


func test_entity_registry_spawns_generic_npc_from_content() -> void:
	var registry: EntityRegistry = auto_free(EntityRegistry.new())
	add_child(registry)
	registry.apply_full_state({
		"self_id": "user-alice",
		"zone_id": "zone.starter",
		"tick": 1,
		"players": [],
		"npcs": [{"id": "npc.elder", "npcId": "npc.elder", "x": 1440, "y": 1344}],
		"enemies": [],
		"loot": [],
	})
	assert_bool(registry.has_entity("npc:npc.elder")).is_true()
	var node := registry.get_entity("npc:npc.elder")
	assert_bool(node is NpcAvatar).is_true()
	var avatar := node as NpcAvatar
	assert_bool((avatar.get_node("Body") as Polygon2D).visible).is_true()
	assert_str((avatar.get_node("NameLabel") as Label).text).is_equal("Elder")
	avatar.position = Vector2(1440, 1344)
	assert_str(registry.npc_id_at_world_point(Vector2(1440, 1344))).is_equal("npc.elder")
	assert_str(registry.npc_id_at_world_point(Vector2(1440 + 80, 1344))).is_equal("")
