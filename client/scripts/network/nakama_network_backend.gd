class_name NakamaNetworkBackend
extends RefCounted

## Thin Nakama SDK wrapper. Tokens stay on this object and are never logged.

signal match_state_received(opcode: int, payload: String)
signal channel_message_received(payload: Dictionary)
signal channel_presence_received(payload: Dictionary)
signal socket_closed

const HOST := "127.0.0.1"
const PORT := 7350
const SCHEME := "http"
const SERVER_KEY := "defaultkey"
const TIMEOUT_SEC := 10

var _client: NakamaClient
var _session: NakamaSession
var _socket: NakamaSocket
var _match_id: String = ""
var _closing: bool = false
var _socket_generation: int = 0
var _auth_mode: String = SessionCache.AUTH_MODE_DEVICE
var _device_id: String = ""


func is_session_expired() -> bool:
	if _session == null or _session.is_exception():
		return true
	return _session.expired or not _session.is_valid()


func is_socket_connected() -> bool:
	return _socket != null and _socket.is_connected_to_host()


func authenticate_device(device_id: String, username: String) -> Dictionary:
	_auth_mode = SessionCache.AUTH_MODE_DEVICE
	_device_id = device_id
	_ensure_client()
	var session: NakamaSession = await _client.authenticate_device_async(device_id, username, true, null)
	return _store_session(session, "authentication_failed")


func authenticate_email(email: String, password: String, username: String = "", create: bool = false) -> Dictionary:
	_auth_mode = SessionCache.AUTH_MODE_EMAIL
	_device_id = ""
	_ensure_client()
	var session: NakamaSession = await _client.authenticate_email_async(email, password, username, create, null)
	return _store_session(session, "invalid_credentials")


func restore_cached_session() -> Dictionary:
	var cached := SessionCache.load_cache()
	if cached.is_empty():
		return _fail("session_expired", "No cached session is available.")
	_ensure_client()
	_auth_mode = String(cached.get("auth_mode", SessionCache.AUTH_MODE_EMAIL))
	_device_id = String(cached.get("device_id", ""))
	_session = NakamaSession.new(String(cached["token"]), false, String(cached["refresh_token"]))
	if _session == null or _session.is_exception():
		SessionCache.clear()
		return _fail("session_expired", "The cached session could not be restored.")
	var refreshed: Dictionary = await refresh_session()
	if not bool(refreshed.get("ok", false)):
		SessionCache.clear()
		return refreshed
	return refreshed


func refresh_session() -> Dictionary:
	if _client == null or _session == null:
		return _fail("session_expired", "No session is cached to refresh.")
	if _session.is_refresh_expired():
		return _fail("session_expired", "The refresh token has expired.")
	var session: NakamaSession = await _client.session_refresh_async(_session)
	return _store_session(session, "session_expired")


func connect_socket() -> Dictionary:
	if _client == null or _session == null:
		return _fail("socket_failed", "Sign-in is required before opening a realtime connection.")
	if _socket != null and _socket.is_connected_to_host():
		_ensure_match_signals()
		_ensure_chat_signals()
		_ensure_closed_signal()
		return {"ok": true}
	_closing = true
	_detach_socket()
	_socket_generation += 1
	var generation := _socket_generation
	_socket = Nakama.create_socket_from(_client)
	var connected: NakamaAsyncResult = await _socket.connect_async(_session, false, TIMEOUT_SEC)
	if generation != _socket_generation:
		return _fail("socket_failed", "The realtime connection was replaced.")
	if connected.is_exception():
		_closing = false
		return _from_exception(connected.get_exception(), "socket_failed", "Could not open a realtime connection to Nakama.")
	_closing = false
	_ensure_match_signals()
	_ensure_chat_signals()
	_ensure_closed_signal()
	return {"ok": true}


