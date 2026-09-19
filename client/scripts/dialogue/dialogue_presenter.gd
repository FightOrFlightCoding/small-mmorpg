class_name DialoguePresenter
extends Node

## Opens the reusable NPC window after a matching INTERACTION_RESULT.

signal dialogue_opened(npc_id: String)
signal dialogue_closed

const LOADING_TIMEOUT_SEC := 2.0

var pending_request_id: String = ""
var pending_npc_id: String = ""
var last_opened_npc_id: String = ""
var last_session_id: String = ""
var open_count: int = 0
var _window: NpcInteractionWindow
var _choice_request_id: String = ""
var _suspended_for_vendor: bool = false
var _loading_timer: Timer


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	_ensure_window()
	# Immediate (not deferred) so a throw in Vendor/Inn/Cave cannot swallow the result.
	if not NetworkService.interaction_result_received.is_connected(handle_interaction_result):
		NetworkService.interaction_result_received.connect(handle_interaction_result)
	if not WindowManager.window_closed.is_connected(_on_window_closed):
		WindowManager.window_closed.connect(_on_window_closed)
	if not VendorService.vendor_opened.is_connected(_on_vendor_opened):
		VendorService.vendor_opened.connect(_on_vendor_opened)
	if not VendorService.vendor_closed.is_connected(_on_vendor_closed):
		VendorService.vendor_closed.connect(_on_vendor_closed)
	if not AppState.recoverable_error.is_connected(_on_recoverable_error):
		AppState.recoverable_error.connect(_on_recoverable_error)


func _exit_tree() -> void:
	if NetworkService.interaction_result_received.is_connected(handle_interaction_result):
		NetworkService.interaction_result_received.disconnect(handle_interaction_result)


func is_open() -> bool:
	return _window != null and _window.is_open()


func note_intent(npc_id: String, request_id: String) -> void:
	pending_npc_id = npc_id
	pending_request_id = request_id
	_ensure_window()
	_window.show_loading(_npc_name(npc_id))
	WindowManager.open(WindowManager.DIALOGUE)
	_arm_loading_timeout()


func handle_interaction_result(result: Dictionary) -> bool:
	var request_id := String(result.get("request_id", result.get("requestId", "")))
	var target_id := String(result.get("target_id", result.get("targetId", "")))
	var session_id := String(result.get("interaction_session_id", result.get("interactionSessionId", "")))
	if _matches_pending_intent(request_id, target_id):
		if not bool(result.get("result_ok", false)):
			_show_intent_error(pending_npc_id, result)
			_clear_pending_intent()
			return false
		var npc_id := pending_npc_id
		if npc_id.is_empty():
			npc_id = target_id
		var opened := _present(npc_id, result)
		if opened:
			_clear_pending_intent()
		return opened
	if request_id == _choice_request_id and not _choice_request_id.is_empty():
		_choice_request_id = ""
		_stop_loading_timer()
		if not bool(result.get("result_ok", false)):
			_show_intent_error(last_opened_npc_id, result)
			return false
		return _present(last_opened_npc_id, result)
	if not session_id.is_empty() and session_id == last_session_id:
		var code := String(result.get("code", ""))
		if not bool(result.get("result_ok", false)) and _is_session_terminal(code):
			_invalidate(code)
			return false
		if bool(result.get("result_ok", false)) or not String(result.get("current_node_id", result.get("currentNodeId", ""))).is_empty():
			var npc_id := last_opened_npc_id
			if npc_id.is_empty():
				npc_id = target_id
			return _present(npc_id, result)
		if not bool(result.get("result_ok", false)):
			_invalidate(code)
			return false
	return false


func close_dialogue(send_close: bool = true) -> void:
	var session := last_session_id
	var npc_id := last_opened_npc_id
	if send_close and not session.is_empty() and not npc_id.is_empty() and not NetworkService.match_id.is_empty():
		NetworkService.send_interaction_close(session, npc_id, MatchProtocol.new_request_id())
	_clear_pending_intent()
	_choice_request_id = ""
	_finish_close()


func _present(npc_id: String, result: Dictionary) -> bool:
	_ensure_window()
	QuestService.set_speaker(npc_id)
	last_opened_npc_id = npc_id
	var session := String(result.get("interaction_session_id", result.get("interactionSessionId", last_session_id)))
	var is_new_session := last_session_id.is_empty() or session != last_session_id
	last_session_id = session
	var node_id := String(result.get("current_node_id", result.get("currentNodeId", "")))
	var option_ids: Array = MatchProtocol.string_ids(result.get("allowed_option_ids", result.get("allowedOptionIds", [])))
	var service_ids: Array = MatchProtocol.string_ids(result.get("available_service_ids", result.get("services", [])))
	var dialogue_id := String(result.get("dialogue_id", result.get("dialogueId", "")))
	if dialogue_id.is_empty():
		var npc: Dictionary = ContentRegistry.get_by_id(npc_id)
		dialogue_id = String(npc.get("dialogueId", ""))
	# Present before stopping the timer so a content throw cannot leave waiting copy
	# with no timeout armed. present() itself clears loading first.
	_window.present({
		"npc_id": npc_id,
		"npc_name": _npc_name(npc_id),
		"interaction_session_id": last_session_id,
		"current_node_id": node_id,
		"text": _node_text(dialogue_id, node_id),
		"options": _option_rows(dialogue_id, node_id, option_ids),
		"services": service_ids,
	})
	_stop_loading_timer()
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
	_arm_loading_timeout()
	NetworkService.send_dialogue_choose(last_session_id, option_id, _choice_request_id)


