extends GdUnitTestSuite

## Windowing, settings, drag/drop, reconnect restore, and asset contracts.


var _opened_count: int = 0


func before_test() -> void:
	SceneRouter.reset_for_tests()
	AppState.reset_for_tests()
	NetworkService.reset_for_tests()
	WindowManager.reset_for_tests()
	HudController.reset_for_tests()
	DragDropService.reset_for_tests()
	TooltipService.reset_for_tests()
	NotificationService.reset_for_tests()
	UiStateService.reset_for_tests()
	InputSettingsService.reset_for_tests()
	AudioSettingsService.reset_for_tests()
	_opened_count = 0
	assert_bool(ContentRegistry.load_bundle()).is_true()
	ContentRegistry.visuals.load_map()
	ContentRegistry.assets.load_manifest()


func after_test() -> void:
	InputSettingsService.settings_path = LocalSettingsStore.DEFAULT_PATH
	InputSettingsService.restore_defaults(false)
	AudioSettingsService.settings_path = LocalSettingsStore.DEFAULT_PATH
	WindowManager.reset_for_tests()
	HudController.reset_for_tests()
	DragDropService.reset_for_tests()
	if WindowManager.window_opened.is_connected(_count_opened):
		WindowManager.window_opened.disconnect(_count_opened)


func _count_opened(_window_id: String) -> void:
	_opened_count += 1


func test_window_focus_and_exclusivity() -> void:
	WindowManager.open(WindowManager.INVENTORY)
	assert_str(WindowManager.focused_id).is_equal(WindowManager.INVENTORY)
	assert_bool(WindowManager.is_open(WindowManager.INVENTORY)).is_true()
	WindowManager.open(WindowManager.SETTINGS)
	assert_str(WindowManager.focused_id).is_equal(WindowManager.SETTINGS)
	WindowManager.open(WindowManager.VENDOR)
	assert_bool(WindowManager.is_open(WindowManager.SETTINGS)).is_false()
	assert_str(WindowManager.focused_id).is_equal(WindowManager.VENDOR)
	assert_bool(WindowManager.close_top()).is_true()
	assert_bool(WindowManager.is_open(WindowManager.VENDOR)).is_false()


func test_connect_once_prevents_duplicate_subscriptions() -> void:
	WindowManager.connect_once(WindowManager.window_opened, _count_opened)
	WindowManager.connect_once(WindowManager.window_opened, _count_opened)
	WindowManager.open(WindowManager.QUEST_JOURNAL)
	assert_int(_opened_count).is_equal(1)


func test_rejected_drag_drop_does_not_mutate() -> void:
	DragDropService.begin({"gold": 12, "instanceId": "i1"})
	assert_bool(DragDropService.active).is_false()
	assert_str(DragDropService.last_reject_code).is_equal("stat_injection")
	DragDropService.begin({"instanceId": "i1"})
	assert_bool(DragDropService.active).is_true()
	InventoryService._revert_unsupported_mutation()
	assert_bool(DragDropService.active).is_false()
	assert_str(DragDropService.last_reject_code).is_equal("client_cannot_mutate")
	DragDropService.begin({"instanceId": "i2"})
	DragDropService.reject("server_rejected")
	assert_bool(DragDropService.active).is_false()
	assert_str(DragDropService.last_reject_code).is_equal("server_rejected")


func test_reconnect_restores_open_windows() -> void:
	WindowManager.open(WindowManager.INVENTORY)
	WindowManager.open(WindowManager.PARTY)
	AppState.notify_reconnecting(true)
	assert_bool(WindowManager.is_open(WindowManager.RECONNECT)).is_true()
	assert_bool(WindowManager.is_open(WindowManager.LOADING)).is_true()
	AppState.notify_reconnecting(false)
	assert_bool(WindowManager.is_open(WindowManager.RECONNECT)).is_false()
	assert_bool(WindowManager.is_open(WindowManager.INVENTORY)).is_true()
	assert_bool(WindowManager.is_open(WindowManager.PARTY)).is_true()
	assert_str(NotificationService.last_message).is_equal("Reconnected.")


func test_settings_persist_without_credentials() -> void:
	AudioSettingsService.set_master_volume(0.4)
	AudioSettingsService.set_muted(true)
	UiStateService.set_ui_scale(1.25)
	AudioSettingsService.master_volume = 1.0
	AudioSettingsService.muted = false
	UiStateService.ui_scale = 1.0
	AudioSettingsService.load_from_disk()
	assert_float(AudioSettingsService.master_volume).is_equal(0.4)
	assert_bool(AudioSettingsService.muted).is_true()
	assert_float(UiStateService.ui_scale).is_equal(1.25)
	var event := InputEventKey.new()
	event.physical_keycode = KEY_K
	assert_str(InputSettingsService.rebind("inventory", event)).is_equal("")
	InputSettingsService.restore_defaults(false)
	InputMap.action_erase_events("inventory")
	InputSettingsService.load_from_disk()
	var stored := InputMap.action_get_events("inventory")
	assert_int(stored.size()).is_greater_equal(1)
	assert_int((stored[0] as InputEventKey).physical_keycode).is_equal(KEY_K)
	assert_bool(LocalSettingsStore.save_settings({"password": "secret"}, "user://client_settings_forbidden_test.json")).is_false()
	assert_bool(FileAccess.file_exists("user://client_settings_forbidden_test.json")).is_false()


