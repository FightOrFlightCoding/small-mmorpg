class_name MatchProtocol
extends RefCounted

## Client/server opcode and envelope contract. Mirrors server/src/domain/protocol.ts.

const VERSION: int = 1
const CLIENT_VERSION: String = "1.0.0"
const MAX_PAYLOAD_BYTES: int = 2048
const REQUEST_ID_PATTERN := "^[A-Za-z0-9_-]{8,64}$"
const CONTENT_HASH_PATTERN := "^[a-f0-9]{64}$"
const INPUT_SEND_HZ: float = 10.0
const SNAPSHOT_RATE_HZ: float = 10.0
const SNAPSHOT_TIMEOUT_SEC: float = 2.0
const INTERP_DELAY_TICKS: float = 1.0
const SNAP_THRESHOLD_PX: float = 24.0
## Presentation copy of server `TRADE_RANGE_PX`. The match still enforces range.
const TRADE_RANGE_PX: float = 80.0

const CLIENT_INPUT: int = 1
const CLIENT_INTERACT: int = 2
const CLIENT_ATTACK: int = 3
const CLIENT_PICKUP: int = 4
const CLIENT_EQUIP: int = 5
const CLIENT_QUEST_ACCEPT: int = 6
const CLIENT_QUEST_TURN_IN: int = 7
const CLIENT_RESYNC_REQUEST: int = 8
const CLIENT_ALLOCATE_ATTRIBUTES: int = 9
const CLIENT_DESTROY_ITEM: int = 10
const CLIENT_SPLIT_STACK: int = 11
const CLIENT_MOVE_ITEM: int = 12
const CLIENT_USE_ABILITY: int = 13
const CLIENT_CANCEL_CAST: int = 14
const CLIENT_ASSIGN_HOTBAR: int = 15
const CLIENT_UNLOCK_ABILITY: int = 16
const CLIENT_SET_TARGET: int = 17
const CLIENT_RELEASE_RESPAWN: int = 18
const CLIENT_VENDOR_BUY: int = 19
const CLIENT_VENDOR_SELL: int = 20
const CLIENT_INN_REST: int = 21
const CLIENT_CAVE_ENTER: int = 22
const CLIENT_CAVE_EXIT: int = 23
const CLIENT_TRADE_INVITE: int = 24
const CLIENT_TRADE_ACCEPT_INVITE: int = 25
const CLIENT_TRADE_DECLINE_INVITE: int = 26
const CLIENT_TRADE_SET_OFFER: int = 27
const CLIENT_TRADE_REMOVE_OFFER: int = 28
const CLIENT_TRADE_SET_GOLD: int = 29
const CLIENT_TRADE_ACCEPT_REVISION: int = 30
const CLIENT_TRADE_CANCEL: int = 31
const CLIENT_RETURN_TO_CHARACTER_SELECT: int = 32

const SERVER_FULL_STATE: int = 101
const SERVER_SNAPSHOT: int = 102
const SERVER_ACTION_RESULT: int = 103
const SERVER_COMBAT_EVENT: int = 104
const SERVER_INVENTORY_STATE: int = 105
const SERVER_QUEST_STATE: int = 106
const SERVER_INTERACTION_RESULT: int = 107
const SERVER_SYSTEM_MESSAGE: int = 108
const SERVER_EQUIPMENT_STATE: int = 109
const SERVER_WALLET_STATE: int = 110
const SERVER_PROGRESSION_STATE: int = 111
const SERVER_ABILITY_STATE: int = 112
const SERVER_PARTY_STATE: int = 113
const SERVER_PARTY_EVENT: int = 114
const SERVER_TRADE_STATE: int = 115

const FIND_OR_CREATE_STARTER_ZONE_RPC: String = "find_or_create_starter_zone"
const SESSION_HANDSHAKE_RPC: String = "session_handshake"
const OPS_STATUS_RPC: String = "ops_status"


static func client_envelope(extra: Dictionary = {}) -> Dictionary:
	var payload: Dictionary = {"protocolVersion": VERSION}
	for key in extra.keys():
		payload[key] = extra[key]
	return payload


static func client_envelope_json(extra: Dictionary = {}) -> String:
	return JSON.stringify(client_envelope(extra))


