extends GdUnitTestSuite

## Authentication, session expiry, character bootstrap, and visible network errors.


func before_test() -> void:
	SceneRouter.reset_for_tests()
	AppState.reset_for_tests()
	NetworkService.reset_for_tests()
	AccountService.backend = FakeAccountBackend.new()
	GameService.last_identity = {}
	GameService.enter_world_after_bootstrap = false


func _fake() -> FakeNetworkBackend:
	var fake := FakeNetworkBackend.new()
	NetworkService.backend = fake
	return fake


func _account() -> FakeAccountBackend:
	return AccountService.backend as FakeAccountBackend


func _created_payload(character_id: String = "char-1", character_name: String = "Alice") -> String:
	return JSON.stringify({
		"characterId": character_id,
		"name": character_name,
		"created": true,
		"storageVersion": "v1",
		"contentId": "player.base",
		"zoneId": "zone.starter",
		"baseStats": {
			"maxHealth": 100,
			"attack": 4,
			"moveSpeed": 120,
			"attackRange": 40,
			"attackCooldown": 0.7,
			"interactionRange": 48,
			"pickupRange": 40,
		},
		"position": {"x": 240, "y": 384},
	})


func _existing_payload(character_id: String = "char-1", character_name: String = "Alice") -> String:
	var parsed: Variant = JSON.parse_string(_created_payload(character_id, character_name))
	var data: Dictionary = parsed
	data["created"] = false
	return JSON.stringify(data)


func test_authentication_state_transitions() -> void:
	var fake := _fake()
	fake.rpc_payload = _created_payload()
	assert_bool(GameService.start_boot()).is_true()
	assert_bool(AppState.is_authenticated).is_false()
	await GameService.request_authenticate("vibecode-dev-alice")
	assert_bool(NetworkService.last_auth_attempted).is_true()
	assert_bool(AppState.is_authenticated).is_true()
	assert_str(AppState.user_id).is_equal("user-alice")
	assert_str(SceneRouter.current_scene_id).is_equal(SceneRouter.SCENE_CHARACTER)
	assert_str(fake.last_device_id).is_equal("vibecode-dev-alice")
	assert_int(fake.socket_calls).is_equal(1)
	assert_bool(NetworkService.socket_connected).is_true()
	assert_bool(AppState.has_fatal_error).is_false()


func test_session_expired_reauthenticates() -> void:
	var fake := _fake()
	fake.rpc_payload = _existing_payload()
	assert_bool(GameService.start_boot()).is_true()
	await GameService.request_authenticate("vibecode-dev-alice")
	fake.session_expired = true
	fake.refresh_ok = false
	await GameService.request_character_bootstrap("Alice")
	assert_int(fake.refresh_calls).is_equal(1)
	assert_int(fake.authenticate_calls).is_equal(2)
	assert_bool(AppState.has_character).is_true()
	assert_bool(AppState.character_created).is_false()
	assert_str(AppState.last_error_code).is_equal("")


func test_session_expired_visible_error_when_reauth_fails() -> void:
	var fake := _fake()
	fake.rpc_payload = _created_payload()
	assert_bool(GameService.start_boot()).is_true()
	await GameService.request_authenticate("vibecode-dev-alice")
	fake.session_expired = true
	fake.refresh_ok = false
	fake.fail_reauth = true
	await GameService.request_character_bootstrap("Alice")
	assert_bool(AppState.is_authenticated).is_false()
	assert_str(AppState.last_error_code).is_equal("session_expired")
	assert_str(SceneRouter.current_scene_id).is_equal(SceneRouter.SCENE_LOGIN)
	assert_bool(AppState.has_character).is_false()


