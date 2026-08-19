extends Node

## Mirrors server party state. Clients never send member lists or credit recipients.

signal party_changed
signal invite_received(payload: Dictionary)
signal party_notice(message: String)

const MAX_SIZE := 5
const PARTY_CREATE_RPC := "party_create"
const PARTY_INVITE_RPC := "party_invite"
const PARTY_ACCEPT_RPC := "party_accept"
const PARTY_DECLINE_RPC := "party_decline"
const PARTY_LEAVE_RPC := "party_leave"
const PARTY_KICK_RPC := "party_kick"
const PARTY_PROMOTE_RPC := "party_promote"
const PARTY_DISBAND_RPC := "party_disband"
const PARTY_GET_STATE_RPC := "party_get_state"

var party: Dictionary = {}
var pending_invite: Dictionary = {}
var chat_lines: PackedStringArray = PackedStringArray()
var last_error: String = ""


func _ready() -> void:
	if not AppState.zone_state_updated.is_connected(_on_zone_state_updated):
		AppState.zone_state_updated.connect(_on_zone_state_updated)
	if not AppState.logged_out.is_connected(reset):
		AppState.logged_out.connect(reset)
	if not NetworkService.party_state_received.is_connected(_on_party_state):
		NetworkService.party_state_received.connect(_on_party_state)
	if not NetworkService.party_event_received.is_connected(_on_party_event):
		NetworkService.party_event_received.connect(_on_party_event)
	if not NetworkService.chat_message_received.is_connected(_on_chat_message):
		NetworkService.chat_message_received.connect(_on_chat_message)
	if not NetworkService.chat_presence_received.is_connected(_on_chat_presence):
		NetworkService.chat_presence_received.connect(_on_chat_presence)


func reset() -> void:
	party = {}
	pending_invite = {}
	chat_lines = PackedStringArray()
	last_error = ""
	NetworkService.leave_party_chat()
	party_changed.emit()


func reset_for_tests() -> void:
	reset()


func apply_party(data: Dictionary) -> void:
	var next: Dictionary = data.duplicate(true)
	var party_id := String(next.get("partyId", ""))
	if next.has("pendingInvite") and typeof(next["pendingInvite"]) == TYPE_DICTIONARY:
		var invite: Dictionary = (next["pendingInvite"] as Dictionary).duplicate(true)
		if not String(invite.get("partyId", "")).is_empty():
			pending_invite = invite
			invite_received.emit(pending_invite)
		elif not party_id.is_empty():
			pending_invite = {}
	elif not party_id.is_empty():
		pending_invite = {}
	if party_id.is_empty():
		party = {}
		NetworkService.leave_party_chat()
		party_changed.emit()
		return
	party = next
	last_error = ""
	party_changed.emit()
	_join_party_room(party_id)


func is_in_party() -> bool:
	return not String(party.get("partyId", "")).is_empty()


func is_leader() -> bool:
	if not is_in_party():
		return false
	return String(party.get("leaderCharacterId", "")) == _character_id()


func member_count() -> int:
	var members: Array = party.get("members", [])
	return members.size() if members is Array else 0


func is_full() -> bool:
	return member_count() >= MAX_SIZE


func request_create() -> void:
	NetworkService.rpc_party(PARTY_CREATE_RPC, _payload({"characterId": _character_id()}))


func request_invite(target_name: String) -> void:
	if is_full():
		last_error = "party_full"
		party_notice.emit("The party is full (max 5).")
		party_changed.emit()
		return
	var trimmed := target_name.strip_edges()
	if trimmed.is_empty():
		last_error = "invalid_target"
		party_notice.emit("Type the other character's exact name, then Invite.")
		party_changed.emit()
		return
	if trimmed.to_lower() == _display_name().to_lower():
		last_error = "invalid_target"
		party_notice.emit("You cannot invite yourself.")
		party_changed.emit()
		return
	var extra := {"characterId": _character_id(), "targetName": trimmed}
	if party.has("revision"):
		extra["revision"] = int(party["revision"])
	NetworkService.rpc_party(PARTY_INVITE_RPC, _payload(extra))


