class_name FakeNetworkBackend
extends RefCounted

## Test double for NakamaNetworkBackend. Does not contact Nakama or store tokens.

signal match_state_received(opcode: int, payload: String)
signal channel_message_received(payload: Dictionary)
signal channel_presence_received(payload: Dictionary)
signal socket_closed

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
var socket_closed_emits: int = 0
var socket_is_connected: bool = false
var logout_calls: int = 0
var join_ok: bool = true
var join_code: String = "join_failed"
var join_message: String = "Could not join the starter zone."
var find_zone_ok: bool = true
var find_zone_code: String = "rpc_failed"
var find_zone_message: String = "Could not find the starter zone."
var find_zone_payload: String = ""
var full_state_payload: String = ""
var resync_full_state_payload: String = ""
var match_id: String = "match-starter-shared"
var last_join_match_id: String = ""
var last_join_metadata: Dictionary = {}
var last_send_opcode: int = 0
var last_send_payload: String = ""
var join_calls: int = 0
var leave_calls: int = 0
var send_calls: int = 0
var join_chat_ok: bool = true
var join_chat_code: String = "chat_join_failed"
var join_chat_message: String = "Could not join zone chat."
var join_chat_calls: int = 0
var leave_chat_calls: int = 0
var send_chat_calls: int = 0
var last_chat_room: String = ""
var last_chat_type: int = 0
var last_chat_persistence: bool = true
var last_chat_hidden: bool = true
var last_chat_channel_id: String = ""
var last_chat_content: Dictionary = {}
var chat_channel_id: String = "channel-zone-starter"


func is_session_expired() -> bool:
	return session_expired


func is_socket_connected() -> bool:
	return socket_is_connected


func authenticate_device(device_id: String, p_username: String) -> Dictionary:
	last_device_id = device_id
	last_username = p_username
	authenticate_calls += 1
	if fail_reauth and authenticate_calls > 1:
		return {"ok": false, "code": "session_expired", "message": "Reauthentication failed."}
	if not authenticate_ok:
		return {"ok": false, "code": authenticate_code, "message": authenticate_message}
	session_expired = false
	socket_is_connected = false
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
		socket_is_connected = false
		return {"ok": false, "code": "socket_failed", "message": "Could not open a realtime connection to Nakama."}
	socket_is_connected = true
	return {"ok": true}


func emit_socket_closed(still_connected: bool = false) -> void:
	socket_closed_emits += 1
	if not still_connected:
		socket_is_connected = false
	socket_closed.emit()


func rpc(id: String, payload: String) -> Dictionary:
	last_rpc_id = id
	last_rpc_payload = payload
	if not rpc_ok:
		return {"ok": false, "code": rpc_code, "message": rpc_message}
	if id == MatchProtocol.FIND_OR_CREATE_STARTER_ZONE_RPC:
		if not find_zone_ok:
			return {"ok": false, "code": find_zone_code, "message": find_zone_message}
		var body := find_zone_payload
		if body.is_empty():
			body = default_find_payload()
		return {"ok": true, "payload": body}
	return {"ok": true, "payload": rpc_payload}


func join_match(p_match_id: String, metadata: Dictionary) -> Dictionary:
	join_calls += 1
	last_join_match_id = p_match_id
	last_join_metadata = metadata.duplicate(true)
	if not join_ok:
		return {"ok": false, "code": join_code, "message": join_message}
	var body := full_state_payload
	if body.is_empty():
		body = default_full_state_payload()
	match_state_received.emit(MatchProtocol.SERVER_FULL_STATE, body)
	return {"ok": true, "match_id": p_match_id}


func leave_match() -> void:
	leave_calls += 1


func send_match_state(opcode: int, payload: String) -> Dictionary:
	send_calls += 1
	last_send_opcode = opcode
	last_send_payload = payload
	if opcode == MatchProtocol.CLIENT_RESYNC_REQUEST:
		var body := resync_full_state_payload
		if body.is_empty():
			body = default_full_state_payload(99)
		match_state_received.emit(MatchProtocol.SERVER_FULL_STATE, body)
	return {"ok": true}


func join_chat(room_name: String, channel_type: int, persistence: bool, hidden: bool) -> Dictionary:
	join_chat_calls += 1
	last_chat_room = room_name
	last_chat_type = channel_type
	last_chat_persistence = persistence
	last_chat_hidden = hidden
	if not join_chat_ok:
		return {"ok": false, "code": join_chat_code, "message": join_chat_message}
	return {"ok": true, "channel_id": chat_channel_id, "room_name": room_name}


func leave_chat(channel_id: String) -> Dictionary:
	leave_chat_calls += 1
	last_chat_channel_id = channel_id
	return {"ok": true}


func send_chat_message(channel_id: String, content: Dictionary) -> Dictionary:
	send_chat_calls += 1
	last_chat_channel_id = channel_id
	last_chat_content = content.duplicate(true)
	var body := String(content.get("message", ""))
	if body.strip_edges().is_empty():
		return {"ok": false, "code": "empty_message", "message": "Chat message is empty."}
	if body.length() > ZoneChat.MAX_CHARS:
		return {"ok": false, "code": "message_too_long", "message": "Chat message exceeds 200 characters."}
	channel_message_received.emit({
		"channel_id": channel_id,
		"message_id": "msg-%s" % str(send_chat_calls),
		"sender_id": user_id,
		"username": username,
		"content": JSON.stringify({"message": body}),
		"create_time": "2026-08-15T20:00:00Z",
		"room_name": ZoneChat.ROOM_NAME,
	})
	return {"ok": true}


func logout() -> void:
	logout_calls += 1
	session_expired = true
	socket_is_connected = false


func default_find_payload() -> String:
	return JSON.stringify({
		"matchId": match_id,
		"zoneId": "zone.starter",
		"protocolVersion": MatchProtocol.VERSION,
		"contentHash": ContentRegistry.get_content_hash(),
	})


func default_full_state_payload(tick: int = 1) -> String:
	return JSON.stringify({
		"protocolVersion": MatchProtocol.VERSION,
		"contentHash": ContentRegistry.get_content_hash(),
		"tick": tick,
		"zoneId": "zone.starter",
		"selfId": user_id,
		"players": [
			{
				"userId": user_id,
				"sessionId": "session-1",
				"username": username,
				"characterId": "char-1",
				"name": username.capitalize(),
				"x": 240,
				"y": 384,
				"maxHealth": 100,
				"health": 100,
			}
		],
		"npcs": [{"id": "npc.elder", "npcId": "npc.elder", "x": 160, "y": 320}],
		"enemies": [{
			"id": "enemy.green_slime:0",
			"enemyId": "enemy.green_slime",
			"x": 960,
			"y": 400,
			"maxHealth": 20,
			"health": 20,
		}],
		"loot": [],
		"quests": [],
		"inventory": {
			"capacity": 20,
			"items": [{
				"instanceId": "inst-training-sword",
				"itemId": "item.training_sword",
				"quantity": 1,
				"metadata": {},
			}],
		},
	})
