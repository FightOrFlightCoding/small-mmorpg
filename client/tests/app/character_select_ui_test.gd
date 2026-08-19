extends GdUnitTestSuite

## Five-slot Character Select, three class cards, Recently Deleted.


func before_test() -> void:
	SceneRouter.reset_for_tests()
	AppState.reset_for_tests()
	NetworkService.reset_for_tests()
	WindowManager.reset_for_tests()
	GameService.last_identity = {}
	GameService.enter_world_after_bootstrap = false
	assert_bool(ContentRegistry.load_bundle()).is_true()
	ContentRegistry.visuals.load_map()
	ContentRegistry.assets.load_manifest()


func after_test() -> void:
	WindowManager.reset_for_tests()


func test_five_slots_and_three_production_class_cards() -> void:
	var fake := FakeNetworkBackend.new()
	NetworkService.backend = fake
	AppState.is_authenticated = true
	var scene: Node = load("res://scenes/character/character.tscn").instantiate()
	add_child(scene)
	await await_idle_frame()
	await await_idle_frame()
	var class_row: Node = scene.get_node("Root/VBox/CreatePanel/ClassRow")
	assert_int(class_row.get_child_count()).is_equal(3)
	var names := PackedStringArray()
	for child in class_row.get_children():
		if child is Button:
			names.append(String((child as Button).get_meta("class_id", "")))
	assert_bool(names.has("class.warrior")).is_true()
	assert_bool(names.has("class.marksman")).is_true()
	assert_bool(names.has("class.mage")).is_true()
	var slot_row: Node = scene.get_node("Root/VBox/SelectPanel/SlotRow")
	assert_int(slot_row.get_child_count()).is_equal(5)
	assert_str(String(scene.get_node("Root/VBox/SelectPanel/NavRow/CreateButton").text)).is_equal("Create Character")
	assert_str(String(scene.get_node("Root/VBox/SelectPanel/NavRow/DeletedButton").text)).is_equal("Recently Deleted")
	assert_str(String(scene.get_node("Root/VBox/SelectPanel/NavRow/SettingsButton").text)).is_equal("Account Settings")
	scene.queue_free()


func test_link_dead_countdown_disables_every_play_button() -> void:
	var fake := FakeNetworkBackend.new()
	NetworkService.backend = fake
	AppState.is_authenticated = true
	var now_ms := int(Time.get_unix_time_from_system() * 1000.0)
	var scene: Node = load("res://scenes/character/character.tscn").instantiate()
	add_child(scene)
	await await_idle_frame()
	await await_idle_frame()
	AppState.notify_character_list([
		{
			"characterId": "char-live",
			"displayName": "Scout",
			"name": "Scout",
			"classId": "class.warrior",
			"level": 1,
			"status": "ACTIVE",
			"playBlockedReason": "link_dead",
			"playAvailableAt": now_ms + 8000,
			"activePresenceState": "LINK_DEAD",
		},
		{
			"characterId": "char-other",
			"displayName": "Ranger",
			"name": "Ranger",
			"classId": "class.marksman",
			"level": 1,
			"status": "ACTIVE",
			"playBlockedReason": "account_busy",
			"playAvailableAt": now_ms + 8000,
			"activePresenceState": "OFFLINE",
		},
	], 5, 2, now_ms)
	NetworkService.character_list_finished.emit(true, "")
	await await_idle_frame()
	await await_idle_frame()
	var slot_row: Node = scene.get_node("Root/VBox/SelectPanel/SlotRow")
	var play_buttons: Array[Button] = []
	var saw_still_in_world := false
	var saw_waiting := false
	for card in slot_row.get_children():
		for box in card.get_children():
			for child in box.get_children():
				if child is Label:
					var text := String((child as Label).text)
					if text.contains("Character still in world") and text.contains("Available in"):
						saw_still_in_world = true
					if text.contains("Waiting for previous character to leave"):
						saw_waiting = true
				if child is Button and String((child as Button).text) == "Play":
					play_buttons.append(child as Button)
	assert_bool(saw_still_in_world).is_true()
	assert_bool(saw_waiting).is_true()
	assert_int(play_buttons.size()).is_greater_equal(2)
	for play in play_buttons:
		assert_bool(play.disabled).is_true()
	scene.queue_free()
