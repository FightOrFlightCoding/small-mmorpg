extends Node

## Project-owned Nakama boundary. Caches the session in memory and never logs tokens.

signal authentication_started
signal authentication_finished(success: bool, message: String)
signal character_bootstrap_finished(success: bool, created: bool, message: String)
signal zone_join_finished(success: bool, message: String)
signal chat_message_received(payload: Dictionary)
signal chat_presence_received(payload: Dictionary)
signal chat_error(code: String, message: String)
signal interaction_result_received(payload: Dictionary)
signal action_result_received(payload: Dictionary)
signal quest_state_received(payload: Dictionary)
signal combat_event_received(payload: Dictionary)
signal inventory_state_received(payload: Dictionary)
signal logged_out

const CHARACTER_BOOTSTRAP_RPC := "character_bootstrap"
const FULL_STATE_TIMEOUT_SEC := 10.0

var backend: RefCounted
var last_auth_attempted: bool = false
var socket_connected: bool = false
var match_id: String = ""
var zone_chat_id: String = ""

var _device_id: String = ""
var _username: String = ""
var _got_full_state: bool = false
var _match_signals_connected: bool = false
var _chat_signals_connected: bool = false


func is_authentication_configured() -> bool:
	return true


func authenticate_device(device_id: String, username: String = "") -> void:
	last_auth_attempted = true
	_device_id = device_id
	_username = username
	authentication_started.emit()
	AppState.notify_loading_started("auth")
	var auth: Dictionary = await _backend().authenticate_device(device_id, username)
	if not bool(auth.get("ok", false)):
		_fail_auth(auth)
		return
	var socket: Dictionary = await _backend().connect_socket()
	if not bool(socket.get("ok", false)):
		_fail_auth(socket)
		return
	socket_connected = true
	_connect_match_signals()
	_connect_chat_signals()
	AppState.notify_authenticated(String(auth.get("user_id", "")), String(auth.get("username", username)))
	AppState.notify_loading_completed("auth")
	authentication_finished.emit(true, "")


func bootstrap_character(proposed_name: String = "") -> void:
	AppState.notify_loading_started("character")
	var session_ok := await ensure_session()
	if not session_ok:
		AppState.notify_loading_completed("character")
		character_bootstrap_finished.emit(false, false, AppState.last_error_message)
		return
	var payload := "{}"
	if not proposed_name.is_empty():
		payload = JSON.stringify({"name": proposed_name})
	var rpc_result: Dictionary = await _backend().rpc(CHARACTER_BOOTSTRAP_RPC, payload)
	if not bool(rpc_result.get("ok", false)):
		_fail_character(rpc_result)
		return
	var parsed: Variant = JSON.parse_string(String(rpc_result.get("payload", "")))
	if typeof(parsed) != TYPE_DICTIONARY:
		_fail_character({"code": "malformed_json", "message": "The character response was not valid JSON."})
		return
	var view := _character_view(parsed)
	if view.is_empty():
		_fail_character({"code": "malformed_json", "message": "The character response was missing required fields."})
		return
	var created := bool(view.get("created", false))
	AppState.notify_character_loaded(view, created)
	AppState.notify_loading_completed("character")
	character_bootstrap_finished.emit(true, created, "")


