class_name MatchProtocol
extends RefCounted

## Client/server opcode and envelope contract. Mirrors server/src/domain/protocol.ts.

const VERSION: int = 1
const MAX_PAYLOAD_BYTES: int = 2048
const REQUEST_ID_PATTERN := "^[A-Za-z0-9_-]{8,64}$"
const CONTENT_HASH_PATTERN := "^[a-f0-9]{64}$"
const INPUT_SEND_HZ: float = 10.0
const SNAPSHOT_RATE_HZ: float = 10.0
const SNAPSHOT_TIMEOUT_SEC: float = 2.0
const INTERP_DELAY_TICKS: float = 1.0
const SNAP_THRESHOLD_PX: float = 24.0

const CLIENT_INPUT: int = 1
const CLIENT_INTERACT: int = 2
const CLIENT_ATTACK: int = 3
const CLIENT_PICKUP: int = 4
const CLIENT_EQUIP: int = 5
const CLIENT_QUEST_ACCEPT: int = 6
const CLIENT_QUEST_TURN_IN: int = 7
const CLIENT_RESYNC_REQUEST: int = 8

const SERVER_FULL_STATE: int = 101
const SERVER_SNAPSHOT: int = 102
const SERVER_ACTION_RESULT: int = 103
const SERVER_COMBAT_EVENT: int = 104
const SERVER_INVENTORY_STATE: int = 105
const SERVER_QUEST_STATE: int = 106
const SERVER_INTERACTION_RESULT: int = 107
const SERVER_SYSTEM_MESSAGE: int = 108

const FIND_OR_CREATE_STARTER_ZONE_RPC: String = "find_or_create_starter_zone"


static func client_envelope(extra: Dictionary = {}) -> Dictionary:
	var payload: Dictionary = {"protocolVersion": VERSION}
	for key in extra.keys():
		payload[key] = extra[key]
	return payload


static func client_envelope_json(extra: Dictionary = {}) -> String:
	return JSON.stringify(client_envelope(extra))


static func join_metadata(content_hash: String) -> Dictionary:
	return {
		"protocolVersion": str(VERSION),
		"contentHash": content_hash,
	}


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
	for key in ["npcs", "enemies", "loot"]:
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
	}


static func is_compatibility_code(code: String) -> bool:
	return code == "protocol_mismatch" or code == "content_mismatch"


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


static func _ack_seq(players: Array, self_id: String) -> int:
	for entry in players:
		if typeof(entry) == TYPE_DICTIONARY and String(entry.get("userId", "")) == self_id:
			return int(entry.get("lastProcessedSeq", 0))
	return 0


static func _fail(code: String, message: String) -> Dictionary:
	return {"ok": false, "code": code, "message": message}
