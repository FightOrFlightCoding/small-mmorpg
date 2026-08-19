extends GdUnitTestSuite

## Shell scenes must load without parser errors.


func before_test() -> void:
	SceneRouter.reset_for_tests()
	AppState.reset_for_tests()
	NetworkService.reset_for_tests()


func test_all_shell_scenes_instantiate() -> void:
	var paths: PackedStringArray = PackedStringArray([
		"res://scenes/boot/boot.tscn",
		"res://scenes/login/login.tscn",
		"res://scenes/login/register.tscn",
		"res://scenes/login/verify.tscn",
		"res://scenes/login/server_unavailable.tscn",
		"res://scenes/login/account_disabled.tscn",
		"res://scenes/character/character.tscn",
		"res://scenes/world/world.tscn",
		"res://scenes/world/player_avatar.tscn",
		"res://scenes/world/npc_avatar.tscn",
		"res://scenes/world/enemy_avatar.tscn",
		"res://scenes/world/loot_avatar.tscn",
		"res://scenes/world/world_hud.tscn",
		"res://scenes/world/chat_panel.tscn",
		"res://scenes/world/entity_registry.tscn",
		"res://scenes/world/net_debug_overlay.tscn",
		"res://scenes/shared/error_dialog.tscn",
		"res://scenes/shared/loading_overlay.tscn",
	])
	for path in paths:
		var scene: PackedScene = load(path)
		assert_object(scene).is_not_null()
		var instance: Node = auto_free(scene.instantiate())
		assert_object(instance).is_not_null()