func join_starter_zone() -> bool:
	AppState.notify_loading_started("zone")
	var session_ok := await ensure_session()
	if not session_ok:
		AppState.notify_loading_completed("zone")
		zone_join_finished.emit(false, AppState.last_error_message)
		return false
	_connect_match_signals()
	_connect_chat_signals()
	_got_full_state = false
	var rpc_result: Dictionary = await _backend().rpc(MatchProtocol.FIND_OR_CREATE_STARTER_ZONE_RPC, "{}")
	if not bool(rpc_result.get("ok", false)):
		_fail_zone(rpc_result)
		return false
	var found: Dictionary = MatchProtocol.parse_find_or_create(
		String(rpc_result.get("payload", "")),
		ContentRegistry.get_content_hash()
	)
	if not bool(found.get("ok", false)):
		_fail_zone(found)
		return false
	var join_result: Dictionary = await _backend().join_match(
		String(found["match_id"]),
		MatchProtocol.join_metadata(ContentRegistry.get_content_hash())
	)
	if not bool(join_result.get("ok", false)):
		_fail_zone(join_result)
		return false
	match_id = String(join_result.get("match_id", found["match_id"]))
	var received := await _wait_for_full_state(FULL_STATE_TIMEOUT_SEC)
	if not received:
		if not AppState.has_fatal_error:
			_fail_zone({"code": "full_state_timeout", "message": "The server did not send a valid full state."})
		else:
			AppState.notify_loading_completed("zone")
			zone_join_finished.emit(false, AppState.last_error_message)
		return false
	AppState.notify_loading_completed("zone")
	zone_join_finished.emit(true, "")
	return true


func send_input(seq: int, axis_x: float, axis_y: float) -> Dictionary:
	if match_id.is_empty():
		return {"ok": false, "code": "not_in_match", "message": "Not in a match."}
	return await _backend().send_match_state(
		MatchProtocol.CLIENT_INPUT,
		MoveIntent.payload_json(seq, Vector2(axis_x, axis_y))
	)


func send_interact(target_id: String, request_id: String) -> Dictionary:
	if match_id.is_empty():
		return {"ok": false, "code": "not_in_match", "message": "Not in a match."}
	return await _backend().send_match_state(
		MatchProtocol.CLIENT_INTERACT,
		MatchProtocol.client_envelope_json({"targetId": target_id, "requestId": request_id})
	)


func send_quest_accept(quest_id: String, request_id: String = "") -> Dictionary:
	if match_id.is_empty():
		return {"ok": false, "code": "not_in_match", "message": "Not in a match."}
	var rid := request_id
	if rid.is_empty():
		rid = MatchProtocol.new_request_id()
	return await _backend().send_match_state(
		MatchProtocol.CLIENT_QUEST_ACCEPT,
		MatchProtocol.client_envelope_json({"questId": quest_id, "requestId": rid})
	)


func send_attack(target_id: String, request_id: String) -> Dictionary:
	if match_id.is_empty():
		return {"ok": false, "code": "not_in_match", "message": "Not in a match."}
	return await _backend().send_match_state(
		MatchProtocol.CLIENT_ATTACK,
		MatchProtocol.client_envelope_json({"targetId": target_id, "requestId": request_id})
	)


func send_pickup(loot_id: String, request_id: String) -> Dictionary:
	if match_id.is_empty():
		return {"ok": false, "code": "not_in_match", "message": "Not in a match."}
	return await _backend().send_match_state(
		MatchProtocol.CLIENT_PICKUP,
		MatchProtocol.client_envelope_json({"lootId": loot_id, "requestId": request_id})
	)


func join_zone_chat() -> bool:
	_connect_chat_signals()
	if not zone_chat_id.is_empty():
		await leave_zone_chat()
	if not _backend().has_method("join_chat"):
		_fail_chat("chat_join_failed", "Zone chat is unavailable.")
		return false
	var joined: Dictionary = await _backend().join_chat(
		ZoneChat.ROOM_NAME,
		ZoneChat.CHANNEL_TYPE_ROOM,
		false,
		false
	)
	if not bool(joined.get("ok", false)):
		_fail_chat(
			String(joined.get("code", "chat_join_failed")),
			String(joined.get("message", "Could not join zone chat."))
		)
		return false
	zone_chat_id = String(joined.get("channel_id", ""))
	if zone_chat_id.is_empty():
		_fail_chat("chat_join_failed", "Zone chat did not return a channel id.")
		return false
	return true


func leave_zone_chat() -> void:
	if zone_chat_id.is_empty():
		return
	var channel_id := zone_chat_id
	zone_chat_id = ""
	if _backend().has_method("leave_chat"):
		await _backend().leave_chat(channel_id)