func test_input_conflicts_are_rejected() -> void:
	var event := InputEventKey.new()
	event.physical_keycode = KEY_D
	assert_str(InputSettingsService.rebind("move_left", event)).is_equal("input_conflict")
	assert_str(InputSettingsService.last_conflict).is_equal("move_right")
	var rebound := InputEventKey.new()
	rebound.physical_keycode = KEY_M
	assert_str(InputSettingsService.rebind("move_left", rebound)).is_equal("")
	InputSettingsService.restore_defaults(false)


func test_missing_asset_uses_visible_fallback() -> void:
	var missing: Dictionary = ContentRegistry.resolve_visual("visual.unknown_pack")
	assert_bool(bool(missing["missing"])).is_true()
	assert_str(String(missing["missing_id"])).is_equal("visual.unknown_pack")
	var vis_set: Dictionary = ContentRegistry.resolve_visual_set("visual_set.missing_pack")
	assert_bool(bool(vis_set["missing"])).is_true()
	assert_bool(ContentRegistry.assets.missing_ids.has("visual_set.missing_pack")).is_true()
	assert_str(ContentRegistry.assets.last_warning).contains("visual_set.missing_pack")
	var registry: EntityRegistry = auto_free(EntityRegistry.new())
	add_child(registry)
	registry.apply_full_state({
		"self_id": "user-alice",
		"players": [{"userId": "user-alice", "name": "Alice", "x": 0, "y": 0}],
		"npcs": [{"id": "npc.missing", "npcId": "npc.does_not_exist", "x": 8, "y": 8}],
		"enemies": [],
		"loot": [],
	})
	var npc := registry.get_entity("npc:npc.missing") as WorldAvatar
	assert_object(npc).is_not_null()
	assert_bool(npc.used_fallback).is_true()
	assert_str(npc.get_node("FallbackLabel").text).contains("npc.does_not_exist")


func test_animation_sets_validate_direction_counts() -> void:
	var errors := ContentRegistry.assets.validate_all()
	assert_int(errors.size()).is_equal(0)
	var four: Dictionary = ContentRegistry.resolve_visual_set("visual_set.enemy.green_slime")
	assert_int(int(four["directionCount"])).is_equal(4)
	var eight: Dictionary = ContentRegistry.resolve_visual_set("visual_set.test.enemy.ranged")
	assert_int(int(eight["directionCount"])).is_equal(8)
	assert_int(VisualSetMath.normalize_direction_count(8)).is_equal(8)
	assert_int(VisualSetMath.normalize_direction_count(4)).is_equal(4)
	assert_int(VisualSetMath.direction_index(Vector2.RIGHT, 4)).is_equal(0)
	assert_int(VisualSetMath.direction_index(Vector2.RIGHT, 8)).is_equal(0)
	var invalid := VisualSetMath.validate_set({
		"id": "visual_set.bad",
		"directionCount": 3,
		"spriteVisualId": "",
		"animations": {},
	})
	assert_int(invalid.size()).is_greater_equal(3)
	var walk: Dictionary = (eight["animations"] as Dictionary)["walk"]
	assert_int(VisualSetMath.frame_index(walk, 0.0)).is_equal(0)
	assert_int(VisualSetMath.frame_index({"frames": [0, 3], "fps": 1, "loop": false}, 10.0)).is_equal(3)


func test_ui_state_clears_after_character_switch() -> void:
	WindowManager.open(WindowManager.TRADE)
	WindowManager.open(WindowManager.VENDOR)
	WindowManager.open(WindowManager.SETTINGS)
	UiStateService.last_character_id = "char-a"
	UiStateService.handle_character_switch("char-b")
	assert_bool(WindowManager.is_open(WindowManager.TRADE)).is_false()
	assert_bool(WindowManager.is_open(WindowManager.VENDOR)).is_false()
	assert_bool(WindowManager.is_open(WindowManager.SETTINGS)).is_false()
	assert_str(UiStateService.last_character_id).is_equal("char-b")


func test_ui_state_clears_after_zone_transfer() -> void:
	WindowManager.open(WindowManager.VENDOR)
	WindowManager.open(WindowManager.INN)
	WindowManager.open(WindowManager.DIALOGUE)
	UiStateService.last_zone_id = "zone.starter"
	UiStateService.handle_zone_transfer("zone.cave")
	assert_bool(WindowManager.is_open(WindowManager.VENDOR)).is_false()
	assert_bool(WindowManager.is_open(WindowManager.INN)).is_false()
	assert_bool(WindowManager.is_open(WindowManager.DIALOGUE)).is_false()
	assert_str(UiStateService.last_zone_id).is_equal("zone.cave")


func test_gm_window_is_closeable_without_granting() -> void:
	WindowManager.open(WindowManager.GM)
	assert_bool(WindowManager.is_open(WindowManager.GM)).is_true()
	assert_bool(WindowManager.close_top()).is_true()
	assert_bool(WindowManager.is_open(WindowManager.GM)).is_false()
	assert_bool(GmService.is_debug_panel_allowed()).is_equal(OS.is_debug_build())
