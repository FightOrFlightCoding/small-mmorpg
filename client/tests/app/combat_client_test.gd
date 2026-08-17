extends GdUnitTestSuite

## Attack intentions, combat-event parse, and health presentation.


func before_test() -> void:
	SceneRouter.reset_for_tests()
	AppState.reset_for_tests()
	NetworkService.reset_for_tests()
	assert_bool(ContentRegistry.load_bundle()).is_true()


func test_nearby_enemy_pick_ignores_dead_and_far_targets() -> void:
	var slime := [{
		"id": "enemy.green_slime:0",
		"enemyId": "enemy.green_slime",
		"x": 960,
		"y": 400,
		"health": 20,
		"alive": true,
	}]
	assert_str(AttackIntent.nearest_enemy_id(Vector2(960, 400), slime)).is_equal("enemy.green_slime:0")
	assert_str(AttackIntent.nearest_enemy_id(Vector2(240, 384), slime)).is_equal("")
	slime[0]["alive"] = false
	slime[0]["health"] = 0
	assert_str(AttackIntent.nearest_enemy_id(Vector2(960, 400), slime)).is_equal("")


func test_attack_payload_sends_target_and_request_id_without_damage() -> void:
	var fake := FakeNetworkBackend.new()
	NetworkService.backend = fake
	NetworkService.match_id = "match-starter-shared"
	await NetworkService.send_attack("enemy.green_slime:0", "req-atk-client-1")
	assert_int(fake.last_send_opcode).is_equal(MatchProtocol.CLIENT_ATTACK)
	var body: Dictionary = JSON.parse_string(fake.last_send_payload)
	assert_str(String(body["targetId"])).is_equal("enemy.green_slime:0")
	assert_str(String(body["requestId"])).is_equal("req-atk-client-1")
	assert_bool(body.has("damage")).is_false()
	assert_bool(body.has("health")).is_false()


func test_combat_event_parse_keeps_server_damage() -> void:
	var parsed: Dictionary = MatchProtocol.parse_combat_event(JSON.stringify({
		"protocolVersion": 1,
		"tick": 12,
		"events": [{
			"type": "hit",
			"sourceId": "user-alice",
			"sourceKind": "player",
			"targetId": "enemy.green_slime:0",
			"targetKind": "enemy",
			"damage": 4,
			"remainingHealth": 16,
			"x": 960,
			"y": 400,
		}],
	}))
	assert_bool(bool(parsed["ok"])).is_true()
	assert_int(int(parsed["tick"])).is_equal(12)
	var events: Array = parsed["events"]
	assert_int(events.size()).is_equal(1)
	assert_int(int(events[0]["damage"])).is_equal(4)


func test_hud_shows_player_and_slime_health_and_death() -> void:
	var hud: WorldHud = auto_free(preload("res://scenes/world/world_hud.tscn").instantiate())
	add_child(hud)
	await get_tree().process_frame
	hud.refresh({
		"self_id": "user-alice",
		"zone_id": "zone.starter",
		"tick": 8,
		"ack_seq": 3,
		"players": [{"userId": "user-alice", "name": "Alice", "health": 0, "maxHealth": 100}],
		"enemies": [{
			"id": "enemy.green_slime:0",
			"enemyId": "enemy.green_slime",
			"health": 12,
			"maxHealth": 20,
			"state": "idle",
			"alive": true,
		}],
	}, PackedStringArray(["Alice"]))
	var health: Label = hud.get_node("Root/Margin/VBox/Health")
	assert_str(health.text).contains("You: 0 / 100")
	assert_str(health.text).contains("Slime: 12 / 20")
	var death: Label = hud.get_node("Root/Death")
	assert_bool(death.visible).is_true()
	var combat_state: Label = hud.get_node("Root/Margin/VBox/CombatState")
	assert_str(combat_state.text).is_equal("Defeated")
	var respawn: Button = hud.get_node("Root/RespawnButton")
	assert_bool(respawn.visible).is_true()


func test_hud_shows_target_frame_and_combat_indicator() -> void:
	var hud: WorldHud = auto_free(preload("res://scenes/world/world_hud.tscn").instantiate())
	add_child(hud)
	await get_tree().process_frame
	hud.refresh({
		"self_id": "user-alice",
		"zone_id": "zone.starter",
		"tick": 8,
		"ack_seq": 3,
		"players": [{
			"userId": "user-alice",
			"name": "Alice",
			"health": 80,
			"maxHealth": 100,
			"inCombat": true,
			"hostileTargetId": "enemy.green_slime:0",
		}],
		"enemies": [{
			"id": "enemy.green_slime:0",
			"enemyId": "enemy.green_slime",
			"health": 12,
			"maxHealth": 20,
			"state": "idle",
			"alive": true,
		}],
	}, PackedStringArray(["Alice"]))
	var combat_state: Label = hud.get_node("Root/Margin/VBox/CombatState")
	assert_str(combat_state.text).is_equal("In combat")
	var frame: PanelContainer = hud.get_node("Root/TargetFrame")
	assert_bool(frame.visible).is_true()
	assert_str(hud.get_node("Root/TargetFrame/Margin/VBox/Vitals").text).contains("12 / 20 (idle)")


func test_set_target_payload_sends_id_without_damage() -> void:
	var fake := FakeNetworkBackend.new()
	NetworkService.backend = fake
	NetworkService.match_id = "match-starter-shared"
	await NetworkService.send_set_target("enemy.green_slime:0", "req-set-client-1", "hostile")
	assert_int(fake.last_send_opcode).is_equal(MatchProtocol.CLIENT_SET_TARGET)
	var body: Dictionary = JSON.parse_string(fake.last_send_payload)
	assert_str(String(body["targetId"])).is_equal("enemy.green_slime:0")
	assert_str(String(body["intent"])).is_equal("hostile")
	assert_bool(body.has("damage")).is_false()


func test_combat_message_event_is_parsed() -> void:
	var parsed: Dictionary = MatchProtocol.parse_combat_event(JSON.stringify({
		"protocolVersion": 1,
		"tick": 20,
		"events": [{
			"type": "message",
			"sourceId": "test.enemy.cave_boss:0",
			"sourceKind": "enemy",
			"targetId": "test.enemy.cave_boss:0",
			"targetKind": "enemy",
			"message": "The cave boss enrages.",
		}],
	}))
	assert_bool(bool(parsed["ok"])).is_true()
	var events: Array = parsed["events"]
	assert_str(String(events[0]["message"])).is_equal("The cave boss enrages.")


func test_release_respawn_sends_request_id_only() -> void:
	var fake := FakeNetworkBackend.new()
	NetworkService.backend = fake
	NetworkService.match_id = "match-starter-shared"
	await NetworkService.send_release_respawn("req-release-c1")
	assert_int(fake.last_send_opcode).is_equal(MatchProtocol.CLIENT_RELEASE_RESPAWN)
	var body: Dictionary = JSON.parse_string(fake.last_send_payload)
	assert_str(String(body["requestId"])).is_equal("req-release-c1")
	assert_bool(body.has("health")).is_false()