func send_zone_chat(text: String) -> Dictionary:
	var reason := ZoneChat.reject_reason(text)
	if not reason.is_empty():
		var message := "Chat message is empty." if reason == "empty_message" else "Chat message exceeds 200 characters."
		_fail_chat(reason, message)
		return {"ok": false, "code": reason, "message": message}
	if zone_chat_id.is_empty() or not _backend().has_method("send_chat_message"):
		_fail_chat("chat_send_failed", "Join zone chat before sending a message.")
		return {"ok": false, "code": "chat_send_failed", "message": "Join zone chat before sending a message."}
	var sent: Dictionary = await _backend().send_chat_message(zone_chat_id, ZoneChat.payload(text))
	if not bool(sent.get("ok", false)):
		_fail_chat(
			String(sent.get("code", "chat_send_failed")),
			String(sent.get("message", "The server rejected the chat message."))
		)
		return sent
	return {"ok": true}


func request_resync() -> bool:
	if match_id.is_empty():
		AppState.report_recoverable("not_in_match", "Join the starter zone before requesting a resync.")
		return false
	_got_full_state = false
	var sent: Dictionary = await _backend().send_match_state(
		MatchProtocol.CLIENT_RESYNC_REQUEST,
		MatchProtocol.client_envelope_json()
	)
	if not bool(sent.get("ok", false)):
		AppState.report_recoverable(String(sent.get("code", "rpc_failed")), String(sent.get("message", "Resync failed.")))
		return false
	return await _wait_for_full_state(FULL_STATE_TIMEOUT_SEC)


func ensure_session() -> bool:
	if not AppState.is_authenticated and _device_id.is_empty():
		AppState.report_recoverable("unauthenticated", "Sign-in is required.")
		return false
	if not _backend().is_session_expired():
		return true
	AppState.notify_loading_started("session")
	var refreshed: Dictionary = await _backend().refresh_session()
	if bool(refreshed.get("ok", false)):
		AppState.notify_loading_completed("session")
		return true
	var reauth: Dictionary = await _backend().authenticate_device(_device_id, _username)
	if not bool(reauth.get("ok", false)):
		socket_connected = false
		match_id = ""
		zone_chat_id = ""
		AppState.notify_logged_out()
		AppState.report_recoverable(
			String(reauth.get("code", "session_expired")),
			String(reauth.get("message", "The session expired and could not be renewed."))
		)
		AppState.notify_loading_completed("session")
		return false
	var socket: Dictionary = await _backend().connect_socket()
	if not bool(socket.get("ok", false)):
		socket_connected = false
		match_id = ""
		zone_chat_id = ""
		AppState.notify_logged_out()
		AppState.report_recoverable(
			String(socket.get("code", "socket_failed")),
			String(socket.get("message", "The session expired and the realtime connection could not be restored."))
		)
		AppState.notify_loading_completed("session")
		return false
	socket_connected = true
	_connect_match_signals()
	_connect_chat_signals()
	AppState.notify_authenticated(String(reauth.get("user_id", AppState.user_id)), String(reauth.get("username", _username)))
	AppState.notify_loading_completed("session")
	return true


func logout() -> void:
	await leave_zone_chat()
	if _backend().has_method("leave_match"):
		await _backend().leave_match()
	await _backend().logout()
	socket_connected = false
	match_id = ""
	zone_chat_id = ""
	_got_full_state = false
	_device_id = ""
	_username = ""
	AppState.notify_logged_out()
	logged_out.emit()


func reset_for_tests() -> void:
	_disconnect_match_signals()
	_disconnect_chat_signals()
	backend = null
	last_auth_attempted = false
	socket_connected = false
	match_id = ""
	zone_chat_id = ""
	_got_full_state = false
	_match_signals_connected = false
	_chat_signals_connected = false
	_device_id = ""
	_username = ""


func _backend() -> RefCounted:
	if backend == null:
		backend = NakamaNetworkBackend.new()
	return backend


