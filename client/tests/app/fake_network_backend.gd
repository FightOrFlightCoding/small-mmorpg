class_name FakeNetworkBackend
extends RefCounted

## Test double for NakamaNetworkBackend. Does not contact Nakama or store tokens.

var authenticate_ok: bool = true
var authenticate_code: String = "network_unreachable"
var authenticate_message: String = "Cannot reach Nakama."
var refresh_ok: bool = true
var socket_ok: bool = true
var rpc_ok: bool = true
var rpc_code: String = "rpc_failed"
var rpc_message: String = "The server rejected the request."
var session_expired: bool = false
var fail_reauth: bool = false
var user_id: String = "user-alice"
var username: String = "alice"
var rpc_payload: String = ""
var last_device_id: String = ""
var last_username: String = ""
var last_rpc_id: String = ""
var last_rpc_payload: String = ""
var authenticate_calls: int = 0
var refresh_calls: int = 0
var socket_calls: int = 0
var logout_calls: int = 0


func is_session_expired() -> bool:
	return session_expired


func authenticate_device(device_id: String, p_username: String) -> Dictionary:
	last_device_id = device_id
	last_username = p_username
	authenticate_calls += 1
	if fail_reauth and authenticate_calls > 1:
		return {"ok": false, "code": "session_expired", "message": "Reauthentication failed."}
	if not authenticate_ok:
		return {"ok": false, "code": authenticate_code, "message": authenticate_message}
	session_expired = false
	return {"ok": true, "user_id": user_id, "username": username}


func refresh_session() -> Dictionary:
	refresh_calls += 1
	if refresh_ok:
		session_expired = false
		return {"ok": true, "user_id": user_id, "username": username}
	return {"ok": false, "code": "session_expired", "message": "The refresh token has expired."}


func connect_socket() -> Dictionary:
	socket_calls += 1
	if not socket_ok:
		return {"ok": false, "code": "socket_failed", "message": "Could not open a realtime connection to Nakama."}
	return {"ok": true}


func rpc(id: String, payload: String) -> Dictionary:
	last_rpc_id = id
	last_rpc_payload = payload
	if not rpc_ok:
		return {"ok": false, "code": rpc_code, "message": rpc_message}
	return {"ok": true, "payload": rpc_payload}


func logout() -> void:
	logout_calls += 1
	session_expired = true
