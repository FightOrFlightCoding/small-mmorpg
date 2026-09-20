extends GdUnitTestSuite

## EntityRegistry applies authoritative FULL_STATE without duplicating nodes.


func before_test() -> void:
	SceneRouter.reset_for_tests()
	AppState.reset_for_tests()
	NetworkService.reset_for_tests()
	assert_bool(ContentRegistry.load_bundle()).is_true()
	ContentRegistry.visuals.load_map()


func _registry() -> EntityRegistry:
	var registry: EntityRegistry = auto_free(EntityRegistry.new())
	add_child(registry)
	return registry


func _alice_bob_state() -> Dictionary:
	return {
		"self_id": "user-alice",
		"zone_id": "zone.starter",
		"tick": 3,
		"players": [
			{"userId": "user-alice", "name": "Alice", "x": 240, "y": 384},
			{"userId": "user-bob", "name": "Bob", "x": 260, "y": 400},
		],
		"npcs": [{"id": "npc.elder", "npcId": "npc.elder", "x": 160, "y": 320}],
		"enemies": [{"id": "enemy.green_slime:0", "enemyId": "enemy.green_slime", "x": 960, "y": 400}],
		"loot": [],
	}


func test_alice_sees_alice_bob_elder_and_slime() -> void:
	var registry := _registry()
	registry.apply_full_state(_alice_bob_state())
	assert_int(registry.entity_count()).is_equal(4)
	assert_bool(registry.has_entity("player:user-alice")).is_true()
	assert_bool(registry.has_entity("player:user-bob")).is_true()
	assert_bool(registry.has_entity("npc:npc.elder")).is_true()
	assert_bool(registry.has_entity("enemy:enemy.green_slime:0")).is_true()
	var local_avatar := registry.get_entity("player:user-alice") as WorldAvatar
	var remote_avatar := registry.get_entity("player:user-bob") as WorldAvatar
	assert_bool(local_avatar.is_local).is_true()
	assert_bool(remote_avatar.is_local).is_false()
	var names := ",".join(registry.summaries())
	assert_str(names).contains("Alice")
	assert_str(names).contains("Bob")
	assert_str(names).contains("Elder")
	assert_str(names).contains("Green Slime")
	var alice_body: Polygon2D = local_avatar.get_node("Body")
	var bob_body: Polygon2D = remote_avatar.get_node("Body")
	assert_bool(alice_body.color.is_equal_approx(bob_body.color)).is_false()


func test_repeated_full_state_does_not_duplicate() -> void:
	var registry := _registry()
	var state := _alice_bob_state()
	registry.apply_full_state(state)
	registry.apply_full_state(state)
	registry.apply_full_state(state)
	assert_int(registry.entity_count()).is_equal(4)
	assert_int(registry.get_child_count()).is_equal(4)


func test_absent_entities_are_removed() -> void:
	var registry := _registry()
	registry.apply_full_state(_alice_bob_state())
	var without_bob: Dictionary = _alice_bob_state()
	without_bob["players"] = [{"userId": "user-alice", "name": "Alice", "x": 240, "y": 384}]
	registry.apply_full_state(without_bob)
	assert_int(registry.entity_count()).is_equal(3)
	assert_bool(registry.has_entity("player:user-bob")).is_false()


func test_unknown_entity_kind_is_rejected() -> void:
	var registry := _registry()
	registry.apply_full_state(_alice_bob_state())
	registry.apply_unknown_kind("dragon", [{"id": "dragon.1"}])
	assert_int(registry.entity_count()).is_equal(4)
	assert_bool(registry.rejected_kinds.has("dragon")).is_true()


func test_corpses_are_known_entities_without_combat_collision() -> void:
	var registry := _registry()
	var state := _alice_bob_state()
	state["corpses"] = [{
		"id": "corpse-slime-1",
		"enemyId": "enemy.green_slime",
		"x": 960,
		"y": 400,
	}]
	registry.apply_full_state(state)
	assert_bool(registry.rejected_kinds.has("corpse")).is_false()
	assert_bool(registry.has_entity("corpse:corpse-slime-1")).is_true()
	var avatar := registry.get_entity("corpse:corpse-slime-1") as CorpseAvatar
	assert_object(avatar).is_not_null()
	assert_str(avatar.display_name).contains("Slime")
	assert_bool(avatar.contains_world_point(Vector2(960, 400))).is_true()
	assert_str(registry.corpse_id_at_world_point(Vector2(960, 400))).is_equal("corpse-slime-1")
	state["corpses"] = []
	registry.apply_full_state(state)
	assert_bool(registry.has_entity("corpse:corpse-slime-1")).is_false()


