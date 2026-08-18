extends Node

## Sends audited GM RPC intentions. Never grants items, gold, XP, or location locally.

signal command_finished(payload: Dictionary)

const GM_COMMAND_RPC := "gm_command"

var last_result: Dictionary = {}
var last_error: String = ""
var last_code: String = ""


func _ready() -> void:
	if not NetworkService.gm_command_received.is_connected(_on_gm_command):
		NetworkService.gm_command_received.connect(_on_gm_command)
	if not AppState.logged_out.is_connected(reset):
		AppState.logged_out.connect(reset)


func reset() -> void:
	last_result = {}
	last_error = ""
	last_code = ""
	command_finished.emit({})


func reset_for_tests() -> void:
	reset()


func is_debug_panel_allowed() -> bool:
	return OS.is_debug_build()


func run_command(command: String, reason: String, extra: Dictionary = {}) -> void:
	last_error = ""
	last_code = ""
	var body: Dictionary = extra.duplicate(true)
	body["command"] = command
	body["reason"] = reason
	if not body.has("characterId") or String(body.get("characterId", "")).is_empty():
		body["characterId"] = String(AppState.character_view.get("character_id", ""))
	if not body.has("requestId") or String(body.get("requestId", "")).is_empty():
		body["requestId"] = MatchProtocol.new_request_id()
	NetworkService.rpc_gm(GM_COMMAND_RPC, body)


func _on_gm_command(payload: Dictionary) -> void:
	last_result = payload.duplicate(true)
	last_code = String(payload.get("code", ""))
	if payload.has("ok") and not bool(payload.get("ok", false)):
		last_error = last_code
	else:
		last_error = ""
	command_finished.emit(last_result)
	var ticket_id := String(payload.get("ticket_id", payload.get("ticketId", "")))
	var nested: Dictionary = {}
	if typeof(payload.get("result", null)) == TYPE_DICTIONARY:
		nested = payload["result"]
	if ticket_id.is_empty():
		ticket_id = String(nested.get("ticket_id", nested.get("ticketId", "")))
	if ticket_id.is_empty():
		return
	var destination := String(nested.get("destination_match_id", nested.get("destinationMatchId", "")))
	if destination.is_empty():
		return
	CaveService.transferring = true
	await NetworkService.begin_transfer({
		"ticket_id": ticket_id,
		"destination_match_id": destination,
	})
