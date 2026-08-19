extends Node

## Orchestrates shell flow. Not a gameplay authority.

var last_identity: Dictionary = {}
var enter_world_after_bootstrap: bool = false
var defer_login_after_logout: bool = false


func _ready() -> void:
	if not NetworkService.authentication_finished.is_connected(_on_authentication_finished):
		NetworkService.authentication_finished.connect(_on_authentication_finished)
	if not AppState.logged_out.is_connected(_on_logged_out):
		AppState.logged_out.connect(_on_logged_out)


func start_boot(bundle_path: String = ContentRegistry.DEFAULT_BUNDLE_PATH) -> bool:
	AppState.notify_loading_started("boot")
	var loaded := ContentRegistry.load_bundle(bundle_path)
	if not loaded:
		var code := ContentRegistry.catalog.error_code
		var message := ContentRegistry.catalog.error_message
		if code.is_empty():
			code = "content_missing"
		if message.is_empty():
			message = "The content bundle could not be loaded."
		AppState.report_fatal_compatibility(code, message)
		AppState.notify_loading_completed("boot")
		return false

	var routed := SceneRouter.transition_to(SceneRouter.SCENE_LOGIN)
	AppState.notify_loading_completed("boot")
	return routed


func request_authenticate(device_id: String = "", dev_user: String = "") -> void:
	if AppState.has_fatal_error:
		return
	if not DevIdentity.development_auth_allowed():
		AppState.report_recoverable(
			"development_auth_blocked",
			"Development sign-in is unavailable in this build. Use email and password."
		)
		return
	if not dev_user.is_empty():
		last_identity = DevIdentity.resolve(PackedStringArray(["--dev-user=%s" % dev_user]), OS.get_unique_id())
	else:
		last_identity = DevIdentity.resolve(OS.get_cmdline_user_args(), OS.get_unique_id())
	if not String(last_identity.get("error", "")).is_empty():
		AppState.report_recoverable(String(last_identity["error"]), String(last_identity["warning"]))
		return
	var resolved_id := device_id
	if resolved_id.is_empty():
		resolved_id = String(last_identity.get("device_id", ""))
	var username := String(last_identity.get("dev_user", ""))
	await NetworkService.authenticate_device(resolved_id, username)


func request_register(
	email: String,
	password: String,
	confirm: String,
	accept_terms: bool = true,
	accept_privacy: bool = true
) -> void:
	if AppState.has_fatal_error:
		return
	if password != confirm:
		AppState.report_recoverable("password_mismatch", AccountErrors.message_for("password_mismatch"))
		return
	if email.strip_edges().is_empty() or password.is_empty():
		AppState.report_recoverable("invalid_credentials", "Email and password are required.")
		return
	var result := await AccountService.register_account(email, password, confirm, accept_terms, accept_privacy)
	if not bool(result.get("ok", false)):
		AppState.report_recoverable(String(result.get("code", "AUTH_VALIDATION")), String(result.get("message", AccountErrors.message_for("AUTH_VALIDATION"))))
		return
	SceneRouter.transition_to(SceneRouter.SCENE_VERIFY)


func request_login_email(email: String, password: String) -> void:
	if AppState.has_fatal_error:
		return
	if email.strip_edges().is_empty() or password.is_empty():
		AppState.report_recoverable("invalid_credentials", "Email and password are required.")
		return
	var result := await AccountService.login(email, password)
	var code := String(result.get("code", ""))
	if code == "EMAIL_VERIFICATION_REQUIRED":
		AppState.report_recoverable(code, AccountErrors.message_for(code))
		SceneRouter.transition_to(SceneRouter.SCENE_VERIFY)
		return
	if code == "AUTH_ACCOUNT_DISABLED":
		AppState.report_recoverable(code, AccountErrors.message_for(code))
		SceneRouter.transition_to(SceneRouter.SCENE_ACCOUNT_DISABLED)
		return
	if code == "AUTH_UNAVAILABLE":
		AppState.report_recoverable(code, AccountErrors.message_for(code))
		SceneRouter.transition_to(SceneRouter.SCENE_SERVER_UNAVAILABLE)
		return
	if code == "AUTH_INVALID_CREDENTIALS":
		AppState.report_recoverable("invalid_credentials", AccountErrors.message_for("invalid_credentials"))
		return
	if not bool(result.get("ok", false)):
		AppState.report_recoverable(code if not code.is_empty() else "invalid_credentials", String(result.get("message", AccountErrors.message_for("invalid_credentials"))))
		return
	await NetworkService.import_session(
		String(result.get("token", "")),
		String(result.get("refresh_token", "")),
		String(result.get("user_id", "")),
		String(result.get("username", ""))
	)


func request_password_reset(email: String) -> void:
	if AppState.has_fatal_error:
		return
	await AccountService.request_password_reset(email)


func confirm_password_reset(code: String, new_password: String, confirm: String) -> void:
	if AppState.has_fatal_error:
		return
	var result := await AccountService.confirm_password_reset(code, new_password, confirm)
	if not bool(result.get("ok", false)):
		AppState.report_recoverable(String(result.get("code", "AUTH_INVALID_CHALLENGE")), String(result.get("message", AccountErrors.message_for("AUTH_INVALID_CHALLENGE"))))
		return
	defer_login_after_logout = true
	await NetworkService.logout()
	SceneRouter.transition_to(SceneRouter.SCENE_PASSWORD_CHANGED)


