extends Node

## Project-owned Nakama boundary. Caches the session in memory and never logs tokens.

signal authentication_started
signal authentication_finished(success: bool, message: String)
signal character_bootstrap_finished(success: bool, created: bool, message: String)
signal character_list_finished(success: bool, message: String)
signal zone_join_finished(success: bool, message: String)
signal chat_message_received(payload: Dictionary)
signal chat_presence_received(payload: Dictionary)
signal chat_error(code: String, message: String)
signal interaction_result_received(payload: Dictionary)
signal action_result_received(payload: Dictionary)
signal quest_state_received(payload: Dictionary)
signal combat_event_received(payload: Dictionary)
signal inventory_state_received(payload: Dictionary)
signal equipment_state_received(payload: Dictionary)
signal wallet_state_received(payload: Dictionary)
signal progression_state_received(payload: Dictionary)
signal ability_state_received(payload: Dictionary)
signal party_state_received(payload: Dictionary)
signal party_event_received(payload: Dictionary)
signal trade_state_received(payload: Dictionary)
signal gm_command_received(payload: Dictionary)
signal system_notice_received(code: String, message: String)
signal logged_out

const CHARACTER_BOOTSTRAP_RPC := "character_bootstrap"
const CHARACTER_LIST_RPC := "character_list"
const CHARACTER_CREATE_RPC := "character_create"
const CHARACTER_SELECT_RPC := "character_select"
const CHARACTER_SOFT_DELETE_RPC := "character_soft_delete"
const CHARACTER_RESTORE_RPC := "character_restore"
const FULL_STATE_TIMEOUT_SEC := 10.0
const TRANSFER_TIMEOUT_SEC := 20.0
const AUTH_COOLDOWN_START_MS := 1000
const AUTH_COOLDOWN_MAX_MS := 8000

var backend: RefCounted
var last_auth_attempted: bool = false
var socket_connected: bool = false
var match_id: String = ""
var zone_chat_id: String = ""
var party_chat_id: String = ""
var party_chat_party_id: String = ""
var _chat_join_busy: bool = false

var _device_id: String = ""
var _username: String = ""
var _email: String = ""
var _auth_mode: String = ""
var _auth_cooldown_ms: int = 0
var _auth_blocked_until_ms: int = 0
var _got_full_state: bool = false
var _match_signals_connected: bool = false
var _chat_signals_connected: bool = false
var _socket_signals_connected: bool = false
var _intentional_disconnect: bool = false
var _reconnect_in_progress: bool = false
var _reconnect_cancelled: bool = false
var _join_in_progress: bool = false
var _pending_reconnect: bool = false
var reconnect_policy: ReconnectPolicy = ReconnectPolicy.new()


func is_authentication_configured() -> bool:
	return true


func authenticate_device(device_id: String, username: String = "") -> void:
	if not _auth_rate_allows():
		return
	last_auth_attempted = true
	_device_id = device_id
	_username = username
	_email = ""
	_auth_mode = SessionCache.AUTH_MODE_DEVICE
	authentication_started.emit()
	AppState.notify_loading_started("auth")
	var auth: Dictionary = await _backend().authenticate_device(device_id, username)
	if not bool(auth.get("ok", false)):
		_fail_auth(auth)
		return
	await _finish_auth(auth, username)


func authenticate_email(email: String, password: String, username: String = "", create: bool = false) -> void:
	if not _auth_rate_allows():
		return
	last_auth_attempted = true
	_device_id = ""
	_email = email
	_username = username
	_auth_mode = SessionCache.AUTH_MODE_EMAIL
	authentication_started.emit()
	AppState.notify_loading_started("auth")
	if not _backend().has_method("authenticate_email"):
		_fail_auth({"code": "authentication_failed", "message": "Email sign-in is unavailable."})
		return
	var auth: Dictionary = await _backend().authenticate_email(email, password, username, create)
	if not bool(auth.get("ok", false)):
		_fail_auth(auth)
		return
	await _finish_auth(auth, username)


func import_session(token: String, refresh_token: String, p_user_id: String, p_username: String) -> void:
	if not _auth_rate_allows():
		return
	last_auth_attempted = true
	_device_id = ""
	_email = AccountService.pending_email
	_username = p_username
	_auth_mode = SessionCache.AUTH_MODE_EMAIL
	authentication_started.emit()
	AppState.notify_loading_started("auth")
	if not _backend().has_method("import_session"):
		_fail_auth({"code": "authentication_failed", "message": "Session import is unavailable."})
		return
	var auth: Dictionary = await _backend().import_session(token, refresh_token, p_user_id, p_username)
	if not bool(auth.get("ok", false)):
		_fail_auth(auth)
		return
	await _finish_auth(auth, p_username)


func restore_cached_session() -> bool:
	var cached := SessionCache.load_cache()
	if cached.is_empty():
		return false
	if not _backend().has_method("restore_cached_session"):
		return false
	last_auth_attempted = true
	_auth_mode = String(cached.get("auth_mode", ""))
	_device_id = String(cached.get("device_id", ""))
	_username = String(cached.get("username", ""))
	if _auth_mode == SessionCache.AUTH_MODE_EMAIL:
		_email = String(cached.get("username", "cached"))
	authentication_started.emit()
	AppState.notify_loading_started("auth")
	var restored: Dictionary = await _backend().restore_cached_session()
	if not bool(restored.get("ok", false)):
		SessionCache.clear()
		socket_connected = false
		AppState.notify_loading_completed("auth")
		return false
	await _finish_auth(restored, _username)
	return true


func _finish_auth(auth: Dictionary, username: String) -> void:
	_note_auth_success()
	var socket: Dictionary = await _backend().connect_socket()
	if not bool(socket.get("ok", false)):
		_fail_auth(socket)
		return
	socket_connected = true
	_intentional_disconnect = false
	_connect_match_signals()
	_connect_chat_signals()
	_connect_socket_signals()
	var handshake := await _run_session_handshake()
	if not bool(handshake.get("ok", false)):
		_fail_auth(handshake)
		return
	AppState.notify_authenticated(String(auth.get("user_id", "")), String(auth.get("username", username)))
	AppState.notify_loading_completed("auth")
	authentication_finished.emit(true, "")


