class_name SliceSession
extends RefCounted

## One Nakama identity for the debug-only slice journey. Sends intentions only.

const BOOTSTRAP_RPC := "character_bootstrap"
const SELECT_RPC := "character_select"
const FULL_STATE_TIMEOUT_SEC := 12.0
const ACTION_TIMEOUT_SEC := 8.0
const INPUT_INTERVAL_SEC := 0.1

var tree: SceneTree
var backend: NakamaNetworkBackend
var label: String = ""
var user_id: String = ""
var username: String = ""
var match_id: String = ""
var character_id: String = ""
var selection_ticket: String = ""
var view: Dictionary = {}
var seq: int = 0
var last_action: Dictionary = {}
var last_interaction: Dictionary = {}
var last_system_code: String = ""
var got_full_state: bool = false
var fail_reason: String = ""


func _init(p_tree: SceneTree, p_label: String) -> void:
	tree = p_tree
	label = p_label
	backend = NakamaNetworkBackend.new()
	backend.match_state_received.connect(_on_match_state)


func authenticate(device_id: String, account_username: String) -> bool:
	var auth: Dictionary = await backend.authenticate_device(device_id, account_username)
	if not bool(auth.get("ok", false)):
		return _fail("authenticate:%s" % String(auth.get("code", "failed")))
	user_id = String(auth.get("user_id", ""))
	username = String(auth.get("username", account_username))
	if user_id.is_empty():
		return _fail("authenticate:missing_user_id")
	var socket: Dictionary = await backend.connect_socket()
	if not bool(socket.get("ok", false)):
		return _fail("socket:%s" % String(socket.get("code", "failed")))
	var handshake: Dictionary = await backend.rpc(
		MatchProtocol.SESSION_HANDSHAKE_RPC,
		JSON.stringify(MatchProtocol.handshake_payload(ContentRegistry.get_content_hash(), ContentRegistry.get_package_version()))
	)
	if not bool(handshake.get("ok", false)):
		var code := String(handshake.get("code", "failed"))
		if MatchProtocol.is_maintenance_code(code):
			return true
		return _fail("handshake:%s" % code)
	return true


func bootstrap(character_name: String) -> bool:
	var rpc_result: Dictionary = await backend.rpc(
		BOOTSTRAP_RPC,
		JSON.stringify({"name": character_name})
	)
	if not bool(rpc_result.get("ok", false)):
		return _fail("bootstrap:%s" % String(rpc_result.get("code", "failed")))
	var parsed: Variant = JSON.parse_string(String(rpc_result.get("payload", "")))
	if typeof(parsed) != TYPE_DICTIONARY:
		return _fail("bootstrap:malformed")
	if String((parsed as Dictionary).get("characterId", "")).is_empty():
		return _fail("bootstrap:missing_character")
	if String((parsed as Dictionary).get("name", "")) != character_name:
		return _fail("bootstrap:name")
	character_id = String((parsed as Dictionary).get("characterId", ""))
	return true


func select_character() -> bool:
	if character_id.is_empty():
		return _fail("select:missing_character")
	var rpc_result: Dictionary = await backend.rpc(
		SELECT_RPC,
		JSON.stringify({"characterId": character_id})
	)
	if not bool(rpc_result.get("ok", false)):
		return _fail("select:%s" % String(rpc_result.get("code", "failed")))
	var parsed: Variant = JSON.parse_string(String(rpc_result.get("payload", "")))
	if typeof(parsed) != TYPE_DICTIONARY:
		return _fail("select:malformed")
	selection_ticket = String((parsed as Dictionary).get("ticketId", ""))
	if selection_ticket.is_empty():
		return _fail("select:missing_ticket")
	return true