func request_change_password(current_password: String, new_password: String, confirm: String) -> void:
	if AppState.has_fatal_error:
		return
	var result := await AccountService.change_password(current_password, new_password, confirm)
	if not bool(result.get("ok", false)):
		AppState.report_recoverable(String(result.get("code", "AUTH_VALIDATION")), String(result.get("message", AccountErrors.message_for("AUTH_VALIDATION"))))
		return
	defer_login_after_logout = true
	await NetworkService.logout()
	SceneRouter.transition_to(SceneRouter.SCENE_PASSWORD_CHANGED)


func request_email_change(current_password: String, new_email: String) -> void:
	if AppState.has_fatal_error:
		return
	var result := await AccountService.request_email_change(current_password, new_email)
	if not bool(result.get("ok", false)):
		AppState.report_recoverable(String(result.get("code", "AUTH_VALIDATION")), String(result.get("message", AccountErrors.message_for("AUTH_VALIDATION"))))
		return
	SceneRouter.transition_to(SceneRouter.SCENE_EMAIL_CHANGE_VERIFY)


func confirm_email_change(code: String) -> void:
	if AppState.has_fatal_error:
		return
	var result := await AccountService.confirm_email_change(code)
	if not bool(result.get("ok", false)):
		AppState.report_recoverable(String(result.get("code", "AUTH_INVALID_CHALLENGE")), String(result.get("message", AccountErrors.message_for("AUTH_INVALID_CHALLENGE"))))
		return
	defer_login_after_logout = true
	await NetworkService.logout()


func request_verify_email(code: String) -> void:
	if AppState.has_fatal_error:
		return
	var result := await AccountService.verify_email(code)
	if not bool(result.get("ok", false)):
		AppState.report_recoverable(String(result.get("code", "AUTH_INVALID_CHALLENGE")), String(result.get("message", AccountErrors.message_for("AUTH_INVALID_CHALLENGE"))))
		return
	AppState.report_recoverable("email_verified", "Email verified. You can sign in.")
	SceneRouter.transition_to(SceneRouter.SCENE_LOGIN)


func try_restore_session() -> void:
	if AppState.has_fatal_error or AppState.is_authenticated:
		return
	await NetworkService.restore_cached_session()


func request_character_list() -> void:
	if AppState.has_fatal_error:
		return
	if not AppState.is_authenticated:
		AppState.report_recoverable("unauthenticated", "Sign-in is required before listing characters.")
		return
	await NetworkService.list_characters()


func request_character_create(character_name: String, class_id: String) -> void:
	if AppState.has_fatal_error:
		return
	await NetworkService.create_character(character_name, class_id)


func request_character_select(character_id: String) -> void:
	if AppState.has_fatal_error:
		return
	await NetworkService.select_character(character_id)


func request_character_soft_delete(character_id: String, confirmation_name: String = "") -> void:
	await NetworkService.soft_delete_character(character_id, confirmation_name)


func request_character_restore(character_id: String) -> void:
	await NetworkService.restore_character(character_id)


func request_character_bootstrap(proposed_name: String = "") -> void:
	if AppState.has_fatal_error:
		return
	if not AppState.is_authenticated:
		AppState.report_recoverable("unauthenticated", "Sign-in is required before creating a character.")
		return
	var name := proposed_name
	if name.is_empty():
		name = DevIdentity.proposed_character_name(last_identity)
		if name.is_empty() and not AppState.username.is_empty():
			name = AppState.username
	await NetworkService.bootstrap_character(name)


func enter_starter_zone() -> bool:
	if not AppState.has_character:
		AppState.report_recoverable("character_missing", "A character is required before entering the world.")
		return false
	var joined := await NetworkService.join_starter_zone()
	if not joined or not AppState.has_zone_state:
		return false
	await NetworkService.join_zone_chat()
	return SceneRouter.transition_to(SceneRouter.SCENE_WORLD)


func request_resync() -> bool:
	return await NetworkService.request_resync()


func request_logout() -> void:
	enter_world_after_bootstrap = false
	await NetworkService.depart_gameplay()
	await AccountService.logout_current()
	await NetworkService.logout()


func request_logout_all(password: String) -> void:
	enter_world_after_bootstrap = false
	var result := await AccountService.logout_all(password)
	if not bool(result.get("ok", false)):
		AppState.report_recoverable(String(result.get("code", "AUTH_FORBIDDEN")), String(result.get("message", AccountErrors.message_for("AUTH_FORBIDDEN"))))
		return
	await NetworkService.logout()


func cancel_reconnect() -> void:
	enter_world_after_bootstrap = false
	await NetworkService.depart_gameplay()
	await AccountService.logout_current()
	await NetworkService.cancel_reconnect()


func _on_authentication_finished(success: bool, _message: String) -> void:
	if not success:
		return
	if SceneRouter.transition_to(SceneRouter.SCENE_CHARACTER):
		return
	AppState.report_recoverable(
		"character_blocked",
		"Sign-in succeeded but the character screen could not open. Press Play on the project (F5), not a nested UI scene."
	)


func _on_logged_out() -> void:
	enter_world_after_bootstrap = false
	if AppState.has_fatal_error:
		return
	if defer_login_after_logout:
		defer_login_after_logout = false
		return
	if AppState.content_ready:
		SceneRouter.transition_to(SceneRouter.SCENE_LOGIN)