static func join_metadata(content_hash: String, selection_ticket: String = "", transfer_ticket: String = "") -> Dictionary:
	var meta: Dictionary = {
		"protocolVersion": str(VERSION),
		"contentHash": content_hash,
		"clientVersion": CLIENT_VERSION,
	}
	if not selection_ticket.is_empty():
		meta["selectionTicket"] = selection_ticket
	elif transfer_ticket.is_empty():
		meta["selectionTicket"] = ""
	if not transfer_ticket.is_empty():
		meta["transferTicket"] = transfer_ticket
	return meta


static func parse_full_state(raw: String, expected_content_hash: String) -> Dictionary:
	var parsed: Dictionary = _parse_object(raw)
	if parsed.has("ok") and not bool(parsed["ok"]):
		return parsed
	if not _version_ok(parsed):
		return _fail("protocol_mismatch", "The full-state protocol version does not match this client.")
	if not _hash_ok(parsed, expected_content_hash):
		return _fail("content_mismatch", "The full-state content hash does not match this client.")
	if typeof(parsed.get("selfId", null)) != TYPE_STRING or String(parsed["selfId"]).is_empty():
		return _fail("malformed_json", "FULL_STATE is missing selfId.")
	if typeof(parsed.get("zoneId", null)) != TYPE_STRING or String(parsed["zoneId"]).is_empty():
		return _fail("malformed_json", "FULL_STATE is missing zoneId.")
	if typeof(parsed.get("tick", null)) != TYPE_FLOAT and typeof(parsed.get("tick", null)) != TYPE_INT:
		return _fail("malformed_json", "FULL_STATE is missing tick.")
	if typeof(parsed.get("players", null)) != TYPE_ARRAY:
		return _fail("malformed_json", "FULL_STATE is missing players.")
	if typeof(parsed.get("npcs", null)) != TYPE_ARRAY:
		return _fail("malformed_json", "FULL_STATE is missing npcs.")
	if typeof(parsed.get("enemies", null)) != TYPE_ARRAY:
		return _fail("malformed_json", "FULL_STATE is missing enemies.")
	var loot: Array = []
	if parsed.has("loot"):
		if typeof(parsed["loot"]) != TYPE_ARRAY:
			return _fail("malformed_json", "FULL_STATE loot must be an array.")
		loot = parsed["loot"]
	var self_id := String(parsed["selfId"])
	var players: Array = parsed["players"]
	var found_self := false
	for entry in players:
		if typeof(entry) == TYPE_DICTIONARY and String(entry.get("userId", "")) == self_id:
			found_self = true
			break
	if not found_self:
		return _fail("malformed_json", "FULL_STATE players must include the local player.")
	return {
		"ok": true,
		"view": {
			"protocol_version": VERSION,
			"content_hash": String(parsed["contentHash"]),
			"tick": int(parsed["tick"]),
			"zone_id": String(parsed["zoneId"]),
			"self_id": self_id,
			"ack_seq": _ack_seq(players, self_id),
			"players": players.duplicate(true),
			"npcs": (parsed["npcs"] as Array).duplicate(true),
			"enemies": (parsed["enemies"] as Array).duplicate(true),
			"loot": loot.duplicate(true),
			"quests": _optional_array(parsed, "quests"),
			"inventory": _optional_inventory(parsed),
			"equipment": _optional_equipment(parsed),
			"derived": _optional_derived(parsed),
			"wallet": _optional_wallet(parsed),
			"progression": _optional_object(parsed, "progression"),
			"abilities": _optional_object(parsed, "abilities"),
			"party": _optional_object(parsed, "party"),
			"instance": _optional_object(parsed, "instance"),
		},
	}


static func parse_snapshot(raw: String, expected_content_hash: String, previous: Dictionary) -> Dictionary:
	var parsed: Dictionary = _parse_object(raw)
	if parsed.has("ok") and not bool(parsed["ok"]):
		return parsed
	if not _version_ok(parsed):
		return _fail("protocol_mismatch", "The snapshot protocol version does not match this client.")
	if not _hash_ok(parsed, expected_content_hash):
		return _fail("content_mismatch", "The snapshot content hash does not match this client.")
	if typeof(parsed.get("players", null)) != TYPE_ARRAY:
		return _fail("malformed_json", "SNAPSHOT is missing players.")
	var view: Dictionary = previous.duplicate(true)
	view["protocol_version"] = VERSION
	view["content_hash"] = String(parsed.get("contentHash", view.get("content_hash", "")))
	if parsed.has("tick"):
		view["tick"] = int(parsed["tick"])
	if parsed.has("zoneId"):
		view["zone_id"] = String(parsed["zoneId"])
	view["players"] = (parsed["players"] as Array).duplicate(true)
	view["ack_seq"] = _ack_seq(view["players"], String(view.get("self_id", "")))
	for key in ["npcs", "enemies", "loot", "quests"]:
		if typeof(parsed.get(key, null)) == TYPE_ARRAY:
			view[key] = (parsed[key] as Array).duplicate(true)
	return {"ok": true, "view": view}