func test_character_created_path() -> void:
	var fake := _fake()
	fake.rpc_payload = _created_payload("char-new", "Alice")
	assert_bool(GameService.start_boot()).is_true()
	await GameService.request_authenticate("vibecode-dev-alice")
	await GameService.request_character_bootstrap("Alice")
	assert_str(fake.last_rpc_id).is_equal("character_bootstrap")
	assert_str(fake.last_rpc_payload).contains("Alice")
	assert_bool(AppState.has_character).is_true()
	assert_bool(AppState.character_created).is_true()
	assert_str(AppState.character_view["character_id"]).is_equal("char-new")
	assert_str(AppState.character_view["name"]).is_equal("Alice")
	assert_bool(await GameService.enter_starter_zone()).is_true()
	assert_str(fake.last_rpc_id).is_equal(MatchProtocol.FIND_OR_CREATE_STARTER_ZONE_RPC)
	assert_str(fake.last_join_match_id).is_equal("match-starter-shared")
	assert_str(String(fake.last_join_metadata.get("protocolVersion", ""))).is_equal(str(MatchProtocol.VERSION))
	assert_str(String(fake.last_join_metadata.get("selectionTicket", ""))).is_equal("ticket-1")
	assert_bool(fake.last_join_metadata.has("characterId")).is_false()
	assert_bool(AppState.has_zone_state).is_true()
	assert_str(AppState.zone_view["self_id"]).is_equal("user-alice")
	assert_str(SceneRouter.current_scene_id).is_equal(SceneRouter.SCENE_WORLD)


func test_character_existing_path() -> void:
	var fake := _fake()
	fake.rpc_payload = _existing_payload("char-same", "Bob")
	fake.user_id = "user-bob"
	fake.username = "bob"
	assert_bool(GameService.start_boot()).is_true()
	await GameService.request_authenticate("vibecode-dev-bob")
	await GameService.request_character_bootstrap("Ignored")
	assert_bool(AppState.character_created).is_false()
	assert_str(AppState.character_view["character_id"]).is_equal("char-same")
	assert_str(AppState.character_view["name"]).is_equal("Bob")
	assert_int(int(AppState.character_view["base_stats"]["maxHealth"])).is_equal(100)


func test_visible_network_error_on_login() -> void:
	var fake := _fake()
	fake.authenticate_ok = false
	fake.authenticate_code = "network_unreachable"
	fake.authenticate_message = "Cannot reach Nakama."
	assert_bool(GameService.start_boot()).is_true()
	await GameService.request_authenticate("vibecode-dev-alice")
	assert_bool(AppState.is_authenticated).is_false()
	assert_str(AppState.last_error_code).is_equal("network_unreachable")
	assert_str(AppState.last_error_message).is_equal("Cannot reach Nakama.")
	assert_str(SceneRouter.current_scene_id).is_equal(SceneRouter.SCENE_LOGIN)
	assert_bool(SceneRouter.transition_to(SceneRouter.SCENE_CHARACTER)).is_false()
	assert_bool(SceneRouter.transition_to(SceneRouter.SCENE_WORLD)).is_false()


func test_named_dev_user_authenticates_alice() -> void:
	var fake := _fake()
	fake.rpc_payload = _created_payload()
	assert_bool(GameService.start_boot()).is_true()
	await GameService.request_authenticate("", "alice")
	assert_str(fake.last_device_id).is_equal("vibecode-dev-alice")
	assert_str(fake.last_username).is_equal("alice")
	assert_str(String(GameService.last_identity.get("dev_user", ""))).is_equal("alice")
	assert_bool(AppState.is_authenticated).is_true()


func test_login_hint_wraps_and_offers_named_identities() -> void:
	var page: Control = auto_free(preload("res://scenes/login/login.tscn").instantiate())
	add_child(page)
	await get_tree().process_frame
	var hint: Label = page.get_node("Center/VBox/Hint")
	assert_int(int(hint.autowrap_mode)).is_equal(TextServer.AUTOWRAP_WORD_SMART)
	assert_float(hint.custom_minimum_size.x).is_equal(640.0)
	assert_str(page.get_node("Center/VBox/AliceButton").text).is_equal("Sign in as Alice")
	assert_str(page.get_node("Center/VBox/BobButton").text).is_equal("Sign in as Bob")
	assert_str(page.get_node("Center/VBox/LoginButton").text).is_equal("Log in")
	assert_str(page.get_node("Center/VBox/RegisterButton").text).is_equal("Register")
	assert_bool(String(page.get_node("Center/VBox/ServerHint").text).contains("127.0.0.1:7350")).is_true()
	assert_bool(NetworkService.last_auth_attempted).is_false()