func rpc(id: String, payload: String) -> Dictionary:
	if _client == null or _session == null:
		return _fail("unauthenticated", "Sign-in is required.")
	var result: NakamaAPI.ApiRpc = await _client.rpc_async(_session, id, payload)
	if result.is_exception():
		return _map_save_incompatible(_from_exception(result.get_exception(), "rpc_failed", "The server rejected the request."))
	return {"ok": true, "payload": String(result.payload)}


func join_match(match_id: String, metadata: Dictionary) -> Dictionary:
	if _socket == null or not _socket.is_connected_to_host():
		return _fail("socket_failed", "A realtime connection is required before joining the zone.")
	_ensure_match_signals()
	var joined: NakamaAsyncResult = await _socket.join_match_async(match_id, metadata)
	if joined.is_exception():
		return _from_join_exception(joined.get_exception())
	var match_result: NakamaRTAPI.Match = joined
	_match_id = String(match_result.match_id)
	if _match_id.is_empty():
		_match_id = match_id
	return {"ok": true, "match_id": _match_id}


func leave_match() -> void:
	if _socket != null and not _match_id.is_empty() and _socket.is_connected_to_host():
		var _ignored: NakamaAsyncResult = await _socket.leave_match_async(_match_id)
	_match_id = ""


func send_match_state(opcode: int, payload: String) -> Dictionary:
	if _socket == null or _match_id.is_empty():
		return _fail("not_in_match", "Not in a match.")
	var _ignored: NakamaAsyncResult = await _socket.send_match_state_async(_match_id, opcode, payload)
	return {"ok": true}


func join_chat(room_name: String, channel_type: int, persistence: bool, hidden: bool) -> Dictionary:
	if _socket == null or not _socket.is_connected_to_host():
		return _fail("chat_join_failed", "A realtime connection is required before joining zone chat.")
	_ensure_chat_signals()
	var joined: NakamaAsyncResult = await _socket.join_chat_async(room_name, channel_type, persistence, hidden)
	if joined.is_exception():
		return _from_chat_exception(joined.get_exception(), "chat_join_failed", "Could not join zone chat.")
	var channel: NakamaRTAPI.Channel = joined
	var channel_id := String(channel.id)
	if channel_id.is_empty():
		return _fail("chat_join_failed", "Zone chat did not return a channel id.")
	return {"ok": true, "channel_id": channel_id, "room_name": String(channel.room_name)}


func leave_chat(channel_id: String) -> Dictionary:
	if _socket == null or channel_id.is_empty() or not _socket.is_connected_to_host():
		return {"ok": true}
	var _ignored: NakamaAsyncResult = await _socket.leave_chat_async(channel_id)
	return {"ok": true}


func send_chat_message(channel_id: String, content: Dictionary) -> Dictionary:
	if _socket == null or channel_id.is_empty() or not _socket.is_connected_to_host():
		return _fail("chat_send_failed", "Join zone chat before sending a message.")
	var ack: NakamaAsyncResult = await _socket.write_chat_message_async(channel_id, content)
	if ack.is_exception():
		return _from_chat_exception(ack.get_exception(), "chat_send_failed", "The server rejected the chat message.")
	return {"ok": true}


func logout() -> void:
	_closing = true
	_socket_generation += 1
	_match_id = ""
	if _client != null and _session != null:
		var _ignored: NakamaAsyncResult = await _client.session_logout_async(_session)
	_detach_socket()
	_session = null
	_device_id = ""
	SessionCache.clear()


func _ensure_client() -> void:
	if _client != null:
		return
	_client = Nakama.create_client(
		SERVER_KEY,
		HOST,
		PORT,
		SCHEME,
		TIMEOUT_SEC,
		NakamaLogger.LOG_LEVEL.ERROR
	)
	_client.auto_refresh = true


func _ensure_closed_signal() -> void:
	if _socket == null:
		return
	if not _socket.closed.is_connected(_on_socket_closed):
		_socket.closed.connect(_on_socket_closed)