func _run_session_handshake() -> Dictionary:
	var rpc_result: Dictionary = await _backend().rpc(
		MatchProtocol.SESSION_HANDSHAKE_RPC,
		JSON.stringify(MatchProtocol.handshake_payload(ContentRegistry.get_content_hash(), ContentRegistry.get_package_version()))
	)
	if not bool(rpc_result.get("ok", false)):
		var code := String(rpc_result.get("code", "rpc_failed"))
		var message := String(rpc_result.get("message", "The server rejected the session handshake."))
		if MatchProtocol.is_compatibility_code(code) or MatchProtocol.is_maintenance_code(code):
			return {"ok": false, "code": code, "message": _handshake_message(code, message)}
		if _looks_like_compat_message(message):
			return {"ok": false, "code": _compat_code_from_message(message), "message": _handshake_message(_compat_code_from_message(message), message)}
		return rpc_result
	var parsed: Variant = JSON.parse_string(String(rpc_result.get("payload", "")))
	if typeof(parsed) != TYPE_DICTIONARY:
		return {"ok": true}
	var data: Dictionary = parsed
	var code := String(data.get("code", "ok"))
	if MatchProtocol.is_compatibility_code(code):
		return {"ok": false, "code": code, "message": _handshake_message(code, String(data.get("message", "")))}
	if bool(data.get("maintenance", false)) or code == "server_maintenance":
		var notice := String(data.get("message", "The server is in maintenance. Gameplay joins are paused."))
		if notice.is_empty():
			notice = "The server is in maintenance. Gameplay joins are paused."
		NotificationService.push(notice)
		AppState.report_recoverable("server_maintenance", notice)
	return {"ok": true}


func _handshake_message(code: String, fallback: String) -> String:
	if code == "client_too_old":
		return "This client is too old for the server. Update the client."
	if code == "client_too_new":
		return "This client is too new for the server. Use the matching release."
	if code == "protocol_mismatch":
		return "The client protocol version does not match the server."
	if code == "content_mismatch":
		return "The client content catalog does not match the server."
	if code == "unsupported_save_version":
		return "This save is incompatible with the server."
	if code == "server_maintenance":
		return "The server is in maintenance. Gameplay joins are paused."
	if code == "migration_required":
		return "The server is applying a save migration. Try again shortly."
	if fallback.is_empty():
		return "This client is not compatible with the server."
	return fallback


func _looks_like_compat_message(message: String) -> bool:
	var lowered := message.to_lower()
	return (
		lowered.contains("client_too_old")
		or lowered.contains("client_too_new")
		or lowered.contains("protocol_mismatch")
		or lowered.contains("content_mismatch")
		or lowered.contains("unsupported_save_version")
		or lowered.contains("server_maintenance")
		or lowered.contains("migration_required")
	)


func _compat_code_from_message(message: String) -> String:
	var lowered := message.to_lower()
	if lowered.contains("client_too_old"):
		return "client_too_old"
	if lowered.contains("client_too_new"):
		return "client_too_new"
	if lowered.contains("protocol_mismatch"):
		return "protocol_mismatch"
	if lowered.contains("content_mismatch"):
		return "content_mismatch"
	if lowered.contains("unsupported_save_version"):
		return "unsupported_save_version"
	if lowered.contains("server_maintenance"):
		return "server_maintenance"
	if lowered.contains("migration_required"):
		return "migration_required"
	return "rpc_failed"


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


func list_characters() -> bool:
	AppState.notify_loading_started("character")
	var session_ok := await ensure_session()
	if not session_ok:
		AppState.notify_loading_completed("character")
		character_list_finished.emit(false, AppState.last_error_message)
		return false
	var rpc_result: Dictionary = await _backend().rpc(CHARACTER_LIST_RPC, "{}")
	if not bool(rpc_result.get("ok", false)):
		_fail_character(rpc_result)
		character_list_finished.emit(false, AppState.last_error_message)
		return false
	var parsed: Variant = JSON.parse_string(String(rpc_result.get("payload", "")))
	if typeof(parsed) != TYPE_DICTIONARY:
		_fail_character({"code": "malformed_json", "message": "The character list was not valid JSON."})
		character_list_finished.emit(false, AppState.last_error_message)
		return false
	var data: Dictionary = parsed
	var characters: Array = data.get("characters", [])
	AppState.notify_character_list(characters, int(data.get("slotLimit", 3)), int(data.get("liveCount", 0)))
	AppState.notify_loading_completed("character")
	character_list_finished.emit(true, "")
	character_bootstrap_finished.emit(true, false, "")
	return true


func create_character(character_name: String, class_id: String) -> bool:
	AppState.notify_loading_started("character")
	var session_ok := await ensure_session()
	if not session_ok:
		AppState.notify_loading_completed("character")
		character_bootstrap_finished.emit(false, false, AppState.last_error_message)
		return false
	var rpc_result: Dictionary = await _backend().rpc(
		CHARACTER_CREATE_RPC,
		JSON.stringify({"name": character_name, "classId": class_id})
	)
	if not bool(rpc_result.get("ok", false)):
		_fail_character(rpc_result)
		return false
	await list_characters()
	AppState.notify_loading_completed("character")
	character_bootstrap_finished.emit(true, true, "")
	return true


func select_character(character_id: String) -> bool:
	AppState.notify_loading_started("character")
	var session_ok := await ensure_session()
	if not session_ok:
		AppState.notify_loading_completed("character")
		character_bootstrap_finished.emit(false, false, AppState.last_error_message)
		return false
	var rpc_result: Dictionary = await _backend().rpc(
		CHARACTER_SELECT_RPC,
		JSON.stringify({"characterId": character_id})
	)
	if not bool(rpc_result.get("ok", false)):
		_fail_character(rpc_result)
		return false
	var parsed: Variant = JSON.parse_string(String(rpc_result.get("payload", "")))
	if typeof(parsed) != TYPE_DICTIONARY:
		_fail_character({"code": "malformed_json", "message": "The selection response was not valid JSON."})
		return false
	var data: Dictionary = parsed
	var view := {
		"character_id": String(data.get("characterId", character_id)),
		"name": String(data.get("name", "")),
		"class_id": String(data.get("classId", "")),
		"created": false,
		"storage_version": "",
		"content_id": "player.base",
		"zone_id": "zone.starter",
		"base_stats": {},
		"position": {},
	}
	if AppState.character_view.has("base_stats"):
		view["base_stats"] = AppState.character_view["base_stats"]
	if AppState.character_view.has("position"):
		view["position"] = AppState.character_view["position"]
	AppState.notify_selection(String(data.get("ticketId", "")), int(data.get("expiresAt", 0)), view)
	AppState.notify_loading_completed("character")
	character_bootstrap_finished.emit(true, false, "")
	return not AppState.selection_ticket.is_empty()


