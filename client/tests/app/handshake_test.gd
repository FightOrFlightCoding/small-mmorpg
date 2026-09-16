extends GdUnitTestSuite

## Session handshake after login; incompatible clients never authenticate into gameplay.


func before_test() -> void:
	SceneRouter.reset_for_tests()
	AppState.reset_for_tests()
	NetworkService.reset_for_tests()
	NotificationService.reset_for_tests()
	GameService.last_identity = {}
	GameService.enter_world_after_bootstrap = false


func _fake() -> FakeNetworkBackend:
	var fake := FakeNetworkBackend.new()
	NetworkService.backend = fake
	return fake


func test_successful_handshake_keeps_authentication() -> void:
	var fake := _fake()
	assert_bool(GameService.start_boot()).is_true()
	await GameService.request_authenticate("vibecode-dev-alice")
	assert_bool(AppState.is_authenticated).is_true()
	assert_str(fake.last_rpc_id).is_equal(MatchProtocol.SESSION_HANDSHAKE_RPC)
	assert_str(fake.last_rpc_payload).contains("clientVersion")
	assert_str(fake.last_rpc_payload).contains(MatchProtocol.CLIENT_VERSION)
	assert_bool(AppState.has_fatal_error).is_false()


func test_old_client_handshake_is_fatal() -> void:
	var fake := _fake()
	fake.handshake_ok = false
	fake.handshake_code = "client_too_old"
	fake.handshake_message = "client_too_old"
	assert_bool(GameService.start_boot()).is_true()
	await GameService.request_authenticate("vibecode-dev-alice")
	assert_bool(AppState.is_authenticated).is_false()
	assert_bool(AppState.has_fatal_error).is_true()
	assert_str(AppState.last_error_code).is_equal("client_too_old")
	assert_bool(SceneRouter.transition_to(SceneRouter.SCENE_WORLD)).is_false()
	assert_bool(SceneRouter.transition_to(SceneRouter.SCENE_CHARACTER)).is_false()


func test_content_mismatch_handshake_is_fatal() -> void:
	var fake := _fake()
	fake.handshake_ok = false
	fake.handshake_code = "content_mismatch"
	fake.handshake_message = "content_mismatch"
	assert_bool(GameService.start_boot()).is_true()
	await GameService.request_authenticate("vibecode-dev-alice")
	assert_bool(AppState.is_authenticated).is_false()
	assert_str(AppState.last_error_code).is_equal("content_mismatch")
	assert_bool(SceneRouter.transition_to(SceneRouter.SCENE_WORLD)).is_false()


func test_maintenance_handshake_still_allows_admin_login() -> void:
	var fake := _fake()
	fake.handshake_maintenance = true
	assert_bool(GameService.start_boot()).is_true()
	await GameService.request_authenticate("vibecode-dev-alice")
	assert_bool(AppState.is_authenticated).is_true()
	assert_bool(AppState.has_fatal_error).is_false()
	assert_str(AppState.last_error_code).is_equal("server_maintenance")
	assert_str(SceneRouter.current_scene_id).is_equal(SceneRouter.SCENE_CHARACTER)
	assert_bool(SceneRouter.transition_to(SceneRouter.SCENE_WORLD)).is_false()


func test_join_rejects_maintenance_without_entering_world() -> void:
	var fake := _fake()
	fake.rpc_payload = JSON.stringify({
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
	fake.find_zone_ok = false
	fake.find_zone_code = "server_maintenance"
	fake.find_zone_message = "server_maintenance"
	fake.join_ok = false
	fake.join_code = "server_maintenance"
	fake.join_message = "server_maintenance"
	assert_bool(GameService.start_boot()).is_true()
	await GameService.request_authenticate("vibecode-dev-alice")
	await GameService.request_character_bootstrap("Alice")
	assert_bool(await GameService.enter_starter_zone()).is_false()
	assert_str(AppState.last_error_code).is_equal("server_maintenance")
	assert_bool(AppState.has_fatal_error).is_false()
	assert_str(SceneRouter.current_scene_id).is_not_equal(SceneRouter.SCENE_WORLD)