static func parse_system_message(raw: String) -> Dictionary:
	var parsed: Dictionary = _parse_object(raw)
	if parsed.has("ok") and not bool(parsed["ok"]):
		return parsed
	return {
		"ok": true,
		"code": String(parsed.get("code", "system")),
		"message": String(parsed.get("message", "The server rejected the request.")),
	}


static func parse_find_or_create(raw: String, expected_content_hash: String) -> Dictionary:
	var parsed: Dictionary = _parse_object(raw)
	if parsed.has("ok") and not bool(parsed["ok"]):
		return parsed
	if not _version_ok(parsed):
		return _fail("protocol_mismatch", "The starter-zone protocol version does not match this client.")
	if not _hash_ok(parsed, expected_content_hash):
		return _fail("content_mismatch", "The starter-zone content hash does not match this client.")
	if typeof(parsed.get("matchId", null)) != TYPE_STRING or String(parsed["matchId"]).is_empty():
		return _fail("malformed_json", "find_or_create_starter_zone did not return a match id.")
	return {
		"ok": true,
		"match_id": String(parsed["matchId"]),
		"zone_id": String(parsed.get("zoneId", "zone.starter")),
		"instance_id": String(parsed.get("instanceId", "")),
		"instance_type": String(parsed.get("instanceType", "public_world")),
	}


static func parse_interaction_result(raw: String) -> Dictionary:
	var parsed: Dictionary = _parse_object(raw)
	if parsed.has("ok") and not bool(parsed["ok"]) and parsed.has("message"):
		return parsed
	if not _version_ok(parsed):
		return _fail("protocol_mismatch", "The interaction result protocol version does not match this client.")
	return {
		"ok": true,
		"result_ok": bool(parsed.get("ok", false)),
		"code": String(parsed.get("code", "unknown")),
		"request_id": String(parsed.get("requestId", "")),
		"target_id": String(parsed.get("targetId", "")),
		"dialogue_id": String(parsed.get("dialogueId", "")),
		"services": _optional_array(parsed, "services"),
		"context": _optional_object(parsed, "context"),
	}


static func parse_action_result(raw: String) -> Dictionary:
	var parsed: Dictionary = _parse_object(raw)
	if parsed.has("ok") and not bool(parsed["ok"]) and parsed.has("message"):
		return parsed
	if not _version_ok(parsed):
		return _fail("protocol_mismatch", "The action result protocol version does not match this client.")
	return {
		"ok": true,
		"result_ok": bool(parsed.get("ok", false)),
		"code": String(parsed.get("code", "unknown")),
		"request_id": String(parsed.get("requestId", "")),
		"message": String(parsed.get("message", "")),
		"ticket_id": String(parsed.get("ticketId", "")),
		"destination_match_id": String(parsed.get("destinationMatchId", "")),
		"destination_instance_id": String(parsed.get("destinationInstanceId", "")),
		"origin_match_id": String(parsed.get("originMatchId", "")),
		"zone_id": String(parsed.get("zoneId", "")),
		"instance_type": String(parsed.get("instanceType", "")),
		"trade_id": String(parsed.get("tradeId", "")),
	}


static func parse_quest_state(raw: String) -> Dictionary:
	var parsed: Dictionary = _parse_object(raw)
	if parsed.has("ok") and not bool(parsed["ok"]):
		return parsed
	if not _version_ok(parsed):
		return _fail("protocol_mismatch", "The quest-state protocol version does not match this client.")
	return {
		"ok": true,
		"request_id": String(parsed.get("requestId", "")),
		"quests": _optional_array(parsed, "quests"),
	}


static func parse_combat_event(raw: String) -> Dictionary:
	var parsed: Dictionary = _parse_object(raw)
	if parsed.has("ok") and not bool(parsed["ok"]):
		return parsed
	if not _version_ok(parsed):
		return _fail("protocol_mismatch", "The combat-event protocol version does not match this client.")
	return {
		"ok": true,
		"tick": int(parsed.get("tick", 0)),
		"events": _optional_array(parsed, "events"),
	}


