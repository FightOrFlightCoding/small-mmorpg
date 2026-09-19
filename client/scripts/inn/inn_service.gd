extends Node

## Sends inn rest/heal/bind intentions. Outcomes stay server-authoritative.

signal inn_opened(npc_id: String)
signal inn_closed

var last_npc_id: String = ""


func _ready() -> void:
	if NetworkService.interaction_result_received.is_connected(_on_interaction_result):
		NetworkService.interaction_result_received.disconnect(_on_interaction_result)
	NetworkService.interaction_result_received.connect(_on_interaction_result, CONNECT_DEFERRED)
	if not AppState.logged_out.is_connected(reset):
		AppState.logged_out.connect(reset)


func reset() -> void:
	last_npc_id = ""
	inn_closed.emit()


func reset_for_tests() -> void:
	reset()


func open_from_dialogue() -> void:
	if last_npc_id.is_empty():
		return
	inn_opened.emit(last_npc_id)


func request_rest() -> void:
	if last_npc_id.is_empty():
		return
	NetworkService.send_inn_rest(last_npc_id, "inn")


func request_heal() -> void:
	if last_npc_id.is_empty():
		return
	NetworkService.send_inn_rest(last_npc_id, "healer")


func request_respec() -> String:
	if last_npc_id.is_empty():
		return ""
	return ProgressionService.request_respec(last_npc_id)


func _on_interaction_result(payload: Dictionary) -> void:
	if not bool(payload.get("result_ok", false)):
		return
	var npc_id := String(payload.get("target_id", ""))
	if npc_id.is_empty():
		return
	var services: Array = MatchProtocol.string_ids(payload.get("services", payload.get("available_service_ids", [])))
	if services.find("inn") >= 0 or services.find("healer") >= 0 or services.find("respec") >= 0:
		last_npc_id = npc_id