func join_zone() -> bool:
	if not await select_character():
		return false
	got_full_state = false
	view = {}
	seq = 0
	var rpc_result: Dictionary = await backend.rpc(MatchProtocol.FIND_OR_CREATE_STARTER_ZONE_RPC, "{}")
	if not bool(rpc_result.get("ok", false)):
		return _fail("find_zone:%s" % String(rpc_result.get("code", "failed")))
	var found: Dictionary = MatchProtocol.parse_find_or_create(
		String(rpc_result.get("payload", "")),
		ContentRegistry.get_content_hash()
	)
	if not bool(found.get("ok", false)):
		return _fail("find_zone:%s" % String(found.get("code", "failed")))
	var join_result: Dictionary = await backend.join_match(
		String(found["match_id"]),
		MatchProtocol.join_metadata(ContentRegistry.get_content_hash(), selection_ticket)
	)
	if not bool(join_result.get("ok", false)):
		return _fail("join:%s" % String(join_result.get("code", "failed")))
	match_id = String(join_result.get("match_id", found["match_id"]))
	if not await wait_until(func() -> bool: return got_full_state, FULL_STATE_TIMEOUT_SEC):
		return _fail("full_state_timeout")
	seq = MatchProtocol.next_input_seq(seq, int(view.get("ack_seq", 0)))
	return true


func leave_zone() -> void:
	await backend.leave_match()
	match_id = ""
	got_full_state = false


func send_input(axis: Vector2) -> void:
	if match_id.is_empty():
		return
	seq += 1
	await backend.send_match_state(MatchProtocol.CLIENT_INPUT, MoveIntent.payload_json(seq, axis))


func walk_to(target: Vector2, arrive_px: float, timeout_sec: float) -> bool:
	var deadline := Time.get_ticks_msec() + int(timeout_sec * 1000.0)
	while Time.get_ticks_msec() < deadline:
		var pos := self_pos()
		if pos.distance_to(target) <= arrive_px:
			await send_input(Vector2.ZERO)
			await tree.create_timer(INPUT_INTERVAL_SEC).timeout
			return true
		await send_input(MoveIntent.normalize_axes(target - pos))
		await tree.create_timer(INPUT_INTERVAL_SEC).timeout
	return _fail("walk_timeout")


func interact(target_id: String) -> Dictionary:
	var request_id := MatchProtocol.new_request_id()
	last_interaction = {}
	var sent: Dictionary = await backend.send_match_state(
		MatchProtocol.CLIENT_INTERACT,
		MatchProtocol.client_envelope_json({"targetId": target_id, "requestId": request_id})
	)
	if not bool(sent.get("ok", false)):
		return {"ok": false, "code": String(sent.get("code", "send_failed"))}
	if not await wait_until(func() -> bool: return String(last_interaction.get("request_id", "")) == request_id, ACTION_TIMEOUT_SEC):
		return {"ok": false, "code": "timeout"}
	return last_interaction


func send_action(opcode: int, extra: Dictionary) -> Dictionary:
	var request_id := MatchProtocol.new_request_id()
	extra["requestId"] = request_id
	last_action = {}
	var sent: Dictionary = await backend.send_match_state(opcode, MatchProtocol.client_envelope_json(extra))
	if not bool(sent.get("ok", false)):
		return {"ok": false, "code": String(sent.get("code", "send_failed")), "request_id": request_id}
	if not await wait_until(func() -> bool: return String(last_action.get("request_id", "")) == request_id, ACTION_TIMEOUT_SEC):
		return {"ok": false, "code": "timeout", "request_id": request_id}
	last_action["request_id"] = request_id
	return last_action


func wait_until(pred: Callable, timeout_sec: float) -> bool:
	var deadline := Time.get_ticks_msec() + int(timeout_sec * 1000.0)
	while Time.get_ticks_msec() < deadline:
		if bool(pred.call()):
			return true
		await tree.create_timer(0.05).timeout
	return false


func self_pos() -> Vector2:
	return player_pos(user_id)


func player_pos(p_user_id: String) -> Vector2:
	for entry in view.get("players", []):
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		if String(entry.get("userId", "")) == p_user_id:
			return Vector2(float(entry.get("x", 0.0)), float(entry.get("y", 0.0)))
	return Vector2.ZERO


func has_player(p_user_id: String) -> bool:
	for entry in view.get("players", []):
		if typeof(entry) == TYPE_DICTIONARY and String(entry.get("userId", "")) == p_user_id:
			return true
	return false


