extends GdUnitTestSuite

## AccountService error mapping, credential store, and gateway fakes.


func before_test() -> void:
	SceneRouter.reset_for_tests()
	AppState.reset_for_tests()
	NetworkService.reset_for_tests()
	AccountService.backend = FakeAccountBackend.new()
	RememberEmailStore.clear()


func after_test() -> void:
	RememberEmailStore.clear()


func test_error_mapping_hides_account_existence() -> void:
	assert_str(AccountErrors.message_for("AUTH_REGISTRATION_FAILED")).contains("We could not create this account.")
	assert_str(AccountErrors.message_for("AUTH_INVALID_CREDENTIALS")).is_equal("Email or password is incorrect.")
	assert_str(AccountErrors.message_for("invalid_credentials")).is_equal("Email or password is incorrect.")
	assert_bool(AccountErrors.is_account_gate("email_verification_required")).is_true()


func test_rpc_stack_traces_are_not_shown() -> void:
	var stacked := "Error: email_verification_required\n    at requirePlayableUser (index.js:19158:11)\n    at rpcCharacterList (index.js:19201:18)"
	assert_str(AccountErrors.extract_rpc_domain_code(stacked)).is_equal("email_verification_required")
	assert_bool(AccountErrors.looks_like_internal_trace(stacked)).is_true()
	var mapped := AccountErrors.sanitize_public_rpc({
		"ok": false,
		"code": "rpc_failed",
		"message": stacked,
	})
	assert_str(String(mapped.get("code", ""))).is_equal("email_verification_required")
	assert_str(String(mapped.get("message", ""))).is_equal(AccountErrors.message_for("email_verification_required"))
	assert_bool(String(mapped.get("message", "")).contains("index.js")).is_false()
	assert_bool(String(mapped.get("message", "")).contains("stack")).is_false()
	var unknown := AccountErrors.sanitize_public_rpc({
		"ok": false,
		"code": "rpc_failed",
		"message": "{\"code\":13,\"error\":{\"stackTrace\":\"Error: boom\\n\\tat foo (index.js:1)\"}}",
	})
	assert_str(String(unknown.get("message", ""))).is_equal("The server rejected the request.")
	assert_bool(String(unknown.get("message", "")).contains("index.js")).is_false()


func test_local_gateway_uses_mailpit_capture() -> void:
	assert_bool(AccountService.uses_local_mail_capture()).is_true()
	assert_str(AccountService.LOCAL_MAILPIT_URL).is_equal("http://127.0.0.1:8025")
	assert_bool(AccountService.local_mail_capture_copy().contains("Mailpit")).is_true()
	AccountService.gateway_url = "https://auth.example.com"
	assert_bool(AccountService.uses_local_mail_capture()).is_false()
	AccountService.gateway_url = AccountService.DEFAULT_GATEWAY_URL


func test_failed_logout_all_keeps_session() -> void:
	var account := AccountService.backend as FakeAccountBackend
	await AccountService.login("alice@example.com", "secret-pass-15x")
	assert_str(AccountService.access_token).is_equal("gateway-token")
	account.logout_all_ok = false
	var result := await AccountService.logout_all("wrong-password")
	assert_bool(bool(result.get("ok", true))).is_false()
	assert_str(AccountService.access_token).is_equal("gateway-token")


func test_password_strength_matches_gateway_rules() -> void:
	assert_bool(bool(PasswordStrength.evaluate("short").get("ok", true))).is_false()
	assert_bool(bool(PasswordStrength.evaluate("passwordpassword").get("ok", true))).is_false()
	assert_bool(bool(PasswordStrength.evaluate("correct horse staple").get("ok", false))).is_true()


func test_credential_store_is_unavailable() -> void:
	var store := CredentialStore.new()
	assert_bool(store.is_available()).is_false()
	assert_bool(store.save_refresh_token("user-1", "refresh-secret")).is_false()
	assert_str(store.load_refresh_token("user-1")).is_equal("")
	assert_bool(CredentialStore.STAY_SIGNED_IN_ENABLED).is_false()


