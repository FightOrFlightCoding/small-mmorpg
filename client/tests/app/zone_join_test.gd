extends GdUnitTestSuite

## Starter-zone join, FULL_STATE gating, compatibility errors, and resync.


func before_test() -> void:
	SceneRouter.reset_for_tests()
	AppState.reset_for_tests()
	NetworkService.reset_for_tests()
	GameService.last_identity = {}
	GameService.enter_world_after_bootstrap = false


func _fake() -> FakeNetworkBackend:
	var fake := FakeNetworkBackend.new()
	NetworkService.backend = fake
	return fake


func _created_payload() -> String:
	return JSON.stringify({
		"characterId": "char-1",
		"name": "Alice",
		"created": true,
		"storageVersion": "v1",
		"contentId": "player.base",
		"zoneId": "zone.starter",
		"baseStats": {
			"maxHealth": 100,
			"attack": 4,
			"moveSpeed": 120,
			"attackRange": 40,
			"attackCooldown": 0.7,
			"interactionRange": 48,
			"pickupRange": 40,
		},
		"position": {"x": 240, "y": 384},
	})


func _boot_and_character(fake: FakeNetworkBackend) -> void:
	fake.rpc_payload = _created_payload()
	assert_bool(GameService.start_boot()).is_true()
	await GameService.request_authenticate("vibecode-dev-alice")
	await GameService.request_character_bootstrap("Alice")


func test_world_waits_for_valid_full_state() -> void:
	var fake := _fake()
	await _boot_and_character(fake)
	assert_bool(SceneRouter.transition_to(SceneRouter.SCENE_WORLD)).is_false()
	assert_bool(await GameService.enter_starter_zone()).is_true()
	assert_str(fake.last_rpc_id).is_equal("find_or_create_starter_zone")
	assert_str(fake.last_join_match_id).is_equal("match-starter-shared")
	assert_bool(AppState.has_zone_state).is_true()
	assert_str(AppState.zone_view["self_id"]).is_equal("user-alice")
	assert_int((AppState.zone_view["npcs"] as Array).size()).is_equal(1)
	assert_int((AppState.zone_view["enemies"] as Array).size()).is_equal(1)
	assert_str(SceneRouter.current_scene_id).is_equal(SceneRouter.SCENE_WORLD)


func test_two_players_in_full_state_are_parsed() -> void:
	var fake := _fake()
	await _boot_and_character(fake)
	fake.full_state_payload = JSON.stringify({
		"protocolVersion": 1,
		"contentHash": ContentRegistry.get_content_hash(),
		"tick": 8,
		"zoneId": "zone.starter",
		"selfId": "user-alice",
		"players": [
			{"userId": "user-alice", "name": "Alice", "x": 240, "y": 384},
			{"userId": "user-bob", "name": "Bob", "x": 240, "y": 384},
		],
		"npcs": [{"npcId": "npc.elder"}],
		"enemies": [{"enemyId": "enemy.green_slime"}],
		"loot": [],
	})
	assert_bool(await GameService.enter_starter_zone()).is_true()
	assert_int((AppState.zone_view["players"] as Array).size()).is_equal(2)
	assert_int(int(AppState.zone_view["tick"])).is_equal(8)


func test_mismatched_content_hash_is_fatal() -> void:
	var fake := _fake()
	await _boot_and_character(fake)
	fake.find_zone_payload = JSON.stringify({
		"matchId": "match-bad",
		"zoneId": "zone.starter",
		"protocolVersion": 1,
		"contentHash": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
	})
	assert_bool(await GameService.enter_starter_zone()).is_false()
	assert_bool(AppState.has_fatal_error).is_true()
	assert_str(AppState.last_error_code).is_equal("content_mismatch")
	assert_bool(AppState.has_zone_state).is_false()
	assert_str(SceneRouter.current_scene_id).is_not_equal(SceneRouter.SCENE_WORLD)


func test_mismatched_protocol_version_is_fatal() -> void:
	var fake := _fake()
	await _boot_and_character(fake)
	fake.find_zone_payload = JSON.stringify({
		"matchId": "match-bad",
		"zoneId": "zone.starter",
		"protocolVersion": 9,
		"contentHash": ContentRegistry.get_content_hash(),
	})
	assert_bool(await GameService.enter_starter_zone()).is_false()
	assert_bool(AppState.has_fatal_error).is_true()
	assert_str(AppState.last_error_code).is_equal("protocol_mismatch")
	assert_str(SceneRouter.current_scene_id).is_not_equal(SceneRouter.SCENE_WORLD)


func test_join_rejection_for_content_mismatch_is_fatal() -> void:
	var fake := _fake()
	await _boot_and_character(fake)
	fake.join_ok = false
	fake.join_code = "content_mismatch"
	fake.join_message = "The client content catalog does not match the server."
	assert_bool(await GameService.enter_starter_zone()).is_false()
	assert_bool(AppState.has_fatal_error).is_true()
	assert_str(AppState.last_error_code).is_equal("content_mismatch")


func test_duplicate_account_join_is_recoverable() -> void:
	var fake := _fake()
	await _boot_and_character(fake)
	fake.join_ok = false
	fake.join_code = "already_in_match"
	fake.join_message = "This account is already in the starter zone. Sign in as Alice in one window and Bob in the other."
	assert_bool(await GameService.enter_starter_zone()).is_false()
	assert_bool(AppState.has_fatal_error).is_false()
	assert_str(AppState.last_error_code).is_equal("already_in_match")
	assert_str(SceneRouter.current_scene_id).is_not_equal(SceneRouter.SCENE_WORLD)


func test_resync_requests_a_fresh_full_state() -> void:
	var fake := _fake()
	await _boot_and_character(fake)
	assert_bool(await GameService.enter_starter_zone()).is_true()
	fake.resync_full_state_payload = JSON.stringify({
		"protocolVersion": 1,
		"contentHash": ContentRegistry.get_content_hash(),
		"tick": 42,
		"zoneId": "zone.starter",
		"selfId": "user-alice",
		"players": [{"userId": "user-alice", "name": "Alice"}],
		"npcs": [{"npcId": "npc.elder"}],
		"enemies": [{"enemyId": "enemy.green_slime"}],
		"loot": [],
	})
	assert_bool(await GameService.request_resync()).is_true()
	assert_int(fake.last_send_opcode).is_equal(MatchProtocol.CLIENT_RESYNC_REQUEST)
	assert_str(fake.last_send_payload).contains("protocolVersion")
	assert_int(int(AppState.zone_view["tick"])).is_equal(42)