func test_ground_items_are_known_entities_without_physics_collision() -> void:
	var registry := _registry()
	var state := _alice_bob_state()
	state["groundItems"] = [{
		"groundEntityId": "ground-1",
		"itemId": "item.slime_gel",
		"quantity": 2,
		"x": 250,
		"y": 390,
		"rarity": "rarity.common",
	}]
	registry.apply_full_state(state)
	assert_bool(registry.rejected_kinds.has("ground")).is_false()
	assert_bool(registry.has_entity("ground:ground-1")).is_true()
	var avatar := registry.get_entity("ground:ground-1") as GroundItemAvatar
	assert_object(avatar).is_not_null()
	assert_str(avatar.display_name.to_lower()).contains("gel")
	assert_bool(avatar.contains_world_point(Vector2(250, 390))).is_true()
	assert_str(registry.ground_entity_id_at_world_point(Vector2(250, 390))).is_equal("ground-1")
	assert_object(avatar.get_node_or_null("CollisionShape2D")).is_null()
	assert_object(avatar.get_node_or_null("StaticBody2D")).is_null()
	assert_bool(avatar.contains_world_point(Vector2(250 + 32, 390))).is_true()
	assert_str(registry.ground_entity_id_at_world_point(Vector2(250 + 24, 390))).is_equal("ground-1")
	var body := avatar.get_node_or_null("Body") as Polygon2D
	var sprite := avatar.get_node_or_null("Sprite") as Sprite2D
	assert_bool((body != null and body.visible) or (sprite != null and sprite.visible)).is_true()
	state["groundItems"] = []
	registry.apply_full_state(state)
	assert_bool(registry.has_entity("ground:ground-1")).is_false()


func test_snapshot_spawns_ground_items_for_other_players() -> void:
	var registry := _registry()
	registry.apply_full_state(_alice_bob_state())
	assert_bool(registry.has_entity("ground:ground.qa.potion")).is_false()
	var snapshot := _alice_bob_state()
	snapshot["groundItems"] = [{
		"groundEntityId": "ground.qa.potion",
		"itemId": "item.test_potion",
		"quantity": 1,
		"x": 2320,
		"y": 2976,
		"rarity": "rarity.common",
	}]
	registry.apply_snapshot(snapshot, 0.0)
	assert_bool(registry.has_entity("ground:ground.qa.potion")).is_true()
	var avatar := registry.get_entity("ground:ground.qa.potion") as GroundItemAvatar
	assert_object(avatar).is_not_null()
	assert_vector(avatar.position).is_equal(Vector2(2320, 2976))
	assert_bool(avatar.contains_world_point(Vector2(2320, 2976))).is_true()
	assert_str(registry.ground_entity_id_at_world_point(Vector2(2336, 2976))).is_equal("ground.qa.potion")
	assert_bool((avatar.get_node("Body") as Polygon2D).visible).is_true()
	assert_int((avatar.get_node("NameLabel") as Control).mouse_filter).is_equal(Control.MOUSE_FILTER_IGNORE)
	assert_bool(avatar.contains_world_point(Vector2(2320, 3000))).is_true()
	assert_str(registry.ground_entity_id_at_world_point(Vector2(2270, 3000))).is_equal("ground.qa.potion")


func test_quest_markers_are_not_unknown_entities() -> void:
	var registry := _registry()
	var state := _alice_bob_state()
	state["npc_quest_markers"] = [{"npcId": "npc.elder", "marker": "!"}]
	registry.apply_full_state(state)
	assert_bool(registry.rejected_kinds.has("npc_quest_marker")).is_false()
	assert_int(registry.entity_count()).is_equal(4)


func test_missing_visual_falls_back_without_crash() -> void:
	var catalog := VisualCatalog.new()
	catalog.load_map()
	var missing: Dictionary = catalog.resolve("visual.does_not_exist")
	assert_bool(bool(missing["missing"])).is_true()
	var registry := _registry()
	var state := _alice_bob_state()
	state["npcs"] = [{"id": "npc.missing", "npcId": "npc.does_not_exist", "x": 10, "y": 10}]
	registry.apply_full_state(state)
	assert_bool(registry.has_entity("npc:npc.missing")).is_true()
	var npc := registry.get_entity("npc:npc.missing") as WorldAvatar
	assert_bool(npc.used_fallback).is_true()
