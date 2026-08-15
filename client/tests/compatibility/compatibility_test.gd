extends GdUnitTestSuite

## Proves the pinned Godot packages load under Godot 4.7.1.


func test_nakama_singleton_api_is_available() -> void:
	assert_object(Nakama).is_not_null()
	assert_bool(Nakama.has_method("create_client")).is_true()
	var client: NakamaClient = Nakama.create_client("defaultkey", "127.0.0.1", 7350, "http")
	assert_object(client).is_not_null()
	assert_str(client.host).is_equal("127.0.0.1")


func test_gloot_inventory_can_be_instantiated() -> void:
	var inventory: Inventory = auto_free(Inventory.new())
	assert_object(inventory).is_not_null()
	assert_int(inventory.get_item_count()).is_equal(0)


func test_dialogue_manager_exposes_expected_api() -> void:
	assert_object(DialogueManager).is_not_null()
	assert_bool(Engine.has_singleton("DialogueManager")).is_true()
	assert_bool(DialogueManager.has_method("get_next_dialogue_line")).is_true()
	assert_bool(DialogueManager.has_method("show_dialogue_balloon")).is_true()


func test_compatibility_scene_resource_loads() -> void:
	var scene: PackedScene = load("res://scenes/compatibility_check.tscn")
	assert_object(scene).is_not_null()
	var instance: Node = auto_free(scene.instantiate())
	assert_object(instance).is_not_null()
	assert_str(instance.name).is_equal("CompatibilityCheck")