func test_play_does_not_auto_sign_in() -> void:
	assert_bool(GameService.enter_world_after_bootstrap).is_false()
	var page: Control = auto_free(preload("res://scenes/login/login.tscn").instantiate())
	add_child(page)
	await get_tree().process_frame
	assert_bool(NetworkService.last_auth_attempted).is_false()


func test_logout_returns_to_login() -> void:
	var fake := _fake()
	fake.rpc_payload = _created_payload()
	assert_bool(GameService.start_boot()).is_true()
	await GameService.request_authenticate("vibecode-dev-alice")
	await GameService.request_character_bootstrap("Alice")
	await GameService.request_logout()
	assert_int(fake.logout_calls).is_equal(1)
	assert_bool(AppState.is_authenticated).is_false()
	assert_str(SceneRouter.current_scene_id).is_equal(SceneRouter.SCENE_LOGIN)


func test_email_registration_and_login() -> void:
	var fake := _fake()
	var account := _account()
	fake.rpc_payload = _created_payload()
	assert_bool(GameService.start_boot()).is_true()
	await GameService.request_register("alice@example.com", "secret-pass-15x", "secret-pass-15x")
	assert_bool(AppState.is_authenticated).is_false()
	assert_str(account.last_email).is_equal("alice@example.com")
	assert_int(account.register_calls).is_equal(1)
	assert_str(SceneRouter.current_scene_id).is_equal(SceneRouter.SCENE_VERIFY)
	await GameService.request_verify_email("ABC123")
	assert_int(account.verify_calls).is_equal(1)
	assert_str(SceneRouter.current_scene_id).is_equal(SceneRouter.SCENE_LOGIN)
	await GameService.request_login_email("alice@example.com", "secret-pass-15x")
	assert_bool(AppState.is_authenticated).is_true()
	assert_int(fake.import_calls).is_equal(1)
	assert_str(SceneRouter.current_scene_id).is_equal(SceneRouter.SCENE_CHARACTER)


func test_register_rejects_password_mismatch() -> void:
	var fake := _fake()
	assert_bool(GameService.start_boot()).is_true()
	await GameService.request_register("alice@example.com", "secret-pass-15x", "other-pass-15xx")
	assert_int(_account().register_calls).is_equal(0)
	assert_int(fake.authenticate_calls).is_equal(0)
	assert_bool(AppState.is_authenticated).is_false()
	assert_str(AppState.last_error_code).is_equal("password_mismatch")


func test_invalid_email_credentials_are_visible() -> void:
	var fake := _fake()
	_account().login_ok = false
	_account().login_code = "AUTH_INVALID_CREDENTIALS"
	assert_bool(GameService.start_boot()).is_true()
	await GameService.request_login_email("alice@example.com", "wrong-pass-15xxx")
	assert_bool(AppState.is_authenticated).is_false()
	assert_str(AppState.last_error_code).is_equal("invalid_credentials")
	assert_str(AppState.last_error_message).is_equal("Email or password is incorrect.")
	assert_str(SceneRouter.current_scene_id).is_equal(SceneRouter.SCENE_LOGIN)
	assert_int(fake.import_calls).is_equal(0)


func test_session_refresh_succeeds_without_reauth() -> void:
	var fake := _fake()
	fake.rpc_payload = _existing_payload()
	assert_bool(GameService.start_boot()).is_true()
	await GameService.request_authenticate("vibecode-dev-alice")
	fake.session_expired = true
	fake.refresh_ok = true
	await GameService.request_character_bootstrap("Alice")
	assert_int(fake.refresh_calls).is_equal(1)
	assert_int(fake.authenticate_calls).is_equal(1)
	assert_bool(AppState.has_character).is_true()


func test_email_session_expiry_does_not_device_reauth() -> void:
	var fake := _fake()
	var account := _account()
	fake.rpc_payload = _existing_payload()
	assert_bool(GameService.start_boot()).is_true()
	await GameService.request_login_email("alice@example.com", "secret-pass-15x")
	fake.session_expired = true
	account.refresh_ok = false
	await GameService.request_character_bootstrap("Alice")
	assert_int(fake.authenticate_calls).is_equal(0)
	assert_int(fake.import_calls).is_equal(1)
	assert_bool(AppState.is_authenticated).is_false()
	assert_str(AppState.last_error_code).is_equal("session_expired")