func soft_delete_character(character_id: String) -> bool:
	var rpc_result: Dictionary = await _backend().rpc(
		CHARACTER_SOFT_DELETE_RPC,
		JSON.stringify({"characterId": character_id})
	)
	if not bool(rpc_result.get("ok", false)):
		_fail_character(rpc_result)
		return false
	return await list_characters()


func restore_character(character_id: String) -> bool:
	var rpc_result: Dictionary = await _backend().rpc(
		CHARACTER_RESTORE_RPC,
		JSON.stringify({"characterId": character_id})
	)
	if not bool(rpc_result.get("ok", false)):
		_fail_character(rpc_result)
		return false
	return await list_characters()


func join_starter_zone() -> bool:
	AppState.notify_loading_started("zone")
	_join_in_progress = true
	_pending_reconnect = false
	var session_ok := await ensure_session()
	if not session_ok:
		_join_in_progress = false
		AppState.notify_loading_completed("zone")
		zone_join_finished.emit(false, AppState.last_error_message)
		return false
	_connect_match_signals()
	_connect_chat_signals()
	_connect_socket_signals()
	_got_full_state = false
	var character_id := String(AppState.character_view.get("character_id", ""))
	if character_id.is_empty():
		_join_in_progress = false
		_fail_zone({"code": "selection_required", "message": "Select a character before entering the zone."})
		return false
	var selected := await select_character(character_id)
	if not selected:
		_join_in_progress = false
		AppState.notify_loading_completed("zone")
		zone_join_finished.emit(false, AppState.last_error_message)
		return false
	var rpc_result: Dictionary = await _backend().rpc(MatchProtocol.FIND_OR_CREATE_STARTER_ZONE_RPC, "{}")
	if not bool(rpc_result.get("ok", false)):
		_join_in_progress = false
		_fail_zone(rpc_result)
		return false
	var found: Dictionary = MatchProtocol.parse_find_or_create(
		String(rpc_result.get("payload", "")),
		ContentRegistry.get_content_hash()
	)
	if not bool(found.get("ok", false)):
		_join_in_progress = false
		_fail_zone(found)
		return false
	var join_result: Dictionary = await _backend().join_match(
		String(found["match_id"]),
		MatchProtocol.join_metadata(ContentRegistry.get_content_hash(), AppState.selection_ticket)
	)
	if not bool(join_result.get("ok", false)):
		_join_in_progress = false
		_fail_zone(join_result)
		return false
	match_id = String(join_result.get("match_id", found["match_id"]))
	var received := await _wait_for_full_state(FULL_STATE_TIMEOUT_SEC)
	_join_in_progress = false
	if not received:
		if not AppState.has_fatal_error:
			_fail_zone({"code": "full_state_timeout", "message": "The server did not send a valid full state."})
		else:
			AppState.notify_loading_completed("zone")
			zone_join_finished.emit(false, AppState.last_error_message)
		return false
	AppState.notify_loading_completed("zone")
	zone_join_finished.emit(true, "")
	if _pending_reconnect:
		_pending_reconnect = false
		await start_reconnect()
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