static func parse_inventory_state(raw: String) -> Dictionary:
	var parsed: Dictionary = _parse_object(raw)
	if parsed.has("ok") and not bool(parsed["ok"]):
		return parsed
	if not _version_ok(parsed):
		return _fail("protocol_mismatch", "The inventory-state protocol version does not match this client.")
	return {
		"ok": true,
		"request_id": String(parsed.get("requestId", "")),
		"capacity": int(parsed.get("capacity", 20)),
		"items": _optional_array(parsed, "items"),
	}


static func parse_equipment_state(raw: String) -> Dictionary:
	var parsed: Dictionary = _parse_object(raw)
	if parsed.has("ok") and not bool(parsed["ok"]):
		return parsed
	if not _version_ok(parsed):
		return _fail("protocol_mismatch", "The equipment-state protocol version does not match this client.")
	return {
		"ok": true,
		"request_id": String(parsed.get("requestId", "")),
		"slots": _optional_slots(parsed),
		"derived": _optional_derived(parsed),
	}


static func parse_wallet_state(raw: String) -> Dictionary:
	var parsed: Dictionary = _parse_object(raw)
	if parsed.has("ok") and not bool(parsed["ok"]):
		return parsed
	if not _version_ok(parsed):
		return _fail("protocol_mismatch", "The wallet-state protocol version does not match this client.")
	return {
		"ok": true,
		"request_id": String(parsed.get("requestId", "")),
		"gold": int(parsed.get("gold", 0)),
	}


static func parse_progression_state(raw: String) -> Dictionary:
	var parsed: Dictionary = _parse_object(raw)
	if parsed.has("ok") and not bool(parsed["ok"]):
		return parsed
	if not _version_ok(parsed):
		return _fail("protocol_mismatch", "The progression-state protocol version does not match this client.")
	return {
		"ok": true,
		"request_id": String(parsed.get("requestId", "")),
		"progression": _optional_object(parsed, "progression"),
	}


static func parse_ability_state(raw: String) -> Dictionary:
	var parsed: Dictionary = _parse_object(raw)
	if parsed.has("ok") and not bool(parsed["ok"]):
		return parsed
	if not _version_ok(parsed):
		return _fail("protocol_mismatch", "The ability-state protocol version does not match this client.")
	return {
		"ok": true,
		"request_id": String(parsed.get("requestId", "")),
		"abilities": _optional_object(parsed, "abilities"),
	}


static func parse_party_state(raw: String) -> Dictionary:
	var parsed: Dictionary = _parse_object(raw)
	if parsed.has("ok") and not bool(parsed["ok"]):
		if not parsed.has("code"):
			parsed["code"] = "party_state_failed"
		if not parsed.has("message"):
			parsed["message"] = "The party request failed."
		return parsed
	if not _version_ok(parsed):
		return _fail("protocol_mismatch", "The party-state protocol version does not match this client.")
	var body: Dictionary = {
		"ok": true,
		"party": _optional_object(parsed, "party"),
		"pendingInvite": _optional_object(parsed, "pendingInvite"),
	}
	if parsed.has("deleted"):
		body["deleted"] = bool(parsed["deleted"])
	if parsed.has("code"):
		body["code"] = String(parsed["code"])
	return body


static func parse_party_event(raw: String) -> Dictionary:
	var parsed: Dictionary = _parse_object(raw)
	if parsed.has("ok") and not bool(parsed["ok"]):
		if not parsed.has("code"):
			parsed["code"] = "party_event_failed"
		if not parsed.has("message"):
			parsed["message"] = "The party event failed."
		return parsed
	if not _version_ok(parsed):
		return _fail("protocol_mismatch", "The party-event protocol version does not match this client.")
	return {
		"ok": true,
		"type": String(parsed.get("type", "")),
		"systemMessage": String(parsed.get("systemMessage", "")),
		"partyId": String(parsed.get("partyId", "")),
		"eventId": String(parsed.get("eventId", "")),
		"userId": String(parsed.get("userId", "")),
		"characterId": String(parsed.get("characterId", "")),
		"itemId": String(parsed.get("itemId", "")),
	}


