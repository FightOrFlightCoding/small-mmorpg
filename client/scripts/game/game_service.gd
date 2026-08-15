extends Node

## Orchestrates shell flow. Not a gameplay authority.

var last_identity: Dictionary = {}


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


func request_authenticate(device_id: String = "") -> void:
	if AppState.has_fatal_error:
		return
	last_identity = DevIdentity.resolve(OS.get_cmdline_user_args(), OS.get_unique_id())
	if not String(last_identity.get("error", "")).is_empty():
		AppState.report_recoverable(String(last_identity["error"]), String(last_identity["warning"]))
		return
	var resolved_id := device_id
	if resolved_id.is_empty():
		resolved_id = String(last_identity.get("device_id", ""))
	var username := String(last_identity.get("dev_user", ""))
	await NetworkService.authenticate_device(resolved_id, username)


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
	return SceneRouter.transition_to(SceneRouter.SCENE_WORLD)


func request_resync() -> bool:
	return await NetworkService.request_resync()


func request_logout() -> void:
	await NetworkService.logout()


func _on_authentication_finished(success: bool, _message: String) -> void:
	if success:
		SceneRouter.transition_to(SceneRouter.SCENE_CHARACTER)


func _on_logged_out() -> void:
	if AppState.has_fatal_error:
		return
	if AppState.content_ready:
		SceneRouter.transition_to(SceneRouter.SCENE_LOGIN)