func send_quest_turn_in(quest_id: String, npc_id: String, request_id: String = "") -> Dictionary:
	if match_id.is_empty():
		return {"ok": false, "code": "not_in_match", "message": "Not in a match."}
	var rid := request_id
	if rid.is_empty():
		rid = MatchProtocol.new_request_id()
	return await _backend().send_match_state(
		MatchProtocol.CLIENT_QUEST_TURN_IN,
		MatchProtocol.client_envelope_json({"questId": quest_id, "npcId": npc_id, "requestId": rid})
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


func send_equip(instance_id: String, slot: String, request_id: String) -> Dictionary:
	if match_id.is_empty():
		return {"ok": false, "code": "not_in_match", "message": "Not in a match."}
	var extra: Dictionary = {"slot": slot, "requestId": request_id}
	if not instance_id.is_empty():
		extra["instanceId"] = instance_id
	return await _backend().send_match_state(
		MatchProtocol.CLIENT_EQUIP,
		MatchProtocol.client_envelope_json(extra)
	)


func send_destroy_item(instance_id: String, request_id: String, quantity: int = -1) -> Dictionary:
	if match_id.is_empty():
		return {"ok": false, "code": "not_in_match", "message": "Not in a match."}
	var extra: Dictionary = {"instanceId": instance_id, "requestId": request_id}
	if quantity >= 1:
		extra["quantity"] = quantity
	return await _backend().send_match_state(
		MatchProtocol.CLIENT_DESTROY_ITEM,
		MatchProtocol.client_envelope_json(extra)
	)


func send_split_stack(instance_id: String, quantity: int, request_id: String) -> Dictionary:
	if match_id.is_empty():
		return {"ok": false, "code": "not_in_match", "message": "Not in a match."}
	return await _backend().send_match_state(
		MatchProtocol.CLIENT_SPLIT_STACK,
		MatchProtocol.client_envelope_json({
			"instanceId": instance_id,
			"quantity": quantity,
			"requestId": request_id,
		})
	)


func send_move_item(instance_id: String, to_slot_index: int, request_id: String) -> Dictionary:
	if match_id.is_empty():
		return {"ok": false, "code": "not_in_match", "message": "Not in a match."}
	return await _backend().send_match_state(
		MatchProtocol.CLIENT_MOVE_ITEM,
		MatchProtocol.client_envelope_json({
			"instanceId": instance_id,
			"toSlotIndex": to_slot_index,
			"requestId": request_id,
		})
	)


func send_allocate_attributes(attribute_id: String, amount: int, request_id: String) -> Dictionary:
	if match_id.is_empty():
		return {"ok": false, "code": "not_in_match", "message": "Not in a match."}
	return await _backend().send_match_state(
		MatchProtocol.CLIENT_ALLOCATE_ATTRIBUTES,
		MatchProtocol.client_envelope_json({
			"attributeId": attribute_id,
			"amount": amount,
			"requestId": request_id,
		})
	)


func send_use_ability(extra: Dictionary) -> Dictionary:
	if match_id.is_empty():
		return {"ok": false, "code": "not_in_match", "message": "Not in a match."}
	return await _backend().send_match_state(
		MatchProtocol.CLIENT_USE_ABILITY,
		MatchProtocol.client_envelope_json(extra)
	)


func send_cancel_cast(request_id: String) -> Dictionary:
	if match_id.is_empty():
		return {"ok": false, "code": "not_in_match", "message": "Not in a match."}
	return await _backend().send_match_state(
		MatchProtocol.CLIENT_CANCEL_CAST,
		MatchProtocol.client_envelope_json({"requestId": request_id})
	)


func send_assign_hotbar(slot_index: int, ability_id: String, request_id: String) -> Dictionary:
	if match_id.is_empty():
		return {"ok": false, "code": "not_in_match", "message": "Not in a match."}
	var extra: Dictionary = {"slotIndex": slot_index, "requestId": request_id}
	if not ability_id.is_empty():
		extra["abilityId"] = ability_id
	return await _backend().send_match_state(
		MatchProtocol.CLIENT_ASSIGN_HOTBAR,
		MatchProtocol.client_envelope_json(extra)
	)


func send_unlock_ability(ability_id: String, request_id: String) -> Dictionary:
	if match_id.is_empty():
		return {"ok": false, "code": "not_in_match", "message": "Not in a match."}
	return await _backend().send_match_state(
		MatchProtocol.CLIENT_UNLOCK_ABILITY,
		MatchProtocol.client_envelope_json({"abilityId": ability_id, "requestId": request_id})
	)


func send_set_target(target_id: String, request_id: String, intent: String = "") -> Dictionary:
	if match_id.is_empty():
		return {"ok": false, "code": "not_in_match", "message": "Not in a match."}
	var extra: Dictionary = {"requestId": request_id}
	if not target_id.is_empty():
		extra["targetId"] = target_id
	if not intent.is_empty():
		extra["intent"] = intent
	return await _backend().send_match_state(
		MatchProtocol.CLIENT_SET_TARGET,
		MatchProtocol.client_envelope_json(extra)
	)


func send_release_respawn(request_id: String) -> Dictionary:
	if match_id.is_empty():
		return {"ok": false, "code": "not_in_match", "message": "Not in a match."}
	return await _backend().send_match_state(
		MatchProtocol.CLIENT_RELEASE_RESPAWN,
		MatchProtocol.client_envelope_json({"requestId": request_id})
	)


func send_vendor_buy(npc_id: String, item_id: String, quantity: int = 1, request_id: String = "") -> Dictionary:
	if match_id.is_empty():
		return {"ok": false, "code": "not_in_match", "message": "Not in a match."}
	var rid := request_id
	if rid.is_empty():
		rid = MatchProtocol.new_request_id()
	var extra: Dictionary = {"npcId": npc_id, "itemId": item_id, "requestId": rid}
	if quantity != 1:
		extra["quantity"] = quantity
	return await _backend().send_match_state(
		MatchProtocol.CLIENT_VENDOR_BUY,
		MatchProtocol.client_envelope_json(extra)
	)


func send_vendor_sell(npc_id: String, instance_id: String, quantity: int = 0, request_id: String = "") -> Dictionary:
	if match_id.is_empty():
		return {"ok": false, "code": "not_in_match", "message": "Not in a match."}
	var rid := request_id
	if rid.is_empty():
		rid = MatchProtocol.new_request_id()
	var extra: Dictionary = {"npcId": npc_id, "instanceId": instance_id, "requestId": rid}
	if quantity > 0:
		extra["quantity"] = quantity
	return await _backend().send_match_state(
		MatchProtocol.CLIENT_VENDOR_SELL,
		MatchProtocol.client_envelope_json(extra)
	)


func send_inn_rest(npc_id: String, mode: String = "", request_id: String = "") -> Dictionary:
	if match_id.is_empty():
		return {"ok": false, "code": "not_in_match", "message": "Not in a match."}
	var rid := request_id
	if rid.is_empty():
		rid = MatchProtocol.new_request_id()
	var extra: Dictionary = {"npcId": npc_id, "requestId": rid}
	if not mode.is_empty():
		extra["mode"] = mode
	return await _backend().send_match_state(
		MatchProtocol.CLIENT_INN_REST,
		MatchProtocol.client_envelope_json(extra)
	)


func send_cave_enter(npc_id: String, request_id: String = "") -> Dictionary:
	if match_id.is_empty():
		return {"ok": false, "code": "not_in_match", "message": "Not in a match."}
	var rid := request_id
	if rid.is_empty():
		rid = MatchProtocol.new_request_id()
	return await _backend().send_match_state(
		MatchProtocol.CLIENT_CAVE_ENTER,
		MatchProtocol.client_envelope_json({"npcId": npc_id, "requestId": rid})
	)


func send_cave_exit(npc_id: String, request_id: String = "") -> Dictionary:
	if match_id.is_empty():
		return {"ok": false, "code": "not_in_match", "message": "Not in a match."}
	var rid := request_id
	if rid.is_empty():
		rid = MatchProtocol.new_request_id()
	return await _backend().send_match_state(
		MatchProtocol.CLIENT_CAVE_EXIT,
		MatchProtocol.client_envelope_json({"npcId": npc_id, "requestId": rid})
	)


func send_trade_invite(target_id: String, request_id: String = "") -> Dictionary:
	if match_id.is_empty():
		return {"ok": false, "code": "not_in_match", "message": "Not in a match."}
	var rid := request_id
	if rid.is_empty():
		rid = MatchProtocol.new_request_id()
	return await _backend().send_match_state(
		MatchProtocol.CLIENT_TRADE_INVITE,
		MatchProtocol.client_envelope_json({"targetId": target_id, "requestId": rid})
	)


func send_trade_accept_invite(trade_id: String, request_id: String = "") -> Dictionary:
	return await _send_trade_id(MatchProtocol.CLIENT_TRADE_ACCEPT_INVITE, trade_id, request_id)


func send_trade_decline_invite(trade_id: String, request_id: String = "") -> Dictionary:
	return await _send_trade_id(MatchProtocol.CLIENT_TRADE_DECLINE_INVITE, trade_id, request_id)


func send_trade_set_offer(trade_id: String, instance_id: String, quantity: int = 0, request_id: String = "") -> Dictionary:
	if match_id.is_empty():
		return {"ok": false, "code": "not_in_match", "message": "Not in a match."}
	var rid := request_id
	if rid.is_empty():
		rid = MatchProtocol.new_request_id()
	var extra: Dictionary = {"tradeId": trade_id, "instanceId": instance_id, "requestId": rid}
	if quantity > 0:
		extra["quantity"] = quantity
	return await _backend().send_match_state(
		MatchProtocol.CLIENT_TRADE_SET_OFFER,
		MatchProtocol.client_envelope_json(extra)
	)


func send_trade_remove_offer(trade_id: String, instance_id: String, request_id: String = "") -> Dictionary:
	if match_id.is_empty():
		return {"ok": false, "code": "not_in_match", "message": "Not in a match."}
	var rid := request_id
	if rid.is_empty():
		rid = MatchProtocol.new_request_id()
	return await _backend().send_match_state(
		MatchProtocol.CLIENT_TRADE_REMOVE_OFFER,
		MatchProtocol.client_envelope_json({"tradeId": trade_id, "instanceId": instance_id, "requestId": rid})
	)


func send_trade_set_gold(trade_id: String, amount: int, request_id: String = "") -> Dictionary:
	if match_id.is_empty():
		return {"ok": false, "code": "not_in_match", "message": "Not in a match."}
	var rid := request_id
	if rid.is_empty():
		rid = MatchProtocol.new_request_id()
	return await _backend().send_match_state(
		MatchProtocol.CLIENT_TRADE_SET_GOLD,
		MatchProtocol.client_envelope_json({"tradeId": trade_id, "amount": amount, "requestId": rid})
	)


func send_trade_accept_revision(trade_id: String, revision: int, request_id: String = "") -> Dictionary:
	if match_id.is_empty():
		return {"ok": false, "code": "not_in_match", "message": "Not in a match."}
	var rid := request_id
	if rid.is_empty():
		rid = MatchProtocol.new_request_id()
	return await _backend().send_match_state(
		MatchProtocol.CLIENT_TRADE_ACCEPT_REVISION,
		MatchProtocol.client_envelope_json({"tradeId": trade_id, "revision": revision, "requestId": rid})
	)


func send_trade_cancel(trade_id: String, request_id: String = "") -> Dictionary:
	return await _send_trade_id(MatchProtocol.CLIENT_TRADE_CANCEL, trade_id, request_id)


func _send_trade_id(opcode: int, trade_id: String, request_id: String) -> Dictionary:
	if match_id.is_empty():
		return {"ok": false, "code": "not_in_match", "message": "Not in a match."}
	var rid := request_id
	if rid.is_empty():
		rid = MatchProtocol.new_request_id()
	return await _backend().send_match_state(
		opcode,
		MatchProtocol.client_envelope_json({"tradeId": trade_id, "requestId": rid})
	)


func begin_transfer(payload: Dictionary) -> bool:
	var ticket_id := String(payload.get("ticket_id", ""))
	var destination := String(payload.get("destination_match_id", ""))
	if ticket_id.is_empty() or destination.is_empty():
		CaveService.transferring = false
		return false
	AppState.notify_loading_started("transfer")
	_got_full_state = false
	await leave_zone_chat()
	if _backend().has_method("leave_match"):
		await _backend().leave_match()
	match_id = ""
	var join_result: Dictionary = await _backend().join_match(
		destination,
		MatchProtocol.join_metadata(ContentRegistry.get_content_hash(), "", ticket_id)
	)
	if not bool(join_result.get("ok", false)):
		CaveService.transferring = false
		AppState.notify_loading_completed("transfer")
		AppState.report_recoverable(String(join_result.get("code", "transfer_failed")), "Could not join the destination.")
		return false
	match_id = String(join_result.get("match_id", destination))
	var received := await _wait_for_full_state(TRANSFER_TIMEOUT_SEC)
	CaveService.transferring = false
	if not received:
		AppState.notify_loading_completed("transfer")
		AppState.report_recoverable("transfer_timeout", "The transfer timed out.")
		return false
	await join_zone_chat()
	AppState.notify_loading_completed("transfer")
	return true


func _wait_chat_join_slot() -> void:
	while _chat_join_busy:
		var tree := get_tree()
		if tree == null:
			break
		await tree.process_frame


func join_zone_chat() -> bool:
	if not should_join_zone_chat():
		return true
	await _wait_chat_join_slot()
	_chat_join_busy = true
	var joined := await _join_zone_chat_unlocked()
	_chat_join_busy = false
	return joined


func should_join_zone_chat() -> bool:
	return not in_party_cave()


func in_party_cave() -> bool:
	var instance: Variant = AppState.zone_view.get("instance", {})
	if typeof(instance) == TYPE_DICTIONARY:
		if String(instance.get("type", "")) == "party_cave":
			return true
	return String(AppState.zone_view.get("zone_id", "")) == "zone.cave"


func _join_zone_chat_unlocked() -> bool:
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


func rpc_party(rpc_id: String, payload: Dictionary) -> void:
	_rpc_party(rpc_id, payload)


func rpc_gm(rpc_id: String, payload: Dictionary) -> void:
	_rpc_gm(rpc_id, payload)


func _rpc_gm(rpc_id: String, payload: Dictionary) -> void:
	if _backend().is_session_expired():
		var session_ok := await ensure_session()
		if not session_ok:
			gm_command_received.emit({"ok": false, "code": "session_expired"})
			return
	var encoded := JSON.stringify(payload)
	var result: Dictionary = await _backend().rpc(rpc_id, encoded)
	if not bool(result.get("ok", false)):
		var auth_code := String(result.get("code", "rpc_failed"))
		if auth_code == "session_expired" or auth_code == "unauthenticated":
			if await ensure_session():
				result = await _backend().rpc(rpc_id, encoded)
	if not bool(result.get("ok", false)):
		var code := String(result.get("code", "rpc_failed"))
		if code == "session_expired" or code == "unauthenticated":
			AppState.report_recoverable("session_expired", String(result.get("message", "Session expired.")))
			gm_command_received.emit({"ok": false, "code": "session_expired"})
			return
		gm_command_received.emit({"ok": false, "code": code, "message": String(result.get("message", ""))})
		return
	var parsed: Variant = JSON.parse_string(String(result.get("payload", "")))
	if typeof(parsed) != TYPE_DICTIONARY:
		gm_command_received.emit({"ok": false, "code": "rpc_failed"})
		return
	gm_command_received.emit(parsed)


func _rpc_party(rpc_id: String, payload: Dictionary) -> void:
	# Party buttons must never open the recoverable login modal. Refresh the HTTP
	# token if needed, then keep failures on the party HUD even while the match socket is live.
	if _backend().is_session_expired():
		var refreshed_first: Dictionary = await _backend().refresh_session()
		if not bool(refreshed_first.get("ok", false)) and not _device_id.is_empty():
			await _backend().authenticate_device(_device_id, _username)
	var encoded := JSON.stringify(payload)
	var result: Dictionary = await _backend().rpc(rpc_id, encoded)
	if not bool(result.get("ok", false)):
		var auth_code := String(result.get("code", "rpc_failed"))
		if auth_code == "session_expired" or auth_code == "unauthenticated":
			var refreshed: Dictionary = await _backend().refresh_session()
			if bool(refreshed.get("ok", false)):
				result = await _backend().rpc(rpc_id, encoded)
			elif not _device_id.is_empty():
				var reauth: Dictionary = await _backend().authenticate_device(_device_id, _username)
				if bool(reauth.get("ok", false)):
					result = await _backend().rpc(rpc_id, encoded)
	if not bool(result.get("ok", false)):
		var code := String(result.get("code", "rpc_failed"))
		var message := String(result.get("message", "The party request failed."))
		var domain := _party_rpc_failure_code(code, message)
		if domain.is_empty():
			domain = code if not code.is_empty() else "party_failed"
		_emit_party_rpc_failure(domain, message)
		return
	var raw := String(result.get("payload", ""))
	if raw.is_empty():
		return
	var parsed: Variant = JSON.parse_string(raw)
	if typeof(parsed) != TYPE_DICTIONARY:
		return
	party_state_received.emit(parsed)


func _emit_party_rpc_failure(code: String, _message: String) -> void:
	var hud_code := code
	if hud_code == "session_expired" or hud_code == "unauthenticated" or hud_code == "rpc_failed" or hud_code.is_empty():
		hud_code = "party_failed"
	party_state_received.emit({"ok": false, "code": hud_code})


func join_party_chat(party_id: String) -> bool:
	await _wait_chat_join_slot()
	_chat_join_busy = true
	var joined := await _join_party_chat_unlocked(party_id)
	_chat_join_busy = false
	return joined


func _join_party_chat_unlocked(party_id: String) -> bool:
	_connect_chat_signals()
	if party_id.is_empty() or backend == null:
		return false
	if party_chat_party_id == party_id and not party_chat_id.is_empty():
		return true
	if not backend.has_method("join_chat"):
		return false
	if not party_chat_id.is_empty():
		await leave_party_chat()
	var joined: Dictionary = await backend.join_chat(
		"party." + party_id,
		ZoneChat.CHANNEL_TYPE_ROOM,
		false,
		false
	)
	if not bool(joined.get("ok", false)):
		return false
	party_chat_id = String(joined.get("channel_id", ""))
	party_chat_party_id = party_id
	if party_chat_id.is_empty():
		party_chat_party_id = ""
		return false
	return true


func leave_party_chat() -> void:
	if party_chat_id.is_empty():
		party_chat_party_id = ""
		return
	var channel_id := party_chat_id
	party_chat_id = ""
	party_chat_party_id = ""
	if backend != null and backend.has_method("leave_chat"):
		await backend.leave_chat(channel_id)


func send_party_chat(text: String, party_id: String) -> Dictionary:
	var reason := ZoneChat.reject_reason(text)
	if not reason.is_empty():
		var message := "Chat message is empty." if reason == "empty_message" else "Chat message exceeds 200 characters."
		_fail_chat(reason, message)
		return {"ok": false, "code": reason, "message": message}
	if party_id.is_empty() or party_chat_id.is_empty() or backend == null or not backend.has_method("send_chat_message"):
		_fail_chat("chat_send_failed", "Join party chat before sending a message.")
		return {"ok": false, "code": "chat_send_failed", "message": "Join party chat before sending a message."}
	var sent: Dictionary = await backend.send_chat_message(party_chat_id, ZoneChat.party_payload(text, party_id))
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


func rejoin_starter_zone() -> bool:
	var previous_match := match_id
	match_id = ""
	zone_chat_id = ""
	_got_full_state = false
	var session_ok := await ensure_session()
	if not session_ok:
		return false
	_connect_match_signals()
	_connect_chat_signals()
	_connect_socket_signals()
	AppState.selection_ticket = ""
	var character_id := String(AppState.character_view.get("character_id", ""))
	if not character_id.is_empty():
		var selected := await select_character(character_id)
		if not selected:
			return false
	var rpc_result: Dictionary = await _backend().rpc(MatchProtocol.FIND_OR_CREATE_STARTER_ZONE_RPC, "{}")
	if not bool(rpc_result.get("ok", false)):
		return false
	var found: Dictionary = MatchProtocol.parse_find_or_create(
		String(rpc_result.get("payload", "")),
		ContentRegistry.get_content_hash()
	)
	if not bool(found.get("ok", false)):
		if MatchProtocol.is_compatibility_code(String(found.get("code", ""))):
			_fail_zone(found)
		return false
	var join_result: Dictionary = await _backend().join_match(
		String(found["match_id"]),
		MatchProtocol.join_metadata(ContentRegistry.get_content_hash(), AppState.selection_ticket)
	)
	if not bool(join_result.get("ok", false)):
		var code := String(join_result.get("code", ""))
		if MatchProtocol.is_compatibility_code(code):
			_fail_zone(join_result)
			return false
		if code == "already_in_match":
			match_id = String(found.get("match_id", previous_match))
			if match_id.is_empty():
				return false
			_got_full_state = false
			if await request_resync():
				await join_zone_chat()
				return true
			return false
		return false
	match_id = String(join_result.get("match_id", found["match_id"]))
	var received := await _wait_for_full_state(FULL_STATE_TIMEOUT_SEC)
	if not received:
		return false
	await join_zone_chat()
	return true


func start_reconnect() -> void:
	if _intentional_disconnect or _reconnect_in_progress:
		return
	if not AppState.is_authenticated:
		return
	_reconnect_in_progress = true
	_reconnect_cancelled = false
	socket_connected = false
	match_id = ""
	AppState.notify_reconnecting(true)
	AppState.notify_loading_started("reconnect")
	var attempt := 0
	while reconnect_policy.can_retry(attempt) and not _reconnect_cancelled and not AppState.has_fatal_error:
		var tree := get_tree()
		if attempt == 0 and tree != null:
			await tree.process_frame
		elif attempt > 0:
			var delay := reconnect_policy.delay_for_attempt(attempt - 1)
			if delay > 0.0 and tree != null:
				await tree.create_timer(delay).timeout
		if _reconnect_cancelled or _intentional_disconnect:
			break
		if await _try_reconnect():
			_finish_reconnect(true)
			return
		attempt += 1
	_finish_reconnect(false)
	if _reconnect_cancelled or _intentional_disconnect:
		await logout()
		return
	if not AppState.has_fatal_error:
		AppState.report_recoverable("reconnect_failed", "Could not reconnect to the starter zone. Log out or try again.")


func cancel_reconnect() -> void:
	_reconnect_cancelled = true
	if not _reconnect_in_progress:
		await logout()


func _try_reconnect() -> bool:
	var session_ok := await ensure_session()
	if not session_ok:
		return false
	var socket: Dictionary = await _backend().connect_socket()
	if not bool(socket.get("ok", false)):
		socket_connected = false
		return false
	socket_connected = true
	_connect_match_signals()
	_connect_chat_signals()
	_connect_socket_signals()
	if not AppState.has_character:
		return true
	return await rejoin_starter_zone()


func ensure_session() -> bool:
	if not AppState.is_authenticated and _device_id.is_empty() and _email.is_empty():
		AppState.report_recoverable("unauthenticated", "Sign-in is required.")
		return false
	if not _backend().is_session_expired():
		return true
	var show_loading := not AppState.is_reconnecting
	if show_loading:
		AppState.notify_loading_started("session")
	var refreshed: Dictionary = {}
	if _auth_mode == SessionCache.AUTH_MODE_EMAIL:
		refreshed = await AccountService.refresh_session()
		if bool(refreshed.get("ok", false)) and _backend().has_method("import_session"):
			var imported: Dictionary = await _backend().import_session(
				AccountService.access_token,
				AccountService.refresh_token,
				AccountService.user_id,
				AccountService.username
			)
			if bool(imported.get("ok", false)):
				if show_loading:
					AppState.notify_loading_completed("session")
				return true
		socket_connected = false
		match_id = ""
		zone_chat_id = ""
		AppState.notify_logged_out()
		AppState.report_recoverable("session_expired", AccountErrors.message_for("session_expired"))
		if String(refreshed.get("code", "")) == "AUTH_UNAVAILABLE":
			SceneRouter.transition_to(SceneRouter.SCENE_SERVER_UNAVAILABLE)
		if show_loading:
			AppState.notify_loading_completed("session")
		return false
	refreshed = await _backend().refresh_session()
	if bool(refreshed.get("ok", false)):
		if show_loading:
			AppState.notify_loading_completed("session")
		return true
	if _device_id.is_empty():
		socket_connected = false
		match_id = ""
		zone_chat_id = ""
		AppState.notify_logged_out()
		AppState.report_recoverable("session_expired", "The session expired. Sign in again.")
		if show_loading:
			AppState.notify_loading_completed("session")
		return false
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
		if show_loading:
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
		if show_loading:
			AppState.notify_loading_completed("session")
		return false
	socket_connected = true
	_connect_match_signals()
	_connect_chat_signals()
	_connect_socket_signals()
	AppState.notify_authenticated(String(reauth.get("user_id", AppState.user_id)), String(reauth.get("username", _username)))
	if show_loading:
		AppState.notify_loading_completed("session")
	return true


func depart_gameplay() -> void:
	_intentional_disconnect = true
	_reconnect_cancelled = true
	if AppState.is_reconnecting:
		AppState.notify_reconnecting(false)
	await leave_zone_chat()
	await leave_party_chat()
	if not match_id.is_empty() and _backend().has_method("leave_match"):
		await _backend().leave_match()
	match_id = ""
	zone_chat_id = ""
	party_chat_id = ""
	party_chat_party_id = ""
	_got_full_state = false


func logout() -> void:
	AppState.notify_loading_started("logout")
	await depart_gameplay()
	await _backend().logout()
	socket_connected = false
	match_id = ""
	zone_chat_id = ""
	party_chat_id = ""
	party_chat_party_id = ""
	_got_full_state = false
	_device_id = ""
	_username = ""
	_email = ""
	_auth_mode = ""
	_reconnect_in_progress = false
	_join_in_progress = false
	_pending_reconnect = false
	AppState.notify_loading_completed("logout")
	AppState.notify_logged_out()
	logged_out.emit()


func reset_for_tests() -> void:
	_disconnect_match_signals()
	_disconnect_chat_signals()
	_disconnect_socket_signals()
	backend = null
	last_auth_attempted = false
	socket_connected = false
	match_id = ""
	zone_chat_id = ""
	party_chat_id = ""
	party_chat_party_id = ""
	_chat_join_busy = false
	_got_full_state = false
	_match_signals_connected = false
	_chat_signals_connected = false
	_socket_signals_connected = false
	_intentional_disconnect = false
	_reconnect_in_progress = false
	_reconnect_cancelled = false
	_join_in_progress = false
	_pending_reconnect = false
	reconnect_policy = ReconnectPolicy.new()
	_device_id = ""
	_username = ""
	_email = ""
	_auth_mode = ""
	_auth_cooldown_ms = 0
	_auth_blocked_until_ms = 0
	DevIdentity.force_release_config = false
	SessionCache.clear()
	AccountService.reset_for_tests()


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


func _connect_socket_signals() -> void:
	var current: RefCounted = _backend()
	if not current.has_signal("socket_closed"):
		return
	if current.socket_closed.is_connected(_on_socket_closed):
		_socket_signals_connected = true
		return
	current.socket_closed.connect(_on_socket_closed)
	_socket_signals_connected = true


func _disconnect_socket_signals() -> void:
	if backend == null or not backend.has_signal("socket_closed"):
		_socket_signals_connected = false
		return
	if backend.socket_closed.is_connected(_on_socket_closed):
		backend.socket_closed.disconnect(_on_socket_closed)
	_socket_signals_connected = false


func _on_socket_closed() -> void:
	socket_connected = false
	if _intentional_disconnect:
		return
	if _reconnect_in_progress:
		return
	if _backend_socket_connected():
		socket_connected = true
		return
	if _join_in_progress:
		_pending_reconnect = true
		return
	if not AppState.is_authenticated:
		return
	if not AppState.has_zone_state:
		return
	await start_reconnect()


func _backend_socket_connected() -> bool:
	if not _backend().has_method("is_socket_connected"):
		return socket_connected
	return bool(_backend().call("is_socket_connected"))


func _finish_reconnect(success: bool) -> void:
	_reconnect_in_progress = false
	AppState.notify_reconnecting(false)
	AppState.notify_loading_completed("reconnect")
	if success:
		socket_connected = true


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
	chat_message_received.emit(payload)


func _on_channel_presence(payload: Dictionary) -> void:
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
		if code == "quest_complete":
			system_notice_received.emit(code, message)
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
	if opcode == MatchProtocol.SERVER_EQUIPMENT_STATE:
		var equipment: Dictionary = MatchProtocol.parse_equipment_state(payload)
		if not bool(equipment.get("ok", false)):
			AppState.report_recoverable(String(equipment.get("code", "equipment_state_failed")), String(equipment.get("message", "Equipment state was invalid.")))
			return
		equipment_state_received.emit(equipment)
		return
	if opcode == MatchProtocol.SERVER_WALLET_STATE:
		var wallet: Dictionary = MatchProtocol.parse_wallet_state(payload)
		if not bool(wallet.get("ok", false)):
			AppState.report_recoverable(String(wallet.get("code", "wallet_state_failed")), String(wallet.get("message", "Wallet state was invalid.")))
			return
		wallet_state_received.emit(wallet)
		return
	if opcode == MatchProtocol.SERVER_PROGRESSION_STATE:
		var progression: Dictionary = MatchProtocol.parse_progression_state(payload)
		if not bool(progression.get("ok", false)):
			AppState.report_recoverable(String(progression.get("code", "progression_state_failed")), String(progression.get("message", "Progression state was invalid.")))
			return
		progression_state_received.emit(progression)
		return
	if opcode == MatchProtocol.SERVER_ABILITY_STATE:
		var abilities: Dictionary = MatchProtocol.parse_ability_state(payload)
		if not bool(abilities.get("ok", false)):
			AppState.report_recoverable(String(abilities.get("code", "ability_state_failed")), String(abilities.get("message", "Ability state was invalid.")))
			return
		ability_state_received.emit(abilities)
		return
	if opcode == MatchProtocol.SERVER_PARTY_STATE:
		var party_state: Dictionary = MatchProtocol.parse_party_state(payload)
		if not bool(party_state.get("ok", false)):
			var party_code := String(party_state.get("code", "party_state_failed"))
			if MatchProtocol.is_compatibility_code(party_code):
				AppState.report_fatal_compatibility(party_code, String(party_state.get("message", "Party state was invalid.")))
				return
			party_state_received.emit(party_state)
			return
		party_state_received.emit(party_state)
		return
	if opcode == MatchProtocol.SERVER_PARTY_EVENT:
		var party_event: Dictionary = MatchProtocol.parse_party_event(payload)
		if not bool(party_event.get("ok", false)):
			var event_code := String(party_event.get("code", "party_event_failed"))
			if MatchProtocol.is_compatibility_code(event_code):
				AppState.report_fatal_compatibility(event_code, String(party_event.get("message", "Party event was invalid.")))
				return
			party_event_received.emit(party_event)
			return
		party_event_received.emit(party_event)
		return
	if opcode == MatchProtocol.SERVER_TRADE_STATE:
		var trade_state: Dictionary = MatchProtocol.parse_trade_state(payload)
		if not bool(trade_state.get("ok", false)):
			var trade_code := String(trade_state.get("code", "trade_state_failed"))
			if MatchProtocol.is_compatibility_code(trade_code):
				AppState.report_fatal_compatibility(trade_code, String(trade_state.get("message", "Trade state was invalid.")))
				return
			trade_state_received.emit(trade_state)
			return
		trade_state_received.emit(trade_state)
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
	_note_auth_failure()
	socket_connected = false
	AppState.notify_logged_out()
	var code := String(result.get("code", "authentication_failed"))
	var message := String(result.get("message", "Could not sign in to Nakama."))
	if MatchProtocol.is_compatibility_code(code):
		AppState.report_fatal_compatibility(code, message)
	else:
		AppState.report_recoverable(code, message)
	AppState.notify_loading_completed("auth")
	authentication_finished.emit(false, AppState.last_error_message)


func _auth_rate_allows() -> bool:
	if Time.get_ticks_msec() < _auth_blocked_until_ms:
		AppState.report_recoverable("auth_rate_limited", "Wait before trying to sign in again.")
		authentication_finished.emit(false, AppState.last_error_message)
		return false
	return true


func _note_auth_failure() -> void:
	if _auth_cooldown_ms <= 0:
		_auth_cooldown_ms = AUTH_COOLDOWN_START_MS
	else:
		_auth_cooldown_ms = mini(_auth_cooldown_ms * 2, AUTH_COOLDOWN_MAX_MS)
	_auth_blocked_until_ms = Time.get_ticks_msec() + _auth_cooldown_ms


func _note_auth_success() -> void:
	_auth_cooldown_ms = 0
	_auth_blocked_until_ms = 0


func _fail_character(result: Dictionary) -> void:
	var mapped := AccountErrors.sanitize_public_rpc(result.duplicate(true))
	var code := String(mapped.get("code", "rpc_failed"))
	var message := String(mapped.get("message", "Could not load the character."))
	if AccountErrors.is_account_gate(code):
		message = AccountErrors.message_for(code, message)
	if MatchProtocol.is_compatibility_code(code):
		AppState.report_fatal_compatibility(code, message)
	else:
		AppState.report_recoverable(code, message)
	AppState.notify_loading_completed("character")
	character_bootstrap_finished.emit(false, false, AppState.last_error_message)


func _fail_zone(result: Dictionary) -> void:
	var mapped := AccountErrors.sanitize_public_rpc(result.duplicate(true))
	var code := String(mapped.get("code", "join_failed"))
	var message := String(mapped.get("message", "Could not join the starter zone."))
	if AccountErrors.is_account_gate(code):
		message = AccountErrors.message_for(code, message)
	if MatchProtocol.is_compatibility_code(code):
		AppState.report_fatal_compatibility(code, message)
	elif MatchProtocol.is_maintenance_code(code):
		AppState.report_recoverable(code, message)
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
		"class_id": String(data.get("classId", "")),
		"base_stats": stats.duplicate(true),
		"position": position.duplicate(true),
	}


func _party_rpc_failure_code(code: String, message: String) -> String:
	if code == "session_expired" or code == "unauthenticated" or code == "rpc_failed":
		return "party_failed"
	var known := PackedStringArray([
		"already_in_party",
		"character_missing",
		"duplicate_invite",
		"duplicate_request",
		"invite_expired",
		"invite_missing",
		"invite_pending",
		"invalid_id",
		"invalid_request_id",
		"invalid_target",
		"malformed_json",
		"not_in_party",
		"not_leader",
		"not_member",
		"party_failed",
		"party_full",
		"party_missing",
		"rate_limited",
		"revision_mismatch",
		"selection_foreign",
		"stale_revision",
	])
	if known.has(code):
		return code
	for item in known:
		if message.contains(item):
			return item
	return ""