func _on_socket_closed() -> void:
	if _closing:
		return
	# A replaced socket can emit closed after the new socket is already up.
	if _socket != null and _socket.is_connected_to_host():
		return
	_match_id = ""
	socket_closed.emit()


func _detach_socket() -> void:
	if _socket == null:
		return
	var previous := _socket
	if previous.received_match_state.is_connected(_on_match_state):
		previous.received_match_state.disconnect(_on_match_state)
	if previous.received_channel_message.is_connected(_on_channel_message):
		previous.received_channel_message.disconnect(_on_channel_message)
	if previous.received_channel_presence.is_connected(_on_channel_presence):
		previous.received_channel_presence.disconnect(_on_channel_presence)
	if previous.closed.is_connected(_on_socket_closed):
		previous.closed.disconnect(_on_socket_closed)
	_socket = null
	if previous.is_connected_to_host():
		previous.close()


func _ensure_match_signals() -> void:
	if _socket == null:
		return
	if not _socket.received_match_state.is_connected(_on_match_state):
		_socket.received_match_state.connect(_on_match_state)


func _on_match_state(data: NakamaRTAPI.MatchData) -> void:
	if data == null:
		return
	match_state_received.emit(int(data.op_code), String(data.data))


func _ensure_chat_signals() -> void:
	if _socket == null:
		return
	if not _socket.received_channel_message.is_connected(_on_channel_message):
		_socket.received_channel_message.connect(_on_channel_message)
	if not _socket.received_channel_presence.is_connected(_on_channel_presence):
		_socket.received_channel_presence.connect(_on_channel_presence)


func _on_channel_message(message: NakamaAPI.ApiChannelMessage) -> void:
	if message == null:
		return
	channel_message_received.emit({
		"channel_id": String(message.channel_id),
		"message_id": String(message.message_id),
		"sender_id": String(message.sender_id),
		"username": String(message.username),
		"content": String(message.content),
		"create_time": String(message.create_time),
		"room_name": String(message.room_name),
	})


func _on_channel_presence(event: NakamaRTAPI.ChannelPresenceEvent) -> void:
	if event == null:
		return
	channel_presence_received.emit({
		"channel_id": String(event.channel_id),
		"room_name": String(event.room_name),
		"joins": _presence_list(event.joins),
		"leaves": _presence_list(event.leaves),
	})


func _presence_list(presences: Array) -> Array:
	var listed: Array = []
	for entry in presences:
		if entry is NakamaRTAPI.UserPresence:
			var presence := entry as NakamaRTAPI.UserPresence
			listed.append({
				"user_id": String(presence.user_id),
				"username": String(presence.username),
			})
	return listed


func _from_chat_exception(exception: NakamaException, fallback_code: String, fallback_message: String) -> Dictionary:
	var mapped: Dictionary = _from_exception(exception, fallback_code, fallback_message)
	var lowered := String(mapped.get("message", "")).to_lower()
	if lowered.contains("message_too_long"):
		mapped["code"] = "message_too_long"
		mapped["message"] = "Chat message exceeds 200 characters."
	elif lowered.contains("empty_message"):
		mapped["code"] = "empty_message"
		mapped["message"] = "Chat message is empty."
	elif lowered.contains("malformed_json"):
		mapped["code"] = "malformed_json"
		mapped["message"] = "Chat content must be a JSON object."
	elif lowered.contains("invalid_payload"):
		mapped["code"] = "invalid_payload"
		mapped["message"] = "The server rejected the chat payload."
	elif lowered.contains("invalid_channel"):
		mapped["code"] = "invalid_channel"
		mapped["message"] = "Could not join zone chat."
	return mapped


func _store_session(session: NakamaSession, fallback_code: String) -> Dictionary:
	if session == null or session.is_exception():
		var exception: NakamaException = null
		if session != null:
			exception = session.get_exception()
		return _from_exception(exception, fallback_code, "Could not sign in to Nakama.")
	_session = session
	SessionCache.save(
		session.token,
		session.refresh_token,
		session.user_id,
		session.username,
		_auth_mode,
		_device_id
	)
	return {
		"ok": true,
		"user_id": session.user_id,
		"username": session.username,
	}