func player_record(p_user_id: String) -> Dictionary:
	for entry in view.get("players", []):
		if typeof(entry) == TYPE_DICTIONARY and String(entry.get("userId", "")) == p_user_id:
			return entry
	return {}


func npc_pos(npc_id: String) -> Vector2:
	for entry in view.get("npcs", []):
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		if String(entry.get("id", entry.get("npcId", ""))) == npc_id:
			return Vector2(float(entry.get("x", 0.0)), float(entry.get("y", 0.0)))
	return Vector2.ZERO


func living_slime() -> Dictionary:
	for entry in view.get("enemies", []):
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		var enemy: Dictionary = entry
		if String(enemy.get("enemyId", "")) != "enemy.green_slime":
			continue
		if enemy.has("alive") and not bool(enemy["alive"]):
			continue
		if int(enemy.get("health", 0)) <= 0:
			continue
		return enemy
	return {}


func gel_loot() -> Dictionary:
	for entry in view.get("loot", []):
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		if String(entry.get("itemId", "")) == "item.slime_gel":
			return entry
	return {}


func item_count(item_id: String) -> int:
	var inventory: Variant = view.get("inventory", {})
	if typeof(inventory) != TYPE_DICTIONARY:
		return 0
	var total := 0
	for entry in (inventory as Dictionary).get("items", []):
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		if String(entry.get("itemId", "")) == item_id:
			total += int(entry.get("quantity", 0))
	return total


func gold() -> int:
	var wallet: Variant = view.get("wallet", {})
	if typeof(wallet) != TYPE_DICTIONARY:
		return 0
	return int((wallet as Dictionary).get("gold", 0))


func quest_status(quest_id: String) -> String:
	for entry in view.get("quests", []):
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		if String(entry.get("questId", "")) == quest_id:
			return String(entry.get("status", ""))
	return ""


func _on_match_state(opcode: int, payload: String) -> void:
	var expected := ContentRegistry.get_content_hash()
	if opcode == MatchProtocol.SERVER_FULL_STATE:
		var parsed: Dictionary = MatchProtocol.parse_full_state(payload, expected)
		if not bool(parsed.get("ok", false)):
			fail_reason = "full_state:%s" % String(parsed.get("code", "invalid"))
			return
		view = parsed["view"]
		got_full_state = true
		seq = MatchProtocol.next_input_seq(seq, int(view.get("ack_seq", 0)))
		return
	if opcode == MatchProtocol.SERVER_SNAPSHOT:
		if view.is_empty():
			return
		var snap: Dictionary = MatchProtocol.parse_snapshot(payload, expected, view)
		if bool(snap.get("ok", false)):
			view = snap["view"]
		return
	if opcode == MatchProtocol.SERVER_INTERACTION_RESULT:
		last_interaction = MatchProtocol.parse_interaction_result(payload)
		return
	if opcode == MatchProtocol.SERVER_ACTION_RESULT:
		last_action = MatchProtocol.parse_action_result(payload)
		return
	if opcode == MatchProtocol.SERVER_QUEST_STATE:
		var quests: Dictionary = MatchProtocol.parse_quest_state(payload)
		if bool(quests.get("ok", false)):
			view["quests"] = quests.get("quests", [])
		return
	if opcode == MatchProtocol.SERVER_INVENTORY_STATE:
		var inventory: Dictionary = MatchProtocol.parse_inventory_state(payload)
		if bool(inventory.get("ok", false)):
			view["inventory"] = {
				"capacity": inventory.get("capacity", 20),
				"items": inventory.get("items", []),
			}
		return
	if opcode == MatchProtocol.SERVER_WALLET_STATE:
		var wallet: Dictionary = MatchProtocol.parse_wallet_state(payload)
		if bool(wallet.get("ok", false)):
			view["wallet"] = {"gold": wallet.get("gold", 0)}
		return
	if opcode == MatchProtocol.SERVER_SYSTEM_MESSAGE:
		var sys: Dictionary = MatchProtocol.parse_system_message(payload)
		last_system_code = String(sys.get("code", ""))


func _fail(reason: String) -> bool:
	fail_reason = "%s:%s" % [label, reason]
	return false
