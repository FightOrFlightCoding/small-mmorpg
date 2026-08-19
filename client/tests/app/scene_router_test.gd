extends GdUnitTestSuite

## Scene id mapping and guarded transitions.


func before_test() -> void:
	SceneRouter.reset_for_tests()
	AppState.reset_for_tests()
	NetworkService.reset_for_tests()


func test_scene_paths_resolve() -> void:
	assert_str(SceneRouter.scene_path(SceneRouter.SCENE_BOOT)).is_equal("res://scenes/boot/boot.tscn")
	assert_str(SceneRouter.scene_path(SceneRouter.SCENE_LOGIN)).is_equal("res://scenes/login/login.tscn")
	assert_str(SceneRouter.scene_path(SceneRouter.SCENE_REGISTER)).is_equal("res://scenes/login/register.tscn")
	assert_str(SceneRouter.scene_path(SceneRouter.SCENE_VERIFY)).is_equal("res://scenes/login/verify.tscn")
	assert_str(SceneRouter.scene_path(SceneRouter.SCENE_SERVER_UNAVAILABLE)).is_equal("res://scenes/login/server_unavailable.tscn")
	assert_str(SceneRouter.scene_path(SceneRouter.SCENE_ACCOUNT_DISABLED)).is_equal("res://scenes/login/account_disabled.tscn")
	assert_str(SceneRouter.scene_path(SceneRouter.SCENE_FORGOT_PASSWORD)).is_equal("res://scenes/login/forgot_password.tscn")
	assert_str(SceneRouter.scene_path(SceneRouter.SCENE_PASSWORD_RESET_CODE)).is_equal("res://scenes/login/password_reset_code.tscn")
	assert_str(SceneRouter.scene_path(SceneRouter.SCENE_PASSWORD_RESET_NEW)).is_equal("res://scenes/login/password_reset_new.tscn")
	assert_str(SceneRouter.scene_path(SceneRouter.SCENE_PASSWORD_CHANGED)).is_equal("res://scenes/login/password_changed.tscn")
	assert_str(SceneRouter.scene_path(SceneRouter.SCENE_CHANGE_PASSWORD)).is_equal("res://scenes/login/change_password.tscn")
	assert_str(SceneRouter.scene_path(SceneRouter.SCENE_CHANGE_EMAIL)).is_equal("res://scenes/login/change_email.tscn")
	assert_str(SceneRouter.scene_path(SceneRouter.SCENE_EMAIL_CHANGE_VERIFY)).is_equal("res://scenes/login/email_change_verify.tscn")
	assert_str(SceneRouter.scene_path(SceneRouter.SCENE_FORGOT_EMAIL)).is_equal("res://scenes/login/forgot_email.tscn")
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


func test_character_and_world_require_auth_and_character() -> void:
	assert_bool(GameService.start_boot()).is_true()
	assert_bool(SceneRouter.transition_to(SceneRouter.SCENE_CHARACTER)).is_false()
	assert_bool(SceneRouter.transition_to(SceneRouter.SCENE_WORLD)).is_false()
	AppState.notify_authenticated("user-alice", "alice")
	assert_bool(SceneRouter.transition_to(SceneRouter.SCENE_CHARACTER)).is_true()
	assert_bool(SceneRouter.transition_to(SceneRouter.SCENE_WORLD)).is_false()
	AppState.notify_character_loaded({"name": "Alice"}, false)
	assert_bool(SceneRouter.transition_to(SceneRouter.SCENE_WORLD)).is_false()
	AppState.notify_zone_state({
		"self_id": "user-alice",
		"zone_id": "zone.starter",
		"tick": 1,
		"players": [],
		"npcs": [],
		"enemies": [],
		"loot": [],
	})
	assert_bool(SceneRouter.transition_to(SceneRouter.SCENE_WORLD)).is_true()


func test_change_password_and_email_require_auth() -> void:
	assert_bool(GameService.start_boot()).is_true()
	assert_bool(SceneRouter.transition_to(SceneRouter.SCENE_CHANGE_PASSWORD)).is_false()
	assert_bool(SceneRouter.transition_to(SceneRouter.SCENE_CHANGE_EMAIL)).is_false()
	AppState.notify_authenticated("user-alice", "alice")
	assert_bool(SceneRouter.transition_to(SceneRouter.SCENE_CHANGE_PASSWORD)).is_true()
	assert_bool(SceneRouter.transition_to(SceneRouter.SCENE_CHANGE_EMAIL)).is_true()
