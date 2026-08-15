extends GdUnitTestSuite

## Starter-zone room chat: plain-text history, one subscription, server-backed send.


func before_test() -> void:
	SceneRouter.reset_for_tests()
	AppState.reset_for_tests()
	NetworkService.reset_for_tests()
	GameService.last_identity = {}
	GameService.enter_world_after_bootstrap = false
	assert_bool(ContentRegistry.load_bundle()).is_true()


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


func test_payload_is_message_only() -> void:
	var body: Dictionary = ZoneChat.payload("  hello  ")
	assert_str(String(body["message"])).is_equal("hello")
	assert_int(body.size()).is_equal(1)
	assert_str(ZoneChat.reject_reason("")).is_equal("empty_message")
	assert_str(ZoneChat.reject_reason("   ")).is_equal("empty_message")
	assert_str(ZoneChat.reject_reason("a".repeat(201))).is_equal("message_too_long")
	assert_str(ZoneChat.reject_reason("ok")).is_equal("")


func test_user_markup_is_plain_text() -> void:
	var panel: ChatPanel = auto_free(preload("res://scenes/world/chat_panel.tscn").instantiate())
	add_child(panel)
	await get_tree().process_frame
	var history: Label = panel.get_node("Root/Panel/Margin/VBox/Scroll/History")
	assert_object(history).is_not_null()
	assert_str(history.get_class()).is_equal("Label")
	assert_str(history.get_class()).is_not_equal("RichTextLabel")
	panel.append_chat("Bob", "[color=red]hack[/color]", "2026-08-15T20:15:00Z")
	assert_str(panel.history_text()).contains("[20:15] Bob: [color=red]hack[/color]")
	assert_str(panel.history_text()).contains("[color=red]hack[/color]")


func test_history_is_capped_and_shows_sender_and_time() -> void:
	var panel: ChatPanel = auto_free(preload("res://scenes/world/chat_panel.tscn").instantiate())
	add_child(panel)
	await get_tree().process_frame
	for i in range(ZoneChat.MAX_HISTORY + 5):
		panel.append_chat("Alice", "<%s>" % str(i), "2026-08-15T12:00:00Z")
	assert_int(panel.history_line_count()).is_equal(ZoneChat.MAX_HISTORY)
	assert_str(panel.history_text()).contains("[12:00] Alice: <5>")
	assert_str(panel.history_text()).contains("<54>")
	assert_str(panel.history_text()).not_contains("<4>")


func test_empty_send_is_visible_and_not_transmitted() -> void:
	var panel: ChatPanel = auto_free(preload("res://scenes/world/chat_panel.tscn").instantiate())
	add_child(panel)
	await get_tree().process_frame
	var sent: PackedStringArray = PackedStringArray()
	panel.send_requested.connect(func(text: String) -> void: sent.append(text))
	panel.get_node("Root/Panel/Margin/VBox/Row/Input").text = "   "
	panel.get_node("Root/Panel/Margin/VBox/Row/SendButton").pressed.emit()
	assert_int(sent.size()).is_equal(0)
	assert_str(panel.status_text()).contains("empty")


func test_alice_message_reaches_bob_and_rejoin_does_not_duplicate_callbacks() -> void:
	var fake := _fake()
	await _boot_and_character(fake)
	assert_bool(await GameService.enter_starter_zone()).is_true()
	var received: Array = []
	NetworkService.chat_message_received.connect(func(payload: Dictionary) -> void: received.append(payload))
	assert_bool(await NetworkService.join_zone_chat()).is_true()
	assert_int(fake.join_chat_calls).is_equal(2)
	var sent: Dictionary = await NetworkService.send_zone_chat("Hello from Alice")
	assert_bool(bool(sent.get("ok", false))).is_true()
	assert_str(String(fake.last_chat_content.get("message", ""))).is_equal("Hello from Alice")
	assert_int(received.size()).is_equal(1)
	assert_str(ZoneChat.parse_content(String(received[0]["content"]))).is_equal("Hello from Alice")
	fake.channel_message_received.emit({
		"channel_id": fake.chat_channel_id,
		"message_id": "msg-bob",
		"sender_id": "user-bob",
		"username": "bob",
		"content": JSON.stringify({"message": "Hi Alice"}),
		"create_time": "2026-08-15T20:01:00Z",
		"room_name": ZoneChat.ROOM_NAME,
	})
	assert_int(received.size()).is_equal(2)
	assert_str(ZoneChat.parse_content(String(received[1]["content"]))).is_equal("Hi Alice")


func test_oversized_send_is_rejected_before_and_by_the_backend() -> void:
	var fake := _fake()
	await _boot_and_character(fake)
	assert_bool(await GameService.enter_starter_zone()).is_true()
	var too_long := "x".repeat(ZoneChat.MAX_CHARS + 1)
	var sent: Dictionary = await NetworkService.send_zone_chat(too_long)
	assert_bool(bool(sent.get("ok", false))).is_false()
	assert_str(String(sent.get("code", ""))).is_equal("message_too_long")
	assert_int(fake.send_chat_calls).is_equal(0)
	var backend: Dictionary = await fake.send_chat_message(fake.chat_channel_id, {"message": too_long})
	assert_str(String(backend.get("code", ""))).is_equal("message_too_long")


func test_chat_panel_input_and_send_exist() -> void:
	var panel: ChatPanel = auto_free(preload("res://scenes/world/chat_panel.tscn").instantiate())
	add_child(panel)
	await get_tree().process_frame
	var input: LineEdit = panel.get_node("Root/Panel/Margin/VBox/Row/Input")
	assert_int(input.max_length).is_equal(ZoneChat.MAX_CHARS)
	input.grab_focus()
	assert_bool(panel.has_input_focus()).is_true()
	panel.release_chat_focus()
	assert_bool(panel.has_input_focus()).is_false()
