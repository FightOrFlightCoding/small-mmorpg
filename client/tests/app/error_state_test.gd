extends GdUnitTestSuite

## Fatal content errors stay on boot and never enter gameplay scenes.


func before_test() -> void:
	SceneRouter.reset_for_tests()
	AppState.reset_for_tests()
	NetworkService.reset_for_tests()


func test_missing_bundle_is_fatal() -> void:
	assert_bool(GameService.start_boot("res://tests/fixtures/does_not_exist.json")).is_false()
	assert_bool(AppState.has_fatal_error).is_true()
	assert_str(AppState.last_error_code).is_equal("content_missing")
	assert_str(SceneRouter.current_scene_id).is_equal(SceneRouter.SCENE_BOOT)
	assert_bool(SceneRouter.transition_to(SceneRouter.SCENE_LOGIN)).is_false()
	assert_bool(SceneRouter.transition_to(SceneRouter.SCENE_WORLD)).is_false()


func test_incompatible_schema_is_fatal() -> void:
	assert_bool(GameService.start_boot("res://tests/fixtures/content_incompatible.json")).is_false()
	assert_bool(AppState.has_fatal_error).is_true()
	assert_str(AppState.last_error_code).is_equal("content_incompatible")
	assert_str(SceneRouter.current_scene_id).is_equal(SceneRouter.SCENE_BOOT)


func test_missing_schema_version_is_fatal() -> void:
	assert_bool(GameService.start_boot("res://tests/fixtures/content_missing_schema.json")).is_false()
	assert_bool(AppState.has_fatal_error).is_true()
	assert_str(AppState.last_error_code).is_equal("content_schema_missing")


func test_malformed_bundle_is_fatal() -> void:
	assert_bool(GameService.start_boot("res://tests/fixtures/content_malformed.json")).is_false()
	assert_bool(AppState.has_fatal_error).is_true()
	assert_str(AppState.last_error_code).is_equal("content_malformed")


func test_recoverable_error_does_not_block_login() -> void:
	assert_bool(GameService.start_boot()).is_true()
	AppState.report_recoverable("network_unreachable", "Cannot reach Nakama.")
	assert_bool(AppState.has_fatal_error).is_false()
	assert_str(AppState.last_error_code).is_equal("network_unreachable")
	assert_str(SceneRouter.current_scene_id).is_equal(SceneRouter.SCENE_LOGIN)
	assert_bool(NetworkService.is_authentication_configured()).is_true()