func _from_join_exception(exception: NakamaException) -> Dictionary:
	var mapped: Dictionary = _from_exception(exception, "join_failed", "Could not join the starter zone.")
	var message := String(mapped.get("message", "")).to_lower()
	if message.contains("protocol_mismatch"):
		mapped["code"] = "protocol_mismatch"
		mapped["message"] = "The client protocol version does not match the server."
	elif message.contains("content_mismatch"):
		mapped["code"] = "content_mismatch"
		mapped["message"] = "The client content catalog does not match the server."
	elif message.contains("already_in_match"):
		mapped["code"] = "already_in_match"
		mapped["message"] = "This account is already in the starter zone. Sign in as Alice in one window and Bob in the other."
	elif message.contains("match_full"):
		mapped["code"] = "match_full"
	elif message.contains("selection_expired"):
		mapped["code"] = "selection_expired"
	elif message.contains("selection_required"):
		mapped["code"] = "selection_required"
	elif message.contains("selection_foreign"):
		mapped["code"] = "selection_foreign"
	elif message.contains("character_deleted"):
		mapped["code"] = "character_deleted"
	else:
		mapped = _map_save_incompatible(mapped)
	return mapped


func _map_save_incompatible(mapped: Dictionary) -> Dictionary:
	var message := String(mapped.get("message", "")).to_lower()
	if (
		message.contains("unsupported_future_version")
		or message.contains("corrupted_required_fields")
		or message.contains("corrupted_record")
		or message.contains("corrupted_schema_version")
		or message.contains("save_incompatible")
		or message.contains("stat_injection:schemaversion")
		or message.contains("stat_injection:createdat")
		or message.contains("stat_injection:updatedat")
		or message.contains("stat_injection:migrationid")
	):
		mapped["code"] = "save_incompatible"
		mapped["message"] = "This save is incompatible with the server. The client cannot choose a migration version."
	return mapped


func _from_exception(exception: NakamaException, fallback_code: String, fallback_message: String) -> Dictionary:
	if exception == null:
		return _fail(fallback_code, fallback_message)
	var message := exception.message
	if message.is_empty():
		message = fallback_message
	var code := fallback_code
	var lowered := exception.message.to_lower()
	if exception.grpc_status_code == 16 or exception.status_code == 401:
		if fallback_code == "invalid_credentials":
			code = "invalid_credentials"
			message = "Email or password is incorrect."
		else:
			code = "session_expired"
			message = "The session expired. Sign in again."
	elif fallback_code == "invalid_credentials" and (lowered.contains("invalid") or lowered.contains("already in use") or lowered.contains("exists")):
		if lowered.contains("exists") or lowered.contains("already"):
			code = "email_taken"
			message = "That email is already registered."
		else:
			code = "invalid_credentials"
			message = "Email or password is incorrect."
	elif _looks_like_missing_rpc(message):
		code = "rpc_missing"
		message = "Nakama is running an old runtime. Rebuild and restart with powershell -File scripts/backend-up.ps1."
	elif _looks_like_unreachable(message):
		code = "network_unreachable"
		message = "Cannot reach Nakama at 127.0.0.1:7350. Start it with powershell -File scripts/backend-up.ps1."
	return _fail(code, message)


func _looks_like_missing_rpc(message: String) -> bool:
	return message.to_lower().contains("rpc function not found")


func _looks_like_unreachable(message: String) -> bool:
	var lowered := message.to_lower()
	return (
		lowered.contains("connect")
		or lowered.contains("timeout")
		or lowered.contains("refused")
		or lowered.contains("unavailable")
		or lowered.contains("failed to connect")
	)


func _fail(code: String, message: String) -> Dictionary:
	return {"ok": false, "code": code, "message": message}
