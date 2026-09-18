class_name DialoguePresenter
extends Node

## Opens the reusable NPC window after a matching INTERACTION_RESULT.

signal dialogue_opened(npc_id: String)
signal dialogue_closed

var pending_request_id: String = ""
var pending_npc_id: String = ""
var last_opened_npc_id: String = ""
var last_session_id: String = ""
var open_count: int = 0
var _window: NpcInteractionWindow
var _choice_request_id: String = ""


func _ready() -> void:
	_ensure_window()
	if not WindowManager.window_closed.is_connected(_on_window_closed):
		WindowManager.window_closed.connect(_on_window_closed)


func is_open() -> bool:
	return _window != null and _window.is_open()


func note_intent(npc_id: String, request_id: String) -> void:
	pending_npc_id = npc_id
	pending_request_id = request_id
	_ensure_window()
	_window.show_loading(_npc_name(npc_id))
	WindowManager.open(WindowManager.DIALOGUE)


func handle_interaction_result(result: Dictionary) -> bool:
	var request_id := String(result.get("request_id", ""))
	var target_id := String(result.get("target_id", ""))
	var session_id := String(result.get("interaction_session_id", ""))
	if request_id == pending_request_id and not pending_request_id.is_empty():
		if not bool(result.get("result_ok", false)):
			_ensure_window()
			_window.show_error(_npc_name(pending_npc_id), _error_message(result))
			pending_request_id = ""
			pending_npc_id = ""
			return false
		var npc_id := pending_npc_id
		if npc_id.is_empty():
			npc_id = target_id
		pending_request_id = ""
		pending_npc_id = ""
		return _present(npc_id, result)
	if request_id == _choice_request_id and not _choice_request_id.is_empty():
		_choice_request_id = ""
		if not bool(result.get("result_ok", false)):
			_ensure_window()
			_window.show_error(_npc_name(last_opened_npc_id), _error_message(result))
			return false
		return _present(last_opened_npc_id, result)
	if not session_id.is_empty() and session_id == last_session_id and not bool(result.get("result_ok", false)):
		_invalidate(String(result.get("code", "session_invalidated")))
		return false
	return false


func close_dialogue(send_close: bool = true) -> void:
	var session := last_session_id
	var npc_id := last_opened_npc_id
	if send_close and not session.is_empty() and not npc_id.is_empty() and not NetworkService.match_id.is_empty():
		NetworkService.send_interaction_close(session, npc_id, MatchProtocol.new_request_id())
	pending_request_id = ""
	pending_npc_id = ""
	_choice_request_id = ""
	_finish_close()


func _present(npc_id: String, result: Dictionary) -> bool:
	_ensure_window()
	QuestService.set_speaker(npc_id)
	last_opened_npc_id = npc_id
	var session := String(result.get("interaction_session_id", last_session_id))
	var is_new_session := open_count == 0 or session != last_session_id or not WindowManager.is_open(WindowManager.DIALOGUE)
	last_session_id = session
	var node_id := String(result.get("current_node_id", ""))
	var option_ids: Array = result.get("allowed_option_ids", [])
	var service_ids: Array = result.get("available_service_ids", result.get("services", []))
	var dialogue_id := String(result.get("dialogue_id", ""))
	_window.present({
		"npc_id": npc_id,
		"npc_name": _npc_name(npc_id),
		"interaction_session_id": last_session_id,
		"current_node_id": node_id,
		"text": _node_text(dialogue_id, node_id),
		"options": _option_rows(dialogue_id, node_id, option_ids),
		"services": service_ids,
	})
	if is_new_session:
		open_count += 1
		dialogue_opened.emit(npc_id)
		WindowManager.open(WindowManager.DIALOGUE)
	return true


func _on_option(option_id: String) -> void:
	if last_session_id.is_empty() or option_id.is_empty():
		return
	_choice_request_id = MatchProtocol.new_request_id()
	_window.show_loading(_npc_name(last_opened_npc_id))
	NetworkService.send_dialogue_choose(last_session_id, option_id, _choice_request_id)


