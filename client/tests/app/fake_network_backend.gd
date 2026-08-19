class_name FakeNetworkBackend
extends RefCounted

## Test double for NakamaNetworkBackend. Does not contact Nakama or store tokens.

signal match_state_received(opcode: int, payload: String)
signal channel_message_received(payload: Dictionary)
signal channel_presence_received(payload: Dictionary)
signal socket_closed

var authenticate_ok: bool = true
var authenticate_email_ok: bool = true
var restore_cache_ok: bool = false
var authenticate_code: String = "network_unreachable"
var authenticate_message: String = "Cannot reach Nakama."
var refresh_ok: bool = true
var socket_ok: bool = true
var rpc_ok: bool = true
var rpc_code: String = "rpc_failed"
var rpc_message: String = "The server rejected the request."
var rpc_fail_remaining: int = 0
var handshake_ok: bool = true
var handshake_code: String = "ok"
var handshake_message: String = ""
var handshake_payload: String = ""
var handshake_maintenance: bool = false
var session_expired: bool = false
var fail_reauth: bool = false
var user_id: String = "user-alice"
var username: String = "alice"
var rpc_payload: String = ""
var last_device_id: String = ""
var last_username: String = ""
var last_email: String = ""
var last_create_account: bool = false
var last_rpc_id: String = ""
var last_rpc_payload: String = ""
var authenticate_calls: int = 0
var import_calls: int = 0
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


func authenticate_email(email: String, _password: String, p_username: String, create: bool) -> Dictionary:
	last_email = email
	last_username = p_username
	last_create_account = create
	authenticate_calls += 1
	if fail_reauth and authenticate_calls > 1:
		return {"ok": false, "code": "session_expired", "message": "Reauthentication failed."}
	if not authenticate_email_ok:
		return {"ok": false, "code": authenticate_code, "message": authenticate_message}
	session_expired = false
	socket_is_connected = false
	if not p_username.is_empty():
		username = p_username
	return {"ok": true, "user_id": user_id, "username": username}


func import_session(_token: String, _refresh_token: String, p_user_id: String, p_username: String) -> Dictionary:
	import_calls += 1
	if not p_user_id.is_empty():
		user_id = p_user_id
	if not p_username.is_empty():
		username = p_username
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
	if id == MatchProtocol.SESSION_HANDSHAKE_RPC:
		if not handshake_ok:
			return {"ok": false, "code": handshake_code, "message": handshake_message}
		if not handshake_payload.is_empty():
			return {"ok": true, "payload": handshake_payload}
		var body: Dictionary = {
			"ok": true,
			"code": "ok",
			"serverVersion": "1.0.0",
			"minClientVersion": "1.0.0",
			"maxClientVersion": "1.0.0",
			"contentVersion": "1.0.0",
			"maintenance": handshake_maintenance,
			"rejectJoins": handshake_maintenance,
			"blockTransactions": false,
			"message": "",
		}
		if handshake_maintenance:
			body["code"] = "server_maintenance"
			body["message"] = handshake_message if not handshake_message.is_empty() else "The server is in maintenance. Gameplay joins are paused."
		return {"ok": true, "payload": JSON.stringify(body)}
	if rpc_fail_remaining > 0 and id.begins_with("party_"):
		rpc_fail_remaining -= 1
		return {"ok": false, "code": rpc_code, "message": rpc_message}
	if not rpc_ok:
		return {"ok": false, "code": rpc_code, "message": rpc_message}
	if id == MatchProtocol.FIND_OR_CREATE_STARTER_ZONE_RPC:
		if not find_zone_ok:
			return {"ok": false, "code": find_zone_code, "message": find_zone_message}
		var body := find_zone_payload
		if body.is_empty():
			body = default_find_payload()
		return {"ok": true, "payload": body}
	if id == "character_list":
		return {"ok": true, "payload": default_character_list_payload()}
	if id == "character_select":
		return {"ok": true, "payload": default_character_select_payload(payload)}
	if id == "character_create":
		return {"ok": true, "payload": rpc_payload if not rpc_payload.is_empty() else _created_character_payload()}
	if id == "character_soft_delete" or id == "character_delete_request" or id == "character_restore":
		return {"ok": true, "payload": default_character_list_payload()}
	if id == "character_name_available":
		return {"ok": true, "payload": JSON.stringify({"available": true, "canonicalName": "scout"})}
	if id == "character_purge":
		return {"ok": true, "payload": JSON.stringify({"characterId": "", "purged": true})}
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


func restore_cached_session() -> Dictionary:
	if not restore_cache_ok:
		return {"ok": false, "code": "session_expired", "message": "No cached session is available."}
	session_expired = false
	socket_is_connected = false
	return {"ok": true, "user_id": user_id, "username": username}


func logout() -> void:
	logout_calls += 1
	session_expired = true
	socket_is_connected = false
	SessionCache.clear()


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


func default_character_list_payload() -> String:
	var characters: Array = []
	var parsed: Variant = JSON.parse_string(rpc_payload)
	if typeof(parsed) == TYPE_DICTIONARY:
		var data: Dictionary = parsed
		if not String(data.get("characterId", "")).is_empty():
			characters.append({
				"characterId": String(data.get("characterId", "")),
				"accountUserId": user_id,
				"name": String(data.get("name", "")),
				"canonicalName": String(data.get("name", "")).to_lower(),
				"classId": String(data.get("classId", "")),
				"createdAt": 0,
				"lastPlayedAt": 0,
				"deletedAt": 0,
				"schemaVersion": 1,
			})
	return JSON.stringify({
		"slotLimit": 5,
		"liveCount": characters.size(),
		"characters": characters,
		"serverTimeMs": 0,
		"maintenance": false,
	})


func default_character_select_payload(payload: String) -> String:
	var character_id := "char-1"
	var parsed: Variant = JSON.parse_string(payload)
	if typeof(parsed) == TYPE_DICTIONARY:
		var requested := String((parsed as Dictionary).get("characterId", ""))
		if not requested.is_empty():
			character_id = requested
	var character_name := "Alice"
	var class_id := ""
	var from_rpc: Variant = JSON.parse_string(rpc_payload)
	if typeof(from_rpc) == TYPE_DICTIONARY:
		var data: Dictionary = from_rpc
		if not String(data.get("name", "")).is_empty():
			character_name = String(data.get("name", ""))
		if not String(data.get("classId", "")).is_empty():
			class_id = String(data.get("classId", ""))
	var class_ids := ContentRegistry.ids_of_kind("class")
	if class_id.is_empty() and class_ids.size() > 0:
		class_id = class_ids[0]
	return JSON.stringify({
		"ticketId": "ticket-1",
		"characterId": character_id,
		"accountUserId": user_id,
		"expiresAt": 9999999999999,
		"name": character_name,
		"classId": class_id,
	})


func _created_character_payload() -> String:
	var class_ids := ContentRegistry.ids_of_kind("class")
	var class_id := ""
	if class_ids.size() > 0:
		class_id = class_ids[0]
	return JSON.stringify({
		"characterId": "char-new",
		"name": "Adventurer",
		"canonicalName": "adventurer",
		"classId": class_id,
		"created": true,
	})