func test_remember_email_rejects_token_files() -> void:
	RememberEmailStore.save_email("player@example.com")
	assert_str(RememberEmailStore.load_email()).is_equal("player@example.com")
	var file := FileAccess.open(RememberEmailStore.PATH, FileAccess.WRITE)
	file.store_string(JSON.stringify({"email": "player@example.com", "token": "nope"}))
	file.close()
	assert_str(RememberEmailStore.load_email()).is_equal("")


func test_revoked_refresh_does_not_loop() -> void:
	var account := AccountService.backend as FakeAccountBackend
	AccountService.refresh_token = "stale-refresh"
	account.revoked_refresh["stale-refresh"] = true
	var first := await AccountService.refresh_session()
	assert_bool(bool(first.get("ok", true))).is_false()
	var second := await AccountService.refresh_session()
	assert_str(String(second.get("code", ""))).is_equal("session_expired")
	assert_int(account.refresh_calls).is_equal(1)


func test_password_reset_does_not_auto_login() -> void:
	var account := AccountService.backend as FakeAccountBackend
	AccountService.pending_reset_email = "player@example.com"
	var result := await AccountService.confirm_password_reset("AAAA-BBBB-CCCC-DDDD", "correct horse staple", "correct horse staple")
	assert_bool(bool(result.get("ok", false))).is_true()
	assert_bool(bool(result.get("require_login", false))).is_true()
	assert_str(String(result.get("token", ""))).is_equal("")
	assert_int(account.reset_confirm_calls).is_equal(1)


func test_forgotten_email_lookup_does_not_return_an_address() -> void:
	var page: Control = auto_free(preload("res://scenes/login/forgot_email.tscn").instantiate())
	add_child(page)
	await get_tree().process_frame
	var title := page.get_node("Center/VBox/Title") as Label
	assert_str(title.text).is_equal("Forgot which email you used?")
	page.get_node("Center/VBox/NameEdit").text = "HeroName"
	page.get_node("Center/VBox/LookupButton").emit_signal("pressed")
	await get_tree().process_frame
	var status := page.get_node("Center/VBox/StatusLabel") as Label
	assert_bool(status.text.contains("@")).is_false()
	assert_bool(status.text.to_lower().contains("hero")).is_false()


func test_forgot_password_copy_does_not_enumerate_accounts() -> void:
	var page: Control = auto_free(preload("res://scenes/login/forgot_password.tscn").instantiate())
	add_child(page)
	await get_tree().process_frame
	var status := page.get_node("Center/VBox/StatusLabel") as Label
	assert_bool(status.text.contains("If an account exists for that email")).is_true()
	assert_bool(status.text.contains("registered")).is_false()


func test_change_password_and_email_use_canonical_paths() -> void:
	var account := AccountService.backend as FakeAccountBackend
	await AccountService.login("alice@example.com", "secret-pass-15x")
	var changed := await AccountService.change_password("secret-pass-15x", "correct horse staple", "correct horse staple")
	assert_bool(bool(changed.get("ok", false))).is_true()
	assert_str(account.last_path).is_equal("/v1/account/password/change")
	assert_str(AccountService.access_token).is_equal("")
	await AccountService.login("alice@example.com", "secret-pass-15x")
	var requested := await AccountService.request_email_change("secret-pass-15x", "new@example.com")
	assert_bool(bool(requested.get("ok", false))).is_true()
	assert_str(account.last_path).is_equal("/v1/account/email/change/request")
	var confirmed := await AccountService.confirm_email_change("AAAA-BBBB-CCCC-DDDD")
	assert_bool(bool(confirmed.get("ok", false))).is_true()
	assert_str(account.last_path).is_equal("/v1/account/email/change/confirm")
	assert_bool(bool(confirmed.get("require_login", false))).is_true()