func _on_service(service_id: String) -> void:
	match service_id:
		"quest_offer":
			QuestService.request_accept_offered(last_session_id, last_opened_npc_id)
		"quest_turn_in":
			QuestService.request_turn_in_offered(last_session_id, last_opened_npc_id)
		"vendor":
			_suspend_for_vendor()
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
	_clear_pending_intent()
	_choice_request_id = ""
	_finish_close()


func _finish_close() -> void:
	_stop_loading_timer()
	_suspended_for_vendor = false
	QuestService.set_speaker("")
	last_session_id = ""
	if VendorService.is_open():
		VendorService.reset()
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
	if not _window.loading_timed_out.is_connected(_on_window_loading_timeout):
		_window.loading_timed_out.connect(_on_window_loading_timeout)


func _matches_pending_intent(request_id: String, target_id: String) -> bool:
	if pending_request_id.is_empty() and pending_npc_id.is_empty():
		return false
	if not pending_request_id.is_empty() and request_id == pending_request_id:
		return true
	if not pending_npc_id.is_empty() and target_id == pending_npc_id:
		return true
	return false


func _show_intent_error(npc_id: String, result: Dictionary) -> void:
	_stop_loading_timer()
	_ensure_window()
	_window.show_error(_npc_name(npc_id), _error_message(result))


func _clear_pending_intent() -> void:
	pending_request_id = ""
	pending_npc_id = ""
	_stop_loading_timer()


func _arm_loading_timeout() -> void:
	_ensure_loading_timer()
	_loading_timer.start(LOADING_TIMEOUT_SEC)


func _stop_loading_timer() -> void:
	if _loading_timer != null:
		_loading_timer.stop()


func _ensure_loading_timer() -> void:
	if _loading_timer != null and is_instance_valid(_loading_timer):
		return
	_loading_timer = Timer.new()
	_loading_timer.one_shot = true
	_loading_timer.process_callback = Timer.TIMER_PROCESS_IDLE
	_loading_timer.process_mode = Node.PROCESS_MODE_ALWAYS
	_loading_timer.timeout.connect(_on_loading_timeout)
	add_child(_loading_timer)


func _on_window_loading_timeout() -> void:
	# The window already replaced the waiting copy. Keep the pending request so a
	# late INTERACTION_RESULT can still present.
	pass


func _on_loading_timeout() -> void:
	if _window == null or not _window.is_loading():
		return
	var npc_id := pending_npc_id if not pending_npc_id.is_empty() else last_opened_npc_id
	_show_intent_error(npc_id, {"code": "interaction_timeout", "message": "The server did not answer."})


func _on_recoverable_error(code: String, message: String) -> void:
	if _window == null or not _window.is_loading():
		return
	if pending_request_id.is_empty() and _choice_request_id.is_empty():
		return
	if not _is_unanswered_interact_code(code):
		return
	_show_intent_error(
		pending_npc_id if not pending_npc_id.is_empty() else last_opened_npc_id,
		{"code": code, "message": message}
	)
	_clear_pending_intent()
	_choice_request_id = ""


func _is_unanswered_interact_code(code: String) -> bool:
	if code == "rate_limited" or code == "invalid_request_id" or code == "payload_too_large":
		return true
	if code == "malformed_json" or code == "unknown_opcode" or code == "protocol_mismatch":
		return true
	if code == "invalid_payload" or code == "invalid_id" or code.begins_with("unknown_field"):
		return true
	return false


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
	var lines: Variant = node.get("lines", [])
	if typeof(lines) != TYPE_ARRAY:
		return ""
	var parts: PackedStringArray = PackedStringArray()
	for entry in lines:
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		parts.append(_localized_text(entry))
	return "\n".join(parts)


func _option_rows(dialogue_id: String, node_id: String, allowed_ids: Array) -> Array:
	var node := _node(dialogue_id, node_id)
	var rows: Array = []
	var options: Variant = node.get("options", [])
	if typeof(options) != TYPE_ARRAY:
		return rows
	for entry in options:
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		var option: Dictionary = entry
		var option_id := String(option.get("id", ""))
		if option_id.is_empty():
			continue
		if not allowed_ids.is_empty() and allowed_ids.find(option_id) < 0:
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
	var message := String(result.get("message", ""))
	if not message.is_empty():
		return message
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
		"rate_limited":
			return "Too many interact requests."
		"invalid_request_id":
			return "The server rejected that interaction."
		_:
			return "The server rejected that interaction."


func _is_session_terminal(code: String) -> bool:
	match code:
		"session_expired", "session_invalidated", "invalid_session", "out_of_range", "player_dead", "link_dead", "character_missing", "already_transferring":
			return true
		_:
			return false


func _suspend_for_vendor() -> void:
	_suspended_for_vendor = true
	if _window != null:
		_window.visible = false


func _on_vendor_opened(_npc_id: String, _vendor_id: String) -> void:
	_suspend_for_vendor()


func _on_vendor_closed() -> void:
	if not _suspended_for_vendor:
		return
	_suspended_for_vendor = false
	if last_session_id.is_empty():
		return
	if _window != null:
		_window.visible = true
	WindowManager.open(WindowManager.DIALOGUE)
