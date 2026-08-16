extends GdUnitTestSuite

## Session refresh, socket reconnect, full-state resync, and duplicate callback guards.


func before_test() -> void:
	SceneRouter.reset_for_tests()
	AppState.reset_for_tests()
	NetworkService.reset_for_tests()
	GameService.last_identity = {}
	GameService.enter_world_after_bootstrap = false
	NetworkService.reconnect_policy.initial_delay_sec = 0.0
	NetworkService.reconnect_policy.max_delay_sec = 0.0
	NetworkService.reconnect_policy.max_attempts = 3


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
		"position": {"x": 640, "y": 400},
	})


func _boot_character_and_zone(fake: FakeNetworkBackend) -> void:
	fake.rpc_payload = _created_payload()
	assert_bool(GameService.start_boot()).is_true()
	await GameService.request_authenticate("vibecode-dev-alice")
	await GameService.request_character_bootstrap("Alice")
	assert_bool(await GameService.enter_starter_zone()).is_true()


func test_reconnect_policy_is_bounded_exponential() -> void:
	var policy := ReconnectPolicy.new()
	assert_float(policy.delay_for_attempt(0)).is_equal(0.5)
	assert_float(policy.delay_for_attempt(1)).is_equal(1.0)
	assert_float(policy.delay_for_attempt(2)).is_equal(2.0)
	assert_float(policy.delay_for_attempt(4)).is_equal(8.0)
	assert_float(policy.delay_for_attempt(10)).is_equal(8.0)
	assert_bool(policy.can_retry(7)).is_true()
	assert_bool(policy.can_retry(8)).is_false()


func test_session_refresh_then_reauth_after_expired_session() -> void:
	var fake := _fake()
	fake.rpc_payload = _created_payload()
	assert_bool(GameService.start_boot()).is_true()
	await GameService.request_authenticate("vibecode-dev-alice")
	fake.session_expired = true
	fake.refresh_ok = true
	assert_bool(await NetworkService.ensure_session()).is_true()
	assert_int(fake.refresh_calls).is_equal(1)
	assert_int(fake.authenticate_calls).is_equal(1)
	fake.session_expired = true
	fake.refresh_ok = false
	assert_bool(await NetworkService.ensure_session()).is_true()
	assert_int(fake.authenticate_calls).is_equal(2)
	assert_bool(AppState.is_authenticated).is_true()


func test_socket_reconnect_rejoins_and_resyncs_full_state() -> void:
	var fake := _fake()
	await _boot_character_and_zone(fake)
	var join_before := fake.join_calls
	var socket_before := fake.socket_calls
	fake.full_state_payload = JSON.stringify({
		"protocolVersion": 1,
		"contentHash": ContentRegistry.get_content_hash(),
		"tick": 77,
		"zoneId": "zone.starter",
		"selfId": "user-alice",
		"players": [{"userId": "user-alice", "name": "Alice", "x": 640, "y": 400}],
		"npcs": [{"npcId": "npc.elder"}],
		"enemies": [{"enemyId": "enemy.green_slime"}],
		"loot": [],
		"quests": [],
		"inventory": {"capacity": 20, "items": []},
		"wallet": {"gold": 25},
	})
	fake.emit_socket_closed()
	for _i in range(30):
		if not AppState.is_reconnecting and int(AppState.zone_view.get("tick", 0)) == 77:
			break
		await get_tree().process_frame
	assert_bool(AppState.is_reconnecting).is_false()
	assert_int(fake.socket_calls).is_greater(socket_before)
	assert_int(fake.join_calls).is_greater(join_before)
	assert_int(int(AppState.zone_view.get("tick", 0))).is_equal(77)
	assert_bool(NetworkService.socket_connected).is_true()
	assert_str(NetworkService.match_id).is_not_empty()


func test_reauthentication_during_reconnect_after_expired_session() -> void:
	var fake := _fake()
	await _boot_character_and_zone(fake)
	fake.session_expired = true
	fake.refresh_ok = false
	fake.full_state_payload = JSON.stringify({
		"protocolVersion": 1,
		"contentHash": ContentRegistry.get_content_hash(),
		"tick": 12,
		"zoneId": "zone.starter",
		"selfId": "user-alice",
		"players": [{"userId": "user-alice", "name": "Alice"}],
		"npcs": [{"npcId": "npc.elder"}],
		"enemies": [{"enemyId": "enemy.green_slime"}],
		"loot": [],
	})
	var auth_before := fake.authenticate_calls
	await NetworkService.start_reconnect()
	assert_int(fake.authenticate_calls).is_greater(auth_before)
	assert_bool(AppState.is_authenticated).is_true()
	assert_bool(AppState.has_zone_state).is_true()


func test_cancel_reconnect_logs_out() -> void:
	var fake := _fake()
	await _boot_character_and_zone(fake)
	await GameService.cancel_reconnect()
	assert_int(fake.logout_calls).is_equal(1)
	assert_bool(AppState.is_authenticated).is_false()
	assert_str(SceneRouter.current_scene_id).is_equal(SceneRouter.SCENE_LOGIN)


