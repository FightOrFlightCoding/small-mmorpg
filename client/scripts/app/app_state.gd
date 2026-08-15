extends Node

## Non-authoritative client/session state only. Never writes user:// or canonical game data.

signal loading_started(reason: String)
signal loading_completed(reason: String)
signal recoverable_error(code: String, message: String)
signal fatal_compatibility_error(code: String, message: String)
signal content_loaded(content_hash: String)
signal scene_changed(scene_id: String)

var current_scene_id: String = "boot"
var is_loading: bool = false
var content_ready: bool = false
var has_fatal_error: bool = false
var last_error_code: String = ""
var last_error_message: String = ""


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


func reset_for_tests() -> void:
	current_scene_id = "boot"
	is_loading = false
	content_ready = false
	has_fatal_error = false
	last_error_code = ""
	last_error_message = ""
