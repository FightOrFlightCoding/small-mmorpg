extends GdUnitTestSuite

## Scene id mapping and guarded transitions.


func before_test() -> void:
	SceneRouter.reset_for_tests()
	AppState.reset_for_tests()


func test_scene_paths_resolve() -> void:
	assert_str(SceneRouter.scene_path(SceneRouter.SCENE_BOOT)).is_equal("res://scenes/boot/boot.tscn")
	assert_str(SceneRouter.scene_path(SceneRouter.SCENE_LOGIN)).is_equal("res://scenes/login/login.tscn")
	assert_str(SceneRouter.scene_path(SceneRouter.SCENE_CHARACTER)).is_equal("res://scenes/character/character.tscn")
	assert_str(SceneRouter.scene_path(SceneRouter.SCENE_WORLD)).is_equal("res://scenes/world/world.tscn")
	assert_str(SceneRouter.scene_path("unknown")).is_equal("")


func test_boot_routes_to_login_when_content_loads() -> void:
	var changed: PackedStringArray = PackedStringArray()
	SceneRouter.scene_changed.connect(func(scene_id: String) -> void: changed.append(scene_id))
	assert_bool(GameService.start_boot()).is_true()
	assert_str(SceneRouter.current_scene_id).is_equal(SceneRouter.SCENE_LOGIN)
	assert_str(AppState.current_scene_id).is_equal(SceneRouter.SCENE_LOGIN)
	assert_int(changed.size()).is_greater_equal(1)
	assert_str(changed[changed.size() - 1]).is_equal(SceneRouter.SCENE_LOGIN)


func test_unknown_scene_is_rejected() -> void:
	assert_bool(SceneRouter.transition_to("auction")).is_false()
	assert_str(SceneRouter.current_scene_id).is_equal(SceneRouter.SCENE_BOOT)
