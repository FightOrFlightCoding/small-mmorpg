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
