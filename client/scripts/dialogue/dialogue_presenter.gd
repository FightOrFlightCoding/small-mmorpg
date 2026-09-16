class_name DialoguePresenter
extends Node

## Wraps Dialogue Manager. Opens elder dialogue only after a matching INTERACTION_RESULT.

signal dialogue_opened(npc_id: String)
signal dialogue_closed

const BALLOON_SCENE := "res://addons/dialogue_manager/example_balloon/example_balloon.tscn"

var pending_request_id: String = ""
var pending_npc_id: String = ""
var last_opened_npc_id: String = ""
var open_count: int = 0
var _balloon: Node = null


func _ready() -> void:
	if not DialogueManager.dialogue_ended.is_connected(_on_dialogue_ended):
		DialogueManager.dialogue_ended.connect(_on_dialogue_ended)


func _exit_tree() -> void:
	if DialogueManager.dialogue_ended.is_connected(_on_dialogue_ended):
		DialogueManager.dialogue_ended.disconnect(_on_dialogue_ended)


func is_open() -> bool:
	return _balloon != null and is_instance_valid(_balloon)


func note_intent(npc_id: String, request_id: String) -> void:
	pending_npc_id = npc_id
	pending_request_id = request_id


func handle_interaction_result(result: Dictionary) -> bool:
	var request_id := String(result.get("request_id", ""))
	var target_id := String(result.get("target_id", ""))
	if request_id.is_empty() or request_id != pending_request_id:
		return false
	if not bool(result.get("result_ok", false)):
		pending_request_id = ""
		pending_npc_id = ""
		return false
	var npc_id := pending_npc_id
	if npc_id.is_empty():
		npc_id = target_id
	pending_request_id = ""
	pending_npc_id = ""
	var dialogue_id := String(result.get("dialogue_id", ""))
	return open_for_npc(npc_id, dialogue_id)


func open_for_npc(npc_id: String, dialogue_id: String = "") -> bool:
	var resource := DialogueCatalog.load_resource(npc_id, dialogue_id)
	if resource == null:
		AppState.report_recoverable("dialogue_missing", "No dialogue is mapped for %s." % npc_id)
		return false
	if is_open():
		_balloon.queue_free()
		_balloon = null
	last_opened_npc_id = npc_id
	open_count += 1
	_balloon = DialogueManager.show_dialogue_balloon_scene(
		BALLOON_SCENE,
		resource,
		"start",
		[QuestService, ProgressionService, VendorService, InnService, CaveService]
	)
	dialogue_opened.emit(npc_id)
	WindowManager.open(WindowManager.DIALOGUE)
	return true


func _on_dialogue_ended(_resource: DialogueResource) -> void:
	_balloon = null
	WindowManager.close(WindowManager.DIALOGUE)
	dialogue_closed.emit()
