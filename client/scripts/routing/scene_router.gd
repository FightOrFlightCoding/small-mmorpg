extends Node

## Maps stable scene ids to PackedScenes. Does not own gameplay state.

signal scene_changed(scene_id: String)

const SCENE_BOOT: String = "boot"
const SCENE_LOGIN: String = "login"
const SCENE_REGISTER: String = "register"
const SCENE_VERIFY: String = "verify"
const SCENE_SERVER_UNAVAILABLE: String = "server_unavailable"
const SCENE_ACCOUNT_DISABLED: String = "account_disabled"
const SCENE_FORGOT_PASSWORD: String = "forgot_password"
const SCENE_PASSWORD_RESET_CODE: String = "password_reset_code"
const SCENE_PASSWORD_RESET_NEW: String = "password_reset_new"
const SCENE_PASSWORD_CHANGED: String = "password_changed"
const SCENE_CHANGE_PASSWORD: String = "change_password"
const SCENE_CHANGE_EMAIL: String = "change_email"
const SCENE_EMAIL_CHANGE_VERIFY: String = "email_change_verify"
const SCENE_FORGOT_EMAIL: String = "forgot_email"
const SCENE_CHARACTER: String = "character"
const SCENE_WORLD: String = "world"

const SCENE_PATHS: Dictionary = {
	SCENE_BOOT: "res://scenes/boot/boot.tscn",
	SCENE_LOGIN: "res://scenes/login/login.tscn",
	SCENE_REGISTER: "res://scenes/login/register.tscn",
	SCENE_VERIFY: "res://scenes/login/verify.tscn",
	SCENE_SERVER_UNAVAILABLE: "res://scenes/login/server_unavailable.tscn",
	SCENE_ACCOUNT_DISABLED: "res://scenes/login/account_disabled.tscn",
	SCENE_FORGOT_PASSWORD: "res://scenes/login/forgot_password.tscn",
	SCENE_PASSWORD_RESET_CODE: "res://scenes/login/password_reset_code.tscn",
	SCENE_PASSWORD_RESET_NEW: "res://scenes/login/password_reset_new.tscn",
	SCENE_PASSWORD_CHANGED: "res://scenes/login/password_changed.tscn",
	SCENE_CHANGE_PASSWORD: "res://scenes/login/change_password.tscn",
	SCENE_CHANGE_EMAIL: "res://scenes/login/change_email.tscn",
	SCENE_EMAIL_CHANGE_VERIFY: "res://scenes/login/email_change_verify.tscn",
	SCENE_FORGOT_EMAIL: "res://scenes/login/forgot_email.tscn",
	SCENE_CHARACTER: "res://scenes/character/character.tscn",
	SCENE_WORLD: "res://scenes/world/world.tscn",
}

## Tests set this false so GdUnit does not tear down the runner tree.
var apply_scene_changes: bool = true
var current_scene_id: String = SCENE_BOOT


func scene_path(scene_id: String) -> String:
	if not SCENE_PATHS.has(scene_id):
		return ""
	return String(SCENE_PATHS[scene_id])


func can_transition_to(scene_id: String) -> bool:
	if scene_path(scene_id).is_empty():
		return false
	if AppState.has_fatal_error and scene_id != SCENE_BOOT:
		return false
	if scene_id == SCENE_CHARACTER:
		return AppState.can_enter_gameplay_scenes() and AppState.is_authenticated
	if scene_id == SCENE_WORLD:
		return (
			AppState.can_enter_gameplay_scenes()
			and AppState.is_authenticated
			and AppState.has_character
			and AppState.has_zone_state
		)
	if scene_id == SCENE_CHANGE_PASSWORD or scene_id == SCENE_CHANGE_EMAIL:
		return AppState.content_ready and not AppState.has_fatal_error and AppState.is_authenticated
	if (
		scene_id == SCENE_LOGIN
		or scene_id == SCENE_REGISTER
		or scene_id == SCENE_VERIFY
		or scene_id == SCENE_SERVER_UNAVAILABLE
		or scene_id == SCENE_ACCOUNT_DISABLED
		or scene_id == SCENE_FORGOT_PASSWORD
		or scene_id == SCENE_PASSWORD_RESET_CODE
		or scene_id == SCENE_PASSWORD_RESET_NEW
		or scene_id == SCENE_PASSWORD_CHANGED
		or scene_id == SCENE_EMAIL_CHANGE_VERIFY
		or scene_id == SCENE_FORGOT_EMAIL
	):
		return AppState.content_ready and not AppState.has_fatal_error
	return true


func transition_to(scene_id: String) -> bool:
	if not can_transition_to(scene_id):
		return false
	var path := scene_path(scene_id)
	AppState.notify_loading_started("scene")
	current_scene_id = scene_id
	AppState.notify_scene_changed(scene_id)
	scene_changed.emit(scene_id)
	if apply_scene_changes:
		var tree := get_tree()
		if tree != null:
			tree.call_deferred("change_scene_to_file", path)
	AppState.notify_loading_completed("scene")
	return true


func reset_for_tests() -> void:
	apply_scene_changes = false
	current_scene_id = SCENE_BOOT