func request_accept() -> void:
	var party_id := String(pending_invite.get("partyId", ""))
	if party_id.is_empty():
		return
	NetworkService.rpc_party(PARTY_ACCEPT_RPC, _payload({"characterId": _character_id(), "partyId": party_id}))


func request_decline() -> void:
	var party_id := String(pending_invite.get("partyId", ""))
	if party_id.is_empty():
		return
	NetworkService.rpc_party(PARTY_DECLINE_RPC, _payload({"characterId": _character_id(), "partyId": party_id}))
	pending_invite = {}
	party_changed.emit()


func request_leave() -> void:
	NetworkService.rpc_party(PARTY_LEAVE_RPC, _payload({"characterId": _character_id()}))


func request_kick(character_id: String) -> void:
	var target := character_id.strip_edges()
	if target.is_empty():
		last_error = "invalid_target"
		party_notice.emit("Select a party member, then Kick.")
		party_changed.emit()
		return
	if target == _character_id():
		last_error = "invalid_target"
		party_notice.emit("You cannot kick yourself. Leave or Disband.")
		party_changed.emit()
		return
	NetworkService.rpc_party(
		PARTY_KICK_RPC,
		_payload({"characterId": _character_id(), "targetCharacterId": target})
	)


func request_promote(character_id: String) -> void:
	var target := character_id.strip_edges()
	if target.is_empty():
		last_error = "invalid_target"
		party_notice.emit("Select a party member, then Promote.")
		party_changed.emit()
		return
	if target == _character_id():
		last_error = "invalid_target"
		party_notice.emit("That member is already the party leader.")
		party_changed.emit()
		return
	NetworkService.rpc_party(
		PARTY_PROMOTE_RPC,
		_payload({"characterId": _character_id(), "targetCharacterId": target})
	)


func request_disband() -> void:
	NetworkService.rpc_party(PARTY_DISBAND_RPC, _payload({"characterId": _character_id()}))


func send_chat(text: String) -> Dictionary:
	return await NetworkService.send_party_chat(text, String(party.get("partyId", "")))


func _payload(extra: Dictionary) -> Dictionary:
	var body: Dictionary = extra.duplicate(true)
	body["requestId"] = MatchProtocol.new_request_id()
	return body


func _character_id() -> String:
	var from_view := String(AppState.character_view.get("character_id", AppState.character_view.get("characterId", "")))
	if not from_view.is_empty():
		return from_view
	var self_id := String(AppState.zone_view.get("self_id", AppState.user_id))
	for entry in AppState.zone_view.get("players", []):
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		var record: Dictionary = entry
		if String(record.get("userId", record.get("user_id", ""))) != self_id:
			continue
		var found := String(record.get("characterId", record.get("character_id", "")))
		if not found.is_empty():
			return found
	return ""


func _display_name() -> String:
	var named := String(AppState.character_view.get("name", ""))
	if not named.is_empty():
		return named
	return String(party.get("displayName", ""))


func _on_zone_state_updated() -> void:
	if not AppState.zone_view_is_full:
		return
	if not AppState.zone_view.has("party"):
		return
	var value: Variant = AppState.zone_view["party"]
	if typeof(value) != TYPE_DICTIONARY or String((value as Dictionary).get("partyId", "")).is_empty():
		if pending_invite.is_empty():
			party = {}
			NetworkService.leave_party_chat()
			party_changed.emit()
		return
	apply_party(value)


func _on_party_state(payload: Dictionary) -> void:
	if payload.has("pendingInvite") and typeof(payload["pendingInvite"]) == TYPE_DICTIONARY:
		pending_invite = (payload["pendingInvite"] as Dictionary).duplicate(true)
		if not String(pending_invite.get("partyId", "")).is_empty():
			invite_received.emit(pending_invite)
	if payload.has("ok") and not bool(payload["ok"]):
		last_error = String(payload.get("code", "party_failed"))
		if last_error == "party_missing" or last_error == "not_in_party":
			party = {}
			pending_invite = {}
			NetworkService.leave_party_chat()
		party_notice.emit(_message_for_code(last_error))
		party_changed.emit()
		return
	if payload.has("party") and typeof(payload["party"]) == TYPE_DICTIONARY:
		apply_party(payload["party"])
		return
	if payload.has("deleted") and bool(payload["deleted"]):
		party = {}
		pending_invite = {}
		NetworkService.leave_party_chat()
		party_changed.emit()


