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