static func parse_trade_state(raw: String) -> Dictionary:
	var parsed: Dictionary = _parse_object(raw)
	if parsed.has("ok") and not bool(parsed["ok"]):
		if not parsed.has("code"):
			parsed["code"] = "trade_state_failed"
		if not parsed.has("message"):
			parsed["message"] = "The trade request failed."
		return parsed
	if not _version_ok(parsed):
		return _fail("protocol_mismatch", "The trade-state protocol version does not match this client.")
	return {
		"ok": true,
		"request_id": String(parsed.get("requestId", "")),
		"trade": _optional_object(parsed, "trade"),
	}


static func new_request_id() -> String:
	return "r_%s_%s" % [str(Time.get_ticks_usec()), str(randi() % 1000000)]


static func handshake_payload(content_hash: String, content_version: String = "") -> Dictionary:
	var payload: Dictionary = {
		"clientVersion": CLIENT_VERSION,
		"protocolVersion": VERSION,
		"contentHash": content_hash,
	}
	if not content_version.is_empty():
		payload["contentVersion"] = content_version
	return payload


static func is_compatibility_code(code: String) -> bool:
	return (
		code == "protocol_mismatch"
		or code == "content_mismatch"
		or code == "save_incompatible"
		or code == "client_too_old"
		or code == "client_too_new"
		or code == "unsupported_save_version"
	)


static func is_maintenance_code(code: String) -> bool:
	return code == "server_maintenance" or code == "migration_required"


static func _parse_object(raw: String) -> Dictionary:
	if raw.length() > MAX_PAYLOAD_BYTES * 16:
		return _fail("payload_too_large", "The match payload exceeds the allowed size.")
	var parsed: Variant = JSON.parse_string(raw)
	if typeof(parsed) != TYPE_DICTIONARY:
		return _fail("malformed_json", "The match payload is not a JSON object.")
	return parsed


static func _version_ok(data: Dictionary) -> bool:
	var value: Variant = data.get("protocolVersion", null)
	if typeof(value) == TYPE_FLOAT or typeof(value) == TYPE_INT:
		return int(value) == VERSION
	return false


static func _hash_ok(data: Dictionary, expected_content_hash: String) -> bool:
	if typeof(data.get("contentHash", null)) != TYPE_STRING:
		return false
	var hash := String(data["contentHash"])
	var regex := RegEx.new()
	regex.compile(CONTENT_HASH_PATTERN)
	if regex.search(hash) == null:
		return false
	return hash == expected_content_hash


static func _optional_array(data: Dictionary, key: String) -> Array:
	if not data.has(key):
		return []
	if typeof(data[key]) != TYPE_ARRAY:
		return []
	return (data[key] as Array).duplicate(true)


static func _optional_inventory(data: Dictionary) -> Dictionary:
	if not data.has("inventory"):
		return {}
	if typeof(data["inventory"]) != TYPE_DICTIONARY:
		return {}
	return (data["inventory"] as Dictionary).duplicate(true)


static func _optional_equipment(data: Dictionary) -> Dictionary:
	if not data.has("equipment"):
		return {}
	if typeof(data["equipment"]) != TYPE_DICTIONARY:
		return {}
	return (data["equipment"] as Dictionary).duplicate(true)


static func _optional_derived(data: Dictionary) -> Dictionary:
	if not data.has("derived"):
		return {}
	if typeof(data["derived"]) != TYPE_DICTIONARY:
		return {}
	return (data["derived"] as Dictionary).duplicate(true)


static func _optional_wallet(data: Dictionary) -> Dictionary:
	return _optional_object(data, "wallet")


static func _optional_object(data: Dictionary, key: String) -> Dictionary:
	if not data.has(key):
		return {}
	if typeof(data[key]) != TYPE_DICTIONARY:
		return {}
	return (data[key] as Dictionary).duplicate(true)


static func _optional_slots(data: Dictionary) -> Dictionary:
	if not data.has("slots"):
		return {}
	if typeof(data["slots"]) != TYPE_DICTIONARY:
		return {}
	return (data["slots"] as Dictionary).duplicate(true)


static func next_input_seq(current: int, ack_seq: int) -> int:
	if ack_seq > current:
		return ack_seq
	return current


static func _ack_seq(players: Array, self_id: String) -> int:
	for entry in players:
		if typeof(entry) == TYPE_DICTIONARY and String(entry.get("userId", "")) == self_id:
			return int(entry.get("lastProcessedSeq", 0))
	return 0


static func _fail(code: String, message: String) -> Dictionary:
	return {"ok": false, "code": code, "message": message}
