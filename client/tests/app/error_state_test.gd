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


func test_fatal_compatibility_codes_cannot_enter_world() -> void:
	assert_bool(GameService.start_boot()).is_true()
	AppState.report_fatal_compatibility("client_too_old", "This client is too old for the server. Update the client.")
	assert_bool(AppState.has_fatal_error).is_true()
	assert_str(AppState.last_error_code).is_equal("client_too_old")
	assert_bool(SceneRouter.transition_to(SceneRouter.SCENE_WORLD)).is_false()
	assert_bool(SceneRouter.transition_to(SceneRouter.SCENE_CHARACTER)).is_false()
	AppState.reset_for_tests()
	GameService.start_boot()
	AppState.report_fatal_compatibility("unsupported_save_version", "This save is incompatible with the server.")
	assert_bool(SceneRouter.transition_to(SceneRouter.SCENE_WORLD)).is_false()


func test_maintenance_is_recoverable_and_does_not_enter_world_alone() -> void:
	assert_bool(GameService.start_boot()).is_true()
	AppState.report_recoverable("server_maintenance", "The server is in maintenance. Gameplay joins are paused.")
	assert_bool(AppState.has_fatal_error).is_false()
	assert_str(AppState.last_error_code).is_equal("server_maintenance")
	assert_str(SceneRouter.current_scene_id).is_equal(SceneRouter.SCENE_LOGIN)
	assert_bool(SceneRouter.transition_to(SceneRouter.SCENE_WORLD)).is_false()
