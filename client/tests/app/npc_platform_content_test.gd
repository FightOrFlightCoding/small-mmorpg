extends GdUnitTestSuite

## NPC-07 content-only proof is present in the client catalog.


func before_test() -> void:
	SceneRouter.reset_for_tests()
	AppState.reset_for_tests()
	assert_bool(ContentRegistry.load_bundle()).is_true()


func test_platform_npcs_are_content_only() -> void:
	assert_bool(ContentRegistry.has_id("npc.platform_greeter")).is_true()
	assert_bool(ContentRegistry.has_id("npc.platform_guide")).is_true()
	assert_bool(ContentRegistry.has_id("npc.platform_quest")).is_true()
	assert_bool(ContentRegistry.has_id("npc.platform_merchant")).is_true()
	assert_bool(ContentRegistry.has_id("npc.platform_combined")).is_true()
	assert_bool(ContentRegistry.has_id("quest.platform_talk")).is_true()
	assert_bool(ContentRegistry.has_id("vendor.platform_kiosk")).is_true()
	var dialogue_map: Variant = JSON.parse_string(FileAccess.get_file_as_string("res://content/dialogue_map.json"))
	assert_bool(typeof(dialogue_map) == TYPE_DICTIONARY).is_true()
	var map := dialogue_map as Dictionary
	assert_bool(map.has("dialogue.npc.platform_combined")).is_true()
	assert_bool(FileAccess.file_exists(String(map["dialogue.npc.platform_combined"]))).is_true()
	var manifest := AssetManifest.new()
	assert_bool(manifest.load_manifest()).is_true()
	var greeter: Dictionary = manifest.resolve_set_for_content("npc.platform_greeter")
	assert_str(String(greeter.get("spriteVisualId", ""))).is_equal("visual.npc_herald")
