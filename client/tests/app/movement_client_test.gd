extends GdUnitTestSuite

## Client movement intentions, interpolation, and snapshot timeout UI.


func before_test() -> void:
	SceneRouter.reset_for_tests()
	AppState.reset_for_tests()
	NetworkService.reset_for_tests()
	assert_bool(ContentRegistry.load_bundle()).is_true()
	ContentRegistry.visuals.load_map()


func _alice_bob_state(alice_x: float = 240.0, bob_x: float = 260.0, tick: int = 3) -> Dictionary:
	return {
		"self_id": "user-alice",
		"zone_id": "zone.starter",
		"tick": tick,
		"ack_seq": 4,
		"players": [
			{"userId": "user-alice", "name": "Alice", "x": alice_x, "y": 384, "lastProcessedSeq": 4},
			{"userId": "user-bob", "name": "Bob", "x": bob_x, "y": 400, "lastProcessedSeq": 2},
		],
		"npcs": [{"id": "npc.elder", "npcId": "npc.elder", "x": 160, "y": 320}],
		"enemies": [{"id": "enemy.green_slime:0", "enemyId": "enemy.green_slime", "x": 960, "y": 400}],
		"loot": [],
	}


func test_input_payload_is_direction_and_sequence_only() -> void:
	var payload: Dictionary = MoveIntent.payload(42, Vector2(1, 0))
	assert_int(int(payload["protocolVersion"])).is_equal(1)
	assert_int(int(payload["seq"])).is_equal(42)
	assert_float(float(payload["axisX"])).is_equal(1.0)
	assert_float(float(payload["axisY"])).is_equal(0.0)
	assert_bool(payload.has("x")).is_false()
	assert_bool(payload.has("y")).is_false()
	assert_bool(payload.has("speed")).is_false()
	assert_bool(payload.has("dt")).is_false()
	assert_bool(payload.has("position")).is_false()


func test_diagonal_input_is_normalized() -> void:
	var axis := MoveIntent.normalize_axes(Vector2(1, 1))
	assert_float(axis.length()).is_equal_approx(1.0, 0.0001)
	assert_float(axis.x).is_equal_approx(axis.y, 0.0001)


func test_send_input_uses_input_opcode() -> void:
	var fake := FakeNetworkBackend.new()
	NetworkService.backend = fake
	NetworkService.match_id = "match-starter"
	await NetworkService.send_input(7, 1.0, 0.0)
	assert_int(fake.last_send_opcode).is_equal(MatchProtocol.CLIENT_INPUT)
	var parsed: Variant = JSON.parse_string(fake.last_send_payload)
	assert_that(typeof(parsed)).is_equal(TYPE_DICTIONARY)
	var body: Dictionary = parsed
	assert_int(int(body["seq"])).is_equal(7)
	assert_float(float(body["axisX"])).is_equal(1.0)
	assert_bool(body.has("x")).is_false()


func test_local_player_snaps_remote_interpolates() -> void:
	var registry: EntityRegistry = auto_free(EntityRegistry.new())
	add_child(registry)
	registry.apply_full_state(_alice_bob_state(240, 260, 3))
	var alice := registry.get_entity("player:user-alice") as WorldAvatar
	var bob := registry.get_entity("player:user-bob") as WorldAvatar
	assert_vector(alice.position).is_equal(Vector2(240, 384))
	assert_vector(bob.position).is_equal(Vector2(260, 400))
	registry.apply_snapshot(_alice_bob_state(300, 360, 4), 0.1)
	assert_vector(alice.position).is_equal(Vector2(300, 384))
	assert_bool(bob.interpolating).is_true()
	assert_vector(bob.position).is_equal(Vector2(260, 400))
	registry.advance_interpolation(0.05)
	assert_float(bob.position.x).is_greater(260.0)
	assert_float(bob.position.x).is_less(360.0)
	assert_vector(alice.position).is_equal(Vector2(300, 384))
	registry.advance_interpolation(0.05)
	assert_vector(bob.position).is_equal(Vector2(360, 400))
	assert_int(registry.entity_count()).is_equal(4)


func test_snapshot_timeout_is_visible() -> void:
	var hud: WorldHud = auto_free(preload("res://scenes/world/world_hud.tscn").instantiate())
	add_child(hud)
	await get_tree().process_frame
	hud.refresh(_alice_bob_state(), PackedStringArray(["Alice", "Bob"]), true)
	assert_str(hud.get_node("Root/Margin/VBox/Status").text).contains("No snapshot from the server")
	hud.refresh(_alice_bob_state(), PackedStringArray(["Alice", "Bob"]), false)
	assert_str(hud.get_node("Root/Margin/VBox/Status").text).contains("Ack seq")
