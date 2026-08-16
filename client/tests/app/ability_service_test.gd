extends GdUnitTestSuite

## Ability intentions, hotbar, and server-owned cooldown/cast mirrors.


func before_test() -> void:
	SceneRouter.reset_for_tests()
	AppState.reset_for_tests()
	NetworkService.reset_for_tests()
	AbilityService.reset_for_tests()
	assert_bool(ContentRegistry.load_bundle()).is_true()


func test_use_ability_sends_id_and_target_without_outcomes() -> void:
	var fake := FakeNetworkBackend.new()
	NetworkService.backend = fake
	NetworkService.match_id = "match-starter-shared"
	AppState.zone_view = {
		"self_id": "user-alice",
		"players": [{"userId": "user-alice", "x": 930, "y": 400}],
		"enemies": [{
			"id": "enemy.green_slime:0",
			"enemyId": "enemy.green_slime",
			"x": 960,
			"y": 400,
			"health": 20,
			"alive": true,
		}],
	}
	var request_id := AbilityService.try_use("test.ability.basic_melee")
	await get_tree().process_frame
	assert_str(request_id).is_not_empty()
	assert_int(fake.last_send_opcode).is_equal(MatchProtocol.CLIENT_USE_ABILITY)
	var body: Dictionary = JSON.parse_string(fake.last_send_payload)
	assert_str(String(body["abilityId"])).is_equal("test.ability.basic_melee")
	assert_str(String(body["targetId"])).is_equal("enemy.green_slime:0")
	assert_str(String(body["requestId"])).is_equal(request_id)
	assert_bool(body.has("damage")).is_false()
	assert_bool(body.has("castTime")).is_false()
	assert_bool(body.has("cooldown")).is_false()


func test_ground_target_enters_targeting_then_sends_point() -> void:
	var fake := FakeNetworkBackend.new()
	NetworkService.backend = fake
	NetworkService.match_id = "match-starter-shared"
	var started := AbilityService.try_use("test.ability.damage_over_time")
	assert_str(started).is_empty()
	assert_bool(AbilityService.is_targeting()).is_true()
	var request_id := AbilityService.confirm_ground_target(Vector2(960, 400))
	await get_tree().process_frame
	assert_str(request_id).is_not_empty()
	assert_int(fake.last_send_opcode).is_equal(MatchProtocol.CLIENT_USE_ABILITY)
	var body: Dictionary = JSON.parse_string(fake.last_send_payload)
	assert_str(String(body["abilityId"])).is_equal("test.ability.damage_over_time")
	assert_float(float(body["targetX"])).is_equal(960.0)
	assert_float(float(body["targetY"])).is_equal(400.0)
	assert_bool(body.has("duration")).is_false()


func test_canonical_ability_state_replaces_hotbar_and_cooldowns() -> void:
	AbilityService.apply_canonical({
		"unlockedAbilityIds": ["test.ability.basic_melee"],
		"hotbar": ["test.ability.basic_melee", "", "", "", "", "", "", ""],
		"abilityRanks": {"test.ability.basic_melee": 1},
		"resources": {"test.resource.mana": 40},
		"cooldowns": {"test.ability.basic_melee": 3},
		"globalCooldownRemaining": 2,
		"activeCast": {},
		"effects": [{"effectId": "might", "type": "timed_stat_modifier", "stacks": 1}],
	})
	assert_int(AbilityService.hotbar.size()).is_equal(8)
	assert_str(String(AbilityService.hotbar[0])).is_equal("test.ability.basic_melee")
	assert_int(AbilityService.cooldown_remaining("test.ability.basic_melee")).is_equal(3)
	assert_int(int(AbilityService.resources["test.resource.mana"])).is_equal(40)
	assert_int(AbilityService.effects.size()).is_equal(1)


func test_hud_shows_hotbar_and_cast_bar() -> void:
	AbilityService.apply_canonical({
		"unlockedAbilityIds": ["test.ability.basic_melee"],
		"hotbar": ["test.ability.basic_melee", "", "", "", "", "", "", ""],
		"cooldowns": {"test.ability.basic_melee": 4},
		"activeCast": {"abilityId": "test.ability.ranged_bolt", "startTick": 1, "completionTick": 5},
	})
	AppState.zone_view = {"tick": 3}
	var hud: WorldHud = auto_free(preload("res://scenes/world/world_hud.tscn").instantiate())
	add_child(hud)
	await get_tree().process_frame
	var slot0: Button = hud.get_node("Root/Hotbar/Slot0")
	assert_str(slot0.text).contains("Basic Melee")
	var cast_bar: ProgressBar = hud.get_node("Root/CastBar")
	assert_bool(cast_bar.visible).is_true()
	assert_float(cast_bar.value).is_greater(0.0)
