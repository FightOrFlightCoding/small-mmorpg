class_name NakamaNetworkBackend
extends RefCounted

## Thin Nakama SDK wrapper. Tokens stay on this object and are never logged.

signal match_state_received(opcode: int, payload: String)

const HOST := "127.0.0.1"
const PORT := 7350
const SCHEME := "http"
const SERVER_KEY := "defaultkey"
const TIMEOUT_SEC := 10

var _client: NakamaClient
var _session: NakamaSession
var _socket: NakamaSocket
var _match_id: String = ""


func is_session_expired() -> bool:
	if _session == null or _session.is_exception():
		return true
	return _session.expired or not _session.is_valid()


func authenticate_device(device_id: String, username: String) -> Dictionary:
	_ensure_client()
	var session: NakamaSession = await _client.authenticate_device_async(device_id, username, true, null)
	return _store_session(session, "authentication_failed")


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
		return {"ok": true}
	_socket = Nakama.create_socket_from(_client)
	var connected: NakamaAsyncResult = await _socket.connect_async(_session, false, TIMEOUT_SEC)
	if connected.is_exception():
		return _from_exception(connected.get_exception(), "socket_failed", "Could not open a realtime connection to Nakama.")
	_ensure_match_signals()
	return {"ok": true}


func rpc(id: String, payload: String) -> Dictionary:
	if _client == null or _session == null:
		return _fail("unauthenticated", "Sign-in is required.")
	var result: NakamaAPI.ApiRpc = await _client.rpc_async(_session, id, payload)
	if result.is_exception():
		return _from_exception(result.get_exception(), "rpc_failed", "The server rejected the request.")
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


func logout() -> void:
	_match_id = ""
	if _client != null and _session != null:
		var _ignored: NakamaAsyncResult = await _client.session_logout_async(_session)
	if _socket != null:
		if _socket.received_match_state.is_connected(_on_match_state):
			_socket.received_match_state.disconnect(_on_match_state)
		_socket.close()
	_session = null
	_socket = null


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


func _ensure_match_signals() -> void:
	if _socket == null:
		return
	if not _socket.received_match_state.is_connected(_on_match_state):
		_socket.received_match_state.connect(_on_match_state)


func _on_match_state(data: NakamaRTAPI.MatchData) -> void:
	if data == null:
		return
	match_state_received.emit(int(data.op_code), String(data.data))


func _store_session(session: NakamaSession, fallback_code: String) -> Dictionary:
	if session == null or session.is_exception():
		var exception: NakamaException = null
		if session != null:
			exception = session.get_exception()
		return _from_exception(exception, fallback_code, "Could not sign in to Nakama.")
	_session = session
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
	elif message.contains("match_full"):
		mapped["code"] = "match_full"
	elif message.contains("character_missing"):
		mapped["code"] = "character_missing"
	return mapped


func _from_exception(exception: NakamaException, fallback_code: String, fallback_message: String) -> Dictionary:
	if exception == null:
		return _fail(fallback_code, fallback_message)
	var message := exception.message
	if message.is_empty():
		message = fallback_message
	var code := fallback_code
	if exception.grpc_status_code == 16 or exception.status_code == 401:
		code = "session_expired"
	elif _looks_like_unreachable(message):
		code = "network_unreachable"
		message = "Cannot reach Nakama at 127.0.0.1:7350. Start it with powershell -File scripts/backend-up.ps1."
	return _fail(code, message)


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