func _on_party_event(payload: Dictionary) -> void:
	var event_type := String(payload.get("type", ""))
	var message := String(payload.get("systemMessage", ""))
	if message.is_empty():
		if event_type == "member_joined":
			message = "A member joined the party."
		elif event_type == "member_left" or event_type == "leave":
			message = "A member left the party."
		elif event_type == "kicked":
			message = "A member was removed from the party."
		elif event_type == "promoted":
			message = "Party leadership changed."
		elif event_type == "disbanded":
			message = "The party has disbanded."
			party = {}
			pending_invite = {}
			NetworkService.leave_party_chat()
		elif event_type == "loot_assigned":
			message = "Loot was assigned."
		elif event_type == "inventory_full":
			message = "Inventory full; loot skipped."
		elif event_type == "invite":
			invite_received.emit(payload)
	if not message.is_empty():
		_append_chat(message)
		party_notice.emit(message)
	party_changed.emit()


func _on_chat_message(payload: Dictionary) -> void:
	if String(payload.get("channel_id", "")) != NetworkService.party_chat_id or NetworkService.party_chat_id.is_empty():
		return
	var body := ZoneChat.parse_content(String(payload.get("content", "")))
	if body.is_empty():
		return
	_append_chat(
		ZoneChat.format_line(
			ZoneChat.format_timestamp(String(payload.get("create_time", ""))),
			String(payload.get("username", "party")),
			body
		)
	)


func _on_chat_presence(_payload: Dictionary) -> void:
	return


func _append_chat(line: String) -> void:
	chat_lines.append(line)
	chat_lines = ZoneChat.cap_history(chat_lines)
	party_changed.emit()


func _join_party_room(party_id: String) -> void:
	if NetworkService.backend == null:
		return
	var joined: bool = await NetworkService.join_party_chat(party_id)
	if joined:
		if last_error == "party_chat_join_failed":
			last_error = ""
		return
	if String(party.get("partyId", "")) != party_id:
		return
	if last_error == "party_chat_join_failed":
		return
	last_error = "party_chat_join_failed"
	party_notice.emit("Could not join party chat.")
	party_changed.emit()


func _message_for_code(code: String) -> String:
	if code == "party_missing":
		return "That party is no longer available."
	if code == "not_in_party":
		return "You are not in a party."
	if code == "not_leader":
		return "Only the party leader can do that."
	if code == "invalid_target":
		return "No character with that name is available to invite."
	if code == "party_full":
		return "The party is full (max 5)."
	if code == "already_in_party":
		return "That character is already in a party."
	if code == "session_expired" or code == "unauthenticated":
		return "The party request failed. Try again."
	if code == "invalid_credentials":
		return "The party request failed. Try again."
	if code == "party_chat_join_failed":
		return "Could not join party chat."
	if code == "invite_expired":
		return "That invite has expired."
	if code == "invite_missing":
		return "That invite is no longer valid."
	if code == "duplicate_invite":
		return "That character already has an invite."
	if code == "invite_pending":
		return "That character already has a pending invite."
	if code == "stale_revision" or code == "revision_mismatch":
		return "Party state changed. Try again."
	if code == "rate_limited":
		return "Too many party actions. Wait a moment, then try again."
	if code == "invalid_id" or code == "character_missing" or code == "selection_foreign":
		return "This character cannot do that party action."
	if code == "not_member":
		return "That player is not in the party."
	if code == "malformed_json" or code == "invalid_request_id" or code == "duplicate_request":
		return "The party request failed. Try again."
	if code == "party_failed" or code == "rpc_failed" or code.is_empty():
		return "The party request failed. Try again."
	return code
