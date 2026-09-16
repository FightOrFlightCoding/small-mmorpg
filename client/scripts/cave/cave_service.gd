extends Node

## Requests cave entry and exit after a server-approved interaction.

signal cave_opened(npc_id: String, mode: String)
signal cave_closed

var last_npc_id: String = ""
var last_exit_npc_id: String = ""
var transferring: bool = false


func _ready() -> void:
	if not NetworkService.interaction_result_received.is_connected(_on_interaction_result):
		NetworkService.interaction_result_received.connect(_on_interaction_result)
	if not NetworkService.action_result_received.is_connected(_on_action_result):
		NetworkService.action_result_received.connect(_on_action_result)
	if not AppState.logged_out.is_connected(reset):
		AppState.logged_out.connect(reset)


func reset() -> void:
	last_npc_id = ""
	last_exit_npc_id = ""
	transferring = false
	cave_closed.emit()


func reset_for_tests() -> void:
	reset()


func open_from_dialogue(mode: String = "enter") -> void:
	if mode == "exit":
		if last_exit_npc_id.is_empty():
			return
		cave_opened.emit(last_exit_npc_id, "exit")
		return
	if last_npc_id.is_empty():
		return
	cave_opened.emit(last_npc_id, "enter")


func request_enter() -> void:
	if last_npc_id.is_empty():
		return
	NetworkService.send_cave_enter(last_npc_id)


func request_exit() -> void:
	if last_exit_npc_id.is_empty():
		return
	NetworkService.send_cave_exit(last_exit_npc_id)


func _on_interaction_result(payload: Dictionary) -> void:
	if not bool(payload.get("result_ok", false)):
		return
	var npc_id := String(payload.get("target_id", ""))
	if npc_id.is_empty():
		return
	var services: Array = payload.get("services", [])
	if services.has("cave_entrance"):
		last_npc_id = npc_id
	if services.has("cave_exit"):
		last_exit_npc_id = npc_id


func _on_action_result(payload: Dictionary) -> void:
	if not bool(payload.get("result_ok", false)):
		return
	var ticket_id := String(payload.get("ticket_id", ""))
	if ticket_id.is_empty():
		return
	if transferring:
		return
	transferring = true
	await NetworkService.begin_transfer(payload)