func test_development_auth_is_blocked_in_release_config() -> void:
	DevIdentity.force_release_config = true
	var fake := _fake()
	assert_bool(GameService.start_boot()).is_true()
	await GameService.request_authenticate("vibecode-dev-alice")
	assert_int(fake.authenticate_calls).is_equal(0)
	assert_str(AppState.last_error_code).is_equal("development_auth_blocked")
	var page: Control = auto_free(preload("res://scenes/login/login.tscn").instantiate())
	add_child(page)
	await get_tree().process_frame
	assert_bool(page.get_node("Center/VBox/AliceButton").visible).is_false()
	assert_bool(page.get_node("Center/VBox/BobButton").visible).is_false()
	assert_bool(page.get_node("Center/VBox/SignInButton").visible).is_false()
	assert_bool(page.get_node("Center/VBox/LoginButton").visible).is_true()
	assert_bool(page.get_node("Center/VBox/RegisterButton").visible).is_true()


func test_session_cache_never_stores_passwords() -> void:
	SessionCache.save("token-value", "refresh-value", "user-1", "alice", SessionCache.AUTH_MODE_EMAIL)
	var cached := SessionCache.load_cache()
	assert_bool(cached.has("password")).is_false()
	assert_bool(cached.has("email_password")).is_false()
	assert_str(String(cached.get("token", ""))).is_equal("token-value")
	var poisoned := FileAccess.open(SessionCache.PATH, FileAccess.WRITE)
	assert_object(poisoned).is_not_null()
	poisoned.store_string(JSON.stringify({
		"token": "token-value",
		"refresh_token": "refresh-value",
		"password": "secret-pass",
	}))
	poisoned.close()
	var rejected := SessionCache.load_cache()
	assert_int(rejected.size()).is_equal(0)


func test_character_list_and_select_issue_a_ticket() -> void:
	var fake := _fake()
	fake.rpc_payload = _existing_payload("char-1", "Alice")
	assert_bool(GameService.start_boot()).is_true()
	await GameService.request_authenticate("vibecode-dev-alice")
	await GameService.request_character_list()
	assert_str(fake.last_rpc_id).is_equal("character_list")
	assert_int(AppState.slot_limit).is_equal(3)
	assert_int(AppState.live_count).is_equal(1)
	await GameService.request_character_select("char-1")
	assert_str(AppState.selection_ticket).is_equal("ticket-1")
	assert_str(AppState.character_view["character_id"]).is_equal("char-1")


func test_duplicate_email_does_not_authenticate() -> void:
	assert_bool(GameService.start_boot()).is_true()
	await GameService.request_register("dup@example.com", "secret-pass-15x", "secret-pass-15x")
	await GameService.request_register("dup@example.com", "secret-pass-15x", "secret-pass-15x")
	assert_str(AppState.last_error_code).is_equal("AUTH_REGISTRATION_FAILED")
	assert_bool(AppState.last_error_message.contains("We could not create this account.")).is_true()
	assert_bool(AppState.is_authenticated).is_false()


func test_register_requires_terms() -> void:
	assert_bool(GameService.start_boot()).is_true()
	await GameService.request_register("legal@example.com", "secret-pass-15x", "secret-pass-15x", false, false)
	assert_int(_account().register_calls).is_equal(0)
	assert_str(AppState.last_error_code).is_equal("terms_required")


func test_unverified_login_goes_to_verify() -> void:
	assert_bool(GameService.start_boot()).is_true()
	await GameService.request_register("pending@example.com", "secret-pass-15x", "secret-pass-15x")
	await GameService.request_login_email("pending@example.com", "secret-pass-15x")
	assert_bool(AppState.is_authenticated).is_false()
	assert_str(AppState.last_error_code).is_equal("EMAIL_VERIFICATION_REQUIRED")
	assert_str(SceneRouter.current_scene_id).is_equal(SceneRouter.SCENE_VERIFY)


