extends Node

## Non-authoritative client/session state only. Never writes user:// or canonical game data.

signal loading_started(reason: String)
signal loading_completed(reason: String)
signal recoverable_error(code: String, message: String)
signal fatal_compatibility_error(code: String, message: String)
signal content_loaded(content_hash: String)
signal scene_changed(scene_id: String)
signal user_authenticated(user_id: String)
signal logged_out
signal character_loaded(created: bool)
signal zone_state_updated

var current_scene_id: String = "boot"
var is_loading: bool = false
var content_ready: bool = false
var has_fatal_error: bool = false
var last_error_code: String = ""
var last_error_message: String = ""
var is_authenticated: bool = false
var user_id: String = ""
var username: String = ""
var has_character: bool = false
var character_created: bool = false
var character_view: Dictionary = {}
var has_zone_state: bool = false
var zone_view: Dictionary = {}


func notify_loading_started(reason: String) -> void:
	is_loading = true
	loading_started.emit(reason)


func notify_loading_completed(reason: String) -> void:
	is_loading = false
	loading_completed.emit(reason)


func notify_content_loaded(content_hash: String) -> void:
	content_ready = true
	content_loaded.emit(content_hash)


func notify_scene_changed(scene_id: String) -> void:
	current_scene_id = scene_id
	scene_changed.emit(scene_id)


func report_recoverable(code: String, message: String) -> void:
	last_error_code = code
	last_error_message = message
	recoverable_error.emit(code, message)


func report_fatal_compatibility(code: String, message: String) -> void:
	has_fatal_error = true
	content_ready = false
	last_error_code = code
	last_error_message = message
	fatal_compatibility_error.emit(code, message)


func can_enter_gameplay_scenes() -> bool:
	return content_ready and not has_fatal_error


func notify_authenticated(p_user_id: String, p_username: String) -> void:
	is_authenticated = true
	user_id = p_user_id
	username = p_username
	user_authenticated.emit(p_user_id)


func notify_logged_out() -> void:
	is_authenticated = false
	user_id = ""
	username = ""
	has_character = false
	character_created = false
	character_view = {}
	clear_zone_state()
	logged_out.emit()


func notify_character_loaded(view: Dictionary, created: bool) -> void:
	has_character = true
	character_created = created
	character_view = view.duplicate(true)
	character_loaded.emit(created)


func notify_zone_state(view: Dictionary) -> void:
	has_zone_state = true
	zone_view = view.duplicate(true)
	zone_state_updated.emit()


func clear_zone_state() -> void:
	has_zone_state = false
	zone_view = {}


func reset_for_tests() -> void:
	current_scene_id = "boot"
	is_loading = false
	content_ready = false
	has_fatal_error = false
	last_error_code = ""
	last_error_message = ""
	is_authenticated = false
	user_id = ""
	username = ""
	has_character = false
	character_created = false
	character_view = {}
	has_zone_state = false
	zone_view = {}