func _connect_match_signals() -> void:
	var current: RefCounted = _backend()
	if not current.has_signal("match_state_received"):
		return
	if current.match_state_received.is_connected(_on_match_state):
		_match_signals_connected = true
		return
	current.match_state_received.connect(_on_match_state)
	_match_signals_connected = true


func _disconnect_match_signals() -> void:
	if backend == null or not backend.has_signal("match_state_received"):
		_match_signals_connected = false
		return
	if backend.match_state_received.is_connected(_on_match_state):
		backend.match_state_received.disconnect(_on_match_state)
	_match_signals_connected = false


func _connect_chat_signals() -> void:
	var current: RefCounted = _backend()
	if not current.has_signal("channel_message_received"):
		return
	if current.channel_message_received.is_connected(_on_channel_message):
		_chat_signals_connected = true
		return
	current.channel_message_received.connect(_on_channel_message)
	if current.has_signal("channel_presence_received") and not current.channel_presence_received.is_connected(_on_channel_presence):
		current.channel_presence_received.connect(_on_channel_presence)
	_chat_signals_connected = true


func _disconnect_chat_signals() -> void:
	if backend == null:
		_chat_signals_connected = false
		return
	if backend.has_signal("channel_message_received") and backend.channel_message_received.is_connected(_on_channel_message):
		backend.channel_message_received.disconnect(_on_channel_message)
	if backend.has_signal("channel_presence_received") and backend.channel_presence_received.is_connected(_on_channel_presence):
		backend.channel_presence_received.disconnect(_on_channel_presence)
	_chat_signals_connected = false


func _on_channel_message(payload: Dictionary) -> void:
	if not zone_chat_id.is_empty() and String(payload.get("channel_id", "")) != zone_chat_id:
		return
	chat_message_received.emit(payload)


func _on_channel_presence(payload: Dictionary) -> void:
	if not zone_chat_id.is_empty() and String(payload.get("channel_id", "")) != zone_chat_id:
		return
	chat_presence_received.emit(payload)


func _fail_chat(code: String, message: String) -> void:
	AppState.report_recoverable(code, message)
	chat_error.emit(code, message)


func _on_match_state(opcode: int, payload: String) -> void:
	var expected := ContentRegistry.get_content_hash()
	if opcode == MatchProtocol.SERVER_FULL_STATE:
		var parsed: Dictionary = MatchProtocol.parse_full_state(payload, expected)
		if not bool(parsed.get("ok", false)):
			_fail_zone(parsed)
			return
		AppState.notify_zone_state(parsed["view"], true)
		_got_full_state = true
		return
	if opcode == MatchProtocol.SERVER_SNAPSHOT:
		if not AppState.has_zone_state:
			return
		var snap: Dictionary = MatchProtocol.parse_snapshot(payload, expected, AppState.zone_view)
		if not bool(snap.get("ok", false)):
			_fail_zone(snap)
			return
		AppState.notify_zone_state(snap["view"], false)
		return
	if opcode == MatchProtocol.SERVER_SYSTEM_MESSAGE:
		var sys: Dictionary = MatchProtocol.parse_system_message(payload)
		var code := String(sys.get("code", "system"))
		var message := String(sys.get("message", "The server rejected the request."))
		if MatchProtocol.is_compatibility_code(code):
			_fail_zone({"code": code, "message": message})
			return
		AppState.report_recoverable(code, message)
		return
	if opcode == MatchProtocol.SERVER_INTERACTION_RESULT:
		var interaction: Dictionary = MatchProtocol.parse_interaction_result(payload)
		if not bool(interaction.get("ok", false)):
			AppState.report_recoverable(String(interaction.get("code", "interaction_failed")), String(interaction.get("message", "Interaction failed.")))
			return
		interaction_result_received.emit(interaction)
		return
	if opcode == MatchProtocol.SERVER_ACTION_RESULT:
		var action: Dictionary = MatchProtocol.parse_action_result(payload)
		if not bool(action.get("ok", false)):
			AppState.report_recoverable(String(action.get("code", "action_failed")), String(action.get("message", "The action failed.")))
			return
		action_result_received.emit(action)
		return
	if opcode == MatchProtocol.SERVER_QUEST_STATE:
		var quests: Dictionary = MatchProtocol.parse_quest_state(payload)
		if not bool(quests.get("ok", false)):
			AppState.report_recoverable(String(quests.get("code", "quest_state_failed")), String(quests.get("message", "Quest state was invalid.")))
			return
		quest_state_received.emit(quests)
		return
	if opcode == MatchProtocol.SERVER_COMBAT_EVENT:
		var combat: Dictionary = MatchProtocol.parse_combat_event(payload)
		if not bool(combat.get("ok", false)):
			AppState.report_recoverable(String(combat.get("code", "combat_event_failed")), String(combat.get("message", "Combat event was invalid.")))
			return
		combat_event_received.emit(combat)
		return
	if opcode == MatchProtocol.SERVER_INVENTORY_STATE:
		var inventory: Dictionary = MatchProtocol.parse_inventory_state(payload)
		if not bool(inventory.get("ok", false)):
			AppState.report_recoverable(String(inventory.get("code", "inventory_state_failed")), String(inventory.get("message", "Inventory state was invalid.")))
			return
		inventory_state_received.emit(inventory)
		return


