extends Node

## Sends inn rest/heal/bind intentions. Outcomes stay server-authoritative.

var last_npc_id: String = ""


func _ready() -> void:
	if not NetworkService.interaction_result_received.is_connected(_on_interaction_result):
		NetworkService.interaction_result_received.connect(_on_interaction_result)
	if not AppState.logged_out.is_connected(reset):
		AppState.logged_out.connect(reset)


func reset() -> void:
	last_npc_id = ""


func reset_for_tests() -> void:
	reset()


func request_rest() -> void:
	if last_npc_id.is_empty():
		return
	NetworkService.send_inn_rest(last_npc_id, "inn")


func request_heal() -> void:
	if last_npc_id.is_empty():
		return
	NetworkService.send_inn_rest(last_npc_id, "healer")


func _on_interaction_result(payload: Dictionary) -> void:
	if not bool(payload.get("result_ok", false)):
		return
	var npc_id := String(payload.get("target_id", ""))
	if npc_id.is_empty():
		return
	var services: Array = payload.get("services", [])
	if services.has("inn") or services.has("healer"):
		last_npc_id = npc_id