func test_duplicate_socket_callbacks_are_not_connected_twice() -> void:
	var fake := _fake()
	await _boot_character_and_zone(fake)
	var received: Array = []
	AppState.zone_state_updated.connect(func() -> void: received.append(AppState.zone_view.get("tick", 0)))
	NetworkService._connect_match_signals()
	NetworkService._connect_match_signals()
	NetworkService._connect_socket_signals()
	NetworkService._connect_socket_signals()
	fake.match_state_received.emit(MatchProtocol.SERVER_FULL_STATE, fake.default_full_state_payload(5))
	assert_int(received.size()).is_equal(1)
	assert_int(int(received[0])).is_equal(5)


func test_full_state_resync_replaces_view() -> void:
	var fake := _fake()
	await _boot_character_and_zone(fake)
	fake.resync_full_state_payload = JSON.stringify({
		"protocolVersion": 1,
		"contentHash": ContentRegistry.get_content_hash(),
		"tick": 88,
		"zoneId": "zone.starter",
		"selfId": "user-alice",
		"players": [{"userId": "user-alice", "name": "Alice", "x": 500, "y": 390}],
		"npcs": [{"npcId": "npc.elder"}],
		"enemies": [{"enemyId": "enemy.green_slime"}],
		"loot": [],
	})
	assert_bool(await GameService.request_resync()).is_true()
	assert_int(int(AppState.zone_view["tick"])).is_equal(88)


func test_reconnecting_hud_and_overlay_cancel() -> void:
	var hud: WorldHud = auto_free(preload("res://scenes/world/world_hud.tscn").instantiate())
	add_child(hud)
	await get_tree().process_frame
	AppState.notify_reconnecting(true)
	hud.refresh({"zone_id": "zone.starter", "tick": 1, "self_id": "user-alice", "players": []}, PackedStringArray(["Alice"]))
	assert_str(hud.get_node("Root/Margin/VBox/Status").text).contains("Reconnecting")
	var overlay: CanvasLayer = auto_free(preload("res://scenes/shared/loading_overlay.tscn").instantiate())
	add_child(overlay)
	await get_tree().process_frame
	overlay.call("show_loading", "reconnect")
	assert_bool(overlay.visible).is_true()
	assert_str(overlay.get_node("Panel/VBox/Message").text).contains("Reconnecting")
	assert_bool(overlay.get_node("Panel/VBox/CancelButton").visible).is_true()
	var cancelled := [false]
	assert_bool(overlay.has_signal("cancel_pressed")).is_true()
	overlay.connect("cancel_pressed", func() -> void: cancelled[0] = true)
	(overlay.get_node("Panel/VBox/CancelButton") as Button).pressed.emit()
	assert_bool(cancelled[0]).is_true()


func test_socket_closed_before_zone_does_not_start_reconnect() -> void:
	var fake := _fake()
	fake.rpc_payload = _created_payload()
	assert_bool(GameService.start_boot()).is_true()
	await GameService.request_authenticate("vibecode-dev-alice")
	await GameService.request_character_bootstrap("Alice")
	fake.emit_socket_closed()
	await get_tree().process_frame
	await get_tree().process_frame
	assert_bool(AppState.is_reconnecting).is_false()
	assert_bool(AppState.has_zone_state).is_false()


func test_stale_socket_closed_while_connected_is_ignored() -> void:
	var fake := _fake()
	await _boot_character_and_zone(fake)
	var join_before := fake.join_calls
	fake.emit_socket_closed(true)
	await get_tree().process_frame
	await get_tree().process_frame
	assert_bool(AppState.is_reconnecting).is_false()
	assert_int(fake.join_calls).is_equal(join_before)
	assert_bool(NetworkService.socket_connected).is_true()


func test_already_in_match_on_rejoin_resyncs() -> void:
	var fake := _fake()
	await _boot_character_and_zone(fake)
	fake.join_ok = false
	fake.join_code = "already_in_match"
	fake.join_message = "This account is already in the starter zone."
	fake.resync_full_state_payload = JSON.stringify({
		"protocolVersion": 1,
		"contentHash": ContentRegistry.get_content_hash(),
		"tick": 91,
		"zoneId": "zone.starter",
		"selfId": "user-alice",
		"players": [{"userId": "user-alice", "name": "Alice", "x": 512, "y": 400}],
		"npcs": [{"npcId": "npc.elder"}],
		"enemies": [{"enemyId": "enemy.green_slime"}],
		"loot": [],
	})
	assert_bool(await NetworkService.rejoin_starter_zone()).is_true()
	assert_int(int(AppState.zone_view.get("tick", 0))).is_equal(91)


func test_nested_loading_complete_keeps_reconnect_overlay() -> void:
	var page: Control = auto_free(preload("res://scenes/character/character.tscn").instantiate())
	add_child(page)
	await get_tree().process_frame
	AppState.notify_reconnecting(true)
	var overlay: CanvasLayer = page.get_node("LoadingOverlay")
	assert_bool(overlay.visible).is_true()
	assert_str(overlay.get_node("Panel/VBox/Message").text).contains("Reconnecting")
	AppState.notify_loading_started("session")
	AppState.notify_loading_completed("session")
	AppState.notify_loading_completed("zone")
	assert_bool(overlay.visible).is_true()
	assert_str(overlay.get_node("Panel/VBox/Message").text).contains("Reconnecting")
	AppState.notify_reconnecting(false)
	AppState.notify_loading_completed("reconnect")
	assert_bool(overlay.visible).is_false()