func _wait_for_full_state(timeout_sec: float) -> bool:
	if _got_full_state:
		return true
	var tree := get_tree()
	if tree == null:
		return _got_full_state
	var elapsed := 0.0
	var step := 0.05
	while elapsed < timeout_sec and not _got_full_state and not AppState.has_fatal_error:
		await tree.create_timer(step).timeout
		elapsed += step
	return _got_full_state and not AppState.has_fatal_error


func _fail_auth(result: Dictionary) -> void:
	socket_connected = false
	AppState.notify_logged_out()
	AppState.report_recoverable(
		String(result.get("code", "authentication_failed")),
		String(result.get("message", "Could not sign in to Nakama."))
	)
	AppState.notify_loading_completed("auth")
	authentication_finished.emit(false, AppState.last_error_message)


func _fail_character(result: Dictionary) -> void:
	AppState.report_recoverable(
		String(result.get("code", "rpc_failed")),
		String(result.get("message", "Could not load the character."))
	)
	AppState.notify_loading_completed("character")
	character_bootstrap_finished.emit(false, false, AppState.last_error_message)


func _fail_zone(result: Dictionary) -> void:
	var code := String(result.get("code", "join_failed"))
	var message := String(result.get("message", "Could not join the starter zone."))
	if MatchProtocol.is_compatibility_code(code):
		AppState.report_fatal_compatibility(code, message)
	else:
		AppState.report_recoverable(code, message)
	AppState.notify_loading_completed("zone")
	zone_join_finished.emit(false, AppState.last_error_message)


func _character_view(data: Dictionary) -> Dictionary:
	if typeof(data.get("characterId", null)) != TYPE_STRING:
		return {}
	if typeof(data.get("name", null)) != TYPE_STRING:
		return {}
	if typeof(data.get("storageVersion", null)) != TYPE_STRING:
		return {}
	if typeof(data.get("baseStats", null)) != TYPE_DICTIONARY:
		return {}
	if typeof(data.get("position", null)) != TYPE_DICTIONARY:
		return {}
	var stats: Dictionary = data["baseStats"]
	var position: Dictionary = data["position"]
	return {
		"character_id": String(data["characterId"]),
		"name": String(data["name"]),
		"created": bool(data.get("created", false)),
		"storage_version": String(data["storageVersion"]),
		"content_id": String(data.get("contentId", "player.base")),
		"zone_id": String(data.get("zoneId", "zone.starter")),
		"base_stats": stats.duplicate(true),
		"position": position.duplicate(true),
	}
