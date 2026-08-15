extends Node

## Project-owned Nakama boundary. Caches the session in memory and never logs tokens.

signal authentication_started
signal authentication_finished(success: bool, message: String)
signal character_bootstrap_finished(success: bool, created: bool, message: String)
signal logged_out

const CHARACTER_BOOTSTRAP_RPC := "character_bootstrap"

var backend: RefCounted
var last_auth_attempted: bool = false
var socket_connected: bool = false

var _device_id: String = ""
var _username: String = ""


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
		AppState.notify_logged_out()
		AppState.report_recoverable(
			String(socket.get("code", "socket_failed")),
			String(socket.get("message", "The session expired and the realtime connection could not be restored."))
		)
		AppState.notify_loading_completed("session")
		return false
	socket_connected = true
	AppState.notify_authenticated(String(reauth.get("user_id", AppState.user_id)), String(reauth.get("username", _username)))
	AppState.notify_loading_completed("session")
	return true


func logout() -> void:
	await _backend().logout()
	socket_connected = false
	_device_id = ""
	_username = ""
	AppState.notify_logged_out()
	logged_out.emit()


func reset_for_tests() -> void:
	backend = null
	last_auth_attempted = false
	socket_connected = false
	_device_id = ""
	_username = ""


func _backend() -> RefCounted:
	if backend == null:
		backend = NakamaNetworkBackend.new()
	return backend


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
