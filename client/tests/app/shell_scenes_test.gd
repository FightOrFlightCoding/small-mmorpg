extends GdUnitTestSuite

## Shell scenes must load without parser errors.


func before_test() -> void:
	SceneRouter.reset_for_tests()
	AppState.reset_for_tests()


func test_all_shell_scenes_instantiate() -> void:
	var paths: PackedStringArray = PackedStringArray([
		"res://scenes/boot/boot.tscn",
		"res://scenes/login/login.tscn",
		"res://scenes/character/character.tscn",
		"res://scenes/world/world.tscn",
		"res://scenes/shared/error_dialog.tscn",
		"res://scenes/shared/loading_overlay.tscn",
	])
	for path in paths:
		var scene: PackedScene = load(path)
		assert_object(scene).is_not_null()
		var instance: Node = auto_free(scene.instantiate())
		assert_object(instance).is_not_null()