func _on_service(service_id: String) -> void:
	match service_id:
		"quest_offer":
			QuestService.request_accept_offered()
		"quest_turn_in":
			QuestService.request_turn_in_offered()
		"vendor":
			VendorService.open_from_dialogue()
		"inn":
			InnService.open_from_dialogue()
		"healer":
			InnService.request_heal()
		"cave_entrance":
			CaveService.request_enter()
		"cave_exit":
			CaveService.request_exit()
		"respec":
			InnService.request_respec()


func _on_close() -> void:
	close_dialogue(true)


func _on_window_closed(window_id: String) -> void:
	if window_id != WindowManager.DIALOGUE:
		return
	if last_session_id.is_empty() and pending_request_id.is_empty():
		return
	close_dialogue(true)


func _invalidate(_code: String) -> void:
	_finish_close()


func _finish_close() -> void:
	QuestService.set_speaker("")
	last_session_id = ""
	if _window != null:
		_window.close_window()
	if WindowManager.is_open(WindowManager.DIALOGUE):
		WindowManager.close(WindowManager.DIALOGUE)
		dialogue_closed.emit()


func _ensure_window() -> void:
	if _window != null and is_instance_valid(_window):
		return
	_window = NpcInteractionWindow.new()
	_window.name = "NpcInteractionWindow"
	add_child(_window)
	if not _window.option_chosen.is_connected(_on_option):
		_window.option_chosen.connect(_on_option)
	if not _window.service_chosen.is_connected(_on_service):
		_window.service_chosen.connect(_on_service)
	if not _window.close_requested.is_connected(_on_close):
		_window.close_requested.connect(_on_close)


func _npc_name(npc_id: String) -> String:
	var npc: Dictionary = ContentRegistry.get_by_id(npc_id)
	var name := String(npc.get("displayName", ""))
	if name.is_empty():
		return npc_id
	return name


func _node_text(dialogue_id: String, node_id: String) -> String:
	var node := _node(dialogue_id, node_id)
	if node.is_empty():
		return ""
	var lines: Array = node.get("lines", [])
	var parts: PackedStringArray = PackedStringArray()
	for entry in lines:
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		parts.append(_localized_text(entry))
	return "\n".join(parts)


func _option_rows(dialogue_id: String, node_id: String, allowed_ids: Array) -> Array:
	var node := _node(dialogue_id, node_id)
	var rows: Array = []
	var options: Array = node.get("options", [])
	for entry in options:
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		var option: Dictionary = entry
		var option_id := String(option.get("id", ""))
		if option_id.is_empty():
			continue
		if not allowed_ids.has(option_id) and not allowed_ids.is_empty():
			continue
		rows.append({
			"id": option_id,
			"text": _localized_text(option),
		})
	return rows


func _node(dialogue_id: String, node_id: String) -> Dictionary:
	if dialogue_id.is_empty() or node_id.is_empty():
		return {}
	var dialogue: Dictionary = ContentRegistry.get_by_id(dialogue_id)
	var nodes: Variant = dialogue.get("nodes", {})
	if typeof(nodes) != TYPE_DICTIONARY:
		return {}
	var node: Variant = (nodes as Dictionary).get(node_id, {})
	if typeof(node) != TYPE_DICTIONARY:
		return {}
	return node


func _localized_text(entry: Dictionary) -> String:
	var key := String(entry.get("textKey", ""))
	var fallback := String(entry.get("text", ""))
	if key.is_empty():
		return fallback
	var translated := tr(key)
	if translated.is_empty() or translated == key:
		return fallback
	return translated


func _error_message(result: Dictionary) -> String:
	var code := String(result.get("code", "interaction_failed"))
	match code:
		"out_of_range":
			return "You are too far away."
		"player_dead":
			return "You cannot talk while dead."
		"invalid_target":
			return "That person is not here."
		"link_dead":
			return "Your character is still in the world."
		"session_expired":
			return "The conversation expired."
		"invalid_option":
			return "That reply is not available."
		"invalid_session":
			return "The conversation is no longer valid."
		_:
			return "The server rejected that interaction."