func test_disabled_account_scene() -> void:
	_account().login_ok = false
	_account().login_code = "AUTH_ACCOUNT_DISABLED"
	assert_bool(GameService.start_boot()).is_true()
	await GameService.request_login_email("off@example.com", "secret-pass-15x")
	assert_str(SceneRouter.current_scene_id).is_equal(SceneRouter.SCENE_ACCOUNT_DISABLED)
	assert_bool(AppState.is_authenticated).is_false()


func test_unverified_gameplay_is_rejected() -> void:
	var fake := _fake()
	fake.rpc_ok = false
	fake.rpc_code = "rpc_failed"
	fake.rpc_message = "Error: email_verification_required\n    at requirePlayableUser (index.js:19158:11)"
	assert_bool(GameService.start_boot()).is_true()
	await GameService.request_authenticate("vibecode-dev-alice")
	await GameService.request_character_create("Alice", "test.class.warrior")
	assert_str(AppState.last_error_code).is_equal("email_verification_required")
	assert_str(AppState.last_error_message).is_equal(AccountErrors.message_for("email_verification_required"))
	assert_bool(AppState.last_error_message.contains("index.js")).is_false()


func test_logout_all_revokes_gateway_sessions() -> void:
	var fake := _fake()
	fake.rpc_payload = _created_payload()
	assert_bool(GameService.start_boot()).is_true()
	await GameService.request_login_email("alice@example.com", "secret-pass-15x")
	await GameService.request_logout_all("secret-pass-15x")
	assert_int(_account().logout_all_calls).is_equal(1)
	assert_int(fake.logout_calls).is_equal(1)
	assert_bool(AppState.is_authenticated).is_false()
	assert_str(SceneRouter.current_scene_id).is_equal(SceneRouter.SCENE_LOGIN)


func test_logout_all_wrong_password_stays_signed_in() -> void:
	var fake := _fake()
	fake.rpc_payload = _created_payload()
	assert_bool(GameService.start_boot()).is_true()
	await GameService.request_login_email("alice@example.com", "secret-pass-15x")
	_account().logout_all_ok = false
	await GameService.request_logout_all("wrong-password")
	assert_int(_account().logout_all_calls).is_equal(1)
	assert_int(fake.logout_calls).is_equal(0)
	assert_str(AccountService.access_token).is_equal("gateway-token")
	assert_bool(AppState.is_authenticated).is_true()
	assert_str(SceneRouter.current_scene_id).is_equal(SceneRouter.SCENE_CHARACTER)


func test_email_session_refresh_uses_gateway() -> void:
	var fake := _fake()
	fake.rpc_payload = _existing_payload()
	assert_bool(GameService.start_boot()).is_true()
	await GameService.request_login_email("alice@example.com", "secret-pass-15x")
	fake.session_expired = true
	await GameService.request_character_bootstrap("Alice")
	assert_int(_account().refresh_calls).is_greater_equal(1)
	assert_int(fake.authenticate_calls).is_equal(0)
	assert_bool(AppState.has_character).is_true()


func test_remember_email_and_hidden_stay_signed_in() -> void:
	RememberEmailStore.save_email("remembered@example.com")
	var page: Control = auto_free(preload("res://scenes/login/login.tscn").instantiate())
	add_child(page)
	await get_tree().process_frame
	assert_str(page.get_node("Center/VBox/EmailEdit").text).is_equal("remembered@example.com")
	assert_bool(page.get_node("Center/VBox/StaySignedIn").visible).is_false()
	assert_bool(page.get_node("Center/VBox/RememberEmail").button_pressed).is_true()
	RememberEmailStore.clear()


func test_register_checkboxes_are_not_preselected() -> void:
	var page: Control = auto_free(preload("res://scenes/login/register.tscn").instantiate())
	add_child(page)
	await get_tree().process_frame
	assert_bool(page.get_node("Center/VBox/TermsCheck").button_pressed).is_false()
	assert_bool(page.get_node("Center/VBox/PrivacyCheck").button_pressed).is_false()
	assert_bool(AccountService.stay_signed_in_available()).is_false()
