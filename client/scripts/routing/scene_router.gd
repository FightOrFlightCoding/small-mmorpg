extends Node

## Maps stable scene ids to PackedScenes. Does not own gameplay state.

signal scene_changed(scene_id: String)

const SCENE_BOOT: String = "boot"
const SCENE_LOGIN: String = "login"
const SCENE_CHARACTER: String = "character"
const SCENE_WORLD: String = "world"

const SCENE_PATHS: Dictionary = {
	SCENE_BOOT: "res://scenes/boot/boot.tscn",
	SCENE_LOGIN: "res://scenes/login/login.tscn",
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
		return AppState.can_enter_gameplay_scenes() and AppState.is_authenticated and AppState.has_character
	if scene_id == SCENE_LOGIN:
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
