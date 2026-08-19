extends GdUnitTestSuite

## PartyService mirrors server party state and never nominates members or credit.


func before_test() -> void:
	SceneRouter.reset_for_tests()
	AppState.reset_for_tests()
	NetworkService.reset_for_tests()
	PartyService.reset_for_tests()
	AppState.character_view = {"character_id": "char-a", "name": "Alice"}


func _fake() -> FakeNetworkBackend:
	var fake := FakeNetworkBackend.new()
	NetworkService.backend = fake
	return fake


func test_create_invite_accept_and_leave_are_intentions() -> void:
	var fake := _fake()
	PartyService.request_create()
	await get_tree().process_frame
	assert_str(fake.last_rpc_id).is_equal("party_create")
	assert_str(fake.last_rpc_payload).contains("characterId")
	assert_str(fake.last_rpc_payload).contains("requestId")
	assert_str(fake.last_rpc_payload).not_contains("members")
	PartyService.apply_party({
		"partyId": "p_one",
		"leaderCharacterId": "char-a",
		"revision": 1,
		"members": [{
			"characterId": "char-a",
			"displayName": "Alice",
			"isLeader": true,
			"connectionState": "online",
			"health": 80,
			"maxHealth": 100,
		}],
	})
	assert_bool(PartyService.is_in_party()).is_true()
	assert_bool(PartyService.is_leader()).is_true()
	PartyService.request_invite("Bob")
	assert_str(fake.last_rpc_id).is_equal("party_invite")
	assert_str(fake.last_rpc_payload).contains("targetName")
	assert_str(fake.last_rpc_payload).not_contains("creditUserIds")
	PartyService.request_leave()
	assert_str(fake.last_rpc_id).is_equal("party_leave")
	PartyService.request_kick("char-b")
	assert_str(fake.last_rpc_id).is_equal("party_kick")
	PartyService.request_promote("char-b")
	assert_str(fake.last_rpc_id).is_equal("party_promote")
	PartyService.request_disband()
	assert_str(fake.last_rpc_id).is_equal("party_disband")


func test_party_full_feedback_and_invite_prompt() -> void:
	var members: Array = []
	for i in range(5):
		members.append({
			"characterId": "char-%s" % str(i),
			"displayName": "M%s" % str(i),
			"isLeader": i == 0,
			"connectionState": "online",
		})
	PartyService.apply_party({
		"partyId": "p_full",
		"leaderCharacterId": "char-0",
		"members": members,
	})
	assert_bool(PartyService.is_full()).is_true()
	PartyService.request_invite("Extra")
	assert_str(PartyService.last_error).is_equal("party_full")
	PartyService.pending_invite = {"partyId": "p_full", "fromDisplayName": "Alice"}
	PartyService.request_decline()
	assert_str(String(PartyService.pending_invite.get("partyId", ""))).is_equal("")


func test_party_chat_payload_includes_party_id_and_stays_plain_text() -> void:
	var fake := _fake()
	PartyService.apply_party({"partyId": "p_one", "leaderCharacterId": "char-a", "members": []})
	await get_tree().process_frame
	assert_str(fake.last_chat_room).is_equal("party.p_one")
	var sent: Dictionary = await PartyService.send_chat("  hi party  ")
	assert_bool(bool(sent.get("ok", false))).is_true()
	assert_str(String(fake.last_chat_content.get("message", ""))).is_equal("hi party")
	assert_str(String(fake.last_chat_content.get("partyId", ""))).is_equal("p_one")
	assert_bool(fake.last_chat_content.has("members")).is_false()
	var hud: WorldHud = auto_free(preload("res://scenes/world/world_hud.tscn").instantiate())
	add_child(hud)
	await get_tree().process_frame
	PartyService.apply_party({
		"partyId": "p_one",
		"leaderCharacterId": "char-a",
		"members": [{
			"characterId": "char-a",
			"displayName": "Alice",
			"isLeader": true,
			"connectionState": "disconnect_grace",
			"health": 40,
			"maxHealth": 100,
		}],
	})
	hud.refresh_party()
	assert_str(hud.get_node("Root/LeftColumn/Party/Margin/Scroll/VBox/Status").text).contains("1/5")
	assert_int(hud.get_node("Root/LeftColumn/Party/Margin/Scroll/VBox/Members").item_count).is_equal(1)
	assert_str(hud.get_node("Root/LeftColumn/Party/Margin/Scroll/VBox/Members").get_item_text(0)).contains("Alice")
	assert_str(hud.get_node("Root/LeftColumn/Party/Margin/Scroll/VBox/Members").get_item_text(0)).contains("40/100")
	assert_str(hud.get_node("Root/LeftColumn/Party/Margin/Scroll/VBox/Members").get_item_text(0)).contains("disconnect_grace")
	var history: Label = hud.get_node("Root/LeftColumn/Party/Margin/Scroll/VBox/ChatScroll/ChatHistory")
	assert_str(history.get_class()).is_not_equal("RichTextLabel")
	var disband: Button = hud.get_node("Root/LeftColumn/Party/Margin/Scroll/VBox/ActionRow/DisbandButton")
	assert_object(disband).is_not_null()
	assert_str(disband.text).is_equal("Disband")
	assert_bool(disband.visible).is_true()
	assert_bool(disband.disabled).is_false()
	assert_bool(hud.get_node("Root/LeftColumn/Party/Margin/Scroll/VBox/ActionRow/KickButton").disabled).is_true()
	assert_bool(hud.get_node("Root/LeftColumn/Party/Margin/Scroll/VBox/ActionRow/PromoteButton").disabled).is_true()
	assert_bool(hud.get_node("Root/LeftColumn/Party/Margin/Scroll/VBox/ActionRow/CreateButton").visible).is_false()
	PartyService.apply_party({
		"partyId": "p_one",
		"leaderCharacterId": "char-b",
		"members": [{
			"characterId": "char-a",
			"displayName": "Alice",
			"isLeader": false,
			"connectionState": "online",
		}],
	})
	hud.refresh_party()
	assert_bool(disband.disabled).is_true()


func test_party_missing_clears_local_party_without_stack_trace_code() -> void:
	PartyService.apply_party({
		"partyId": "p_one",
		"leaderCharacterId": "char-a",
		"members": [{"characterId": "char-a", "displayName": "Alice", "isLeader": true}],
	})
	assert_bool(PartyService.is_in_party()).is_true()
	PartyService._on_party_state({"ok": false, "code": "party_missing"})
	assert_bool(PartyService.is_in_party()).is_false()
	assert_str(PartyService.last_error).is_equal("party_missing")


func test_accept_while_already_in_a_party_sends_accept() -> void:
	var fake := _fake()
	PartyService.apply_party({
		"partyId": "p_one",
		"leaderCharacterId": "char-a",
		"members": [{"characterId": "char-a", "displayName": "Alice", "isLeader": true}],
	})
	PartyService.pending_invite = {"partyId": "p_two", "fromDisplayName": "Bob"}
	fake.last_rpc_id = ""
	PartyService.request_accept()
	assert_str(fake.last_rpc_id).is_equal("party_accept")
	var hud: WorldHud = auto_free(preload("res://scenes/world/world_hud.tscn").instantiate())
	add_child(hud)
	await get_tree().process_frame
	hud.refresh_party()
	assert_str(hud.get_node("Root/LeftColumn/Party/Margin/Scroll/VBox/InvitePrompt/Prompt").text).contains("Accept will leave")


func test_created_party_clears_stale_pending_invite() -> void:
	PartyService.pending_invite = {"partyId": "p_alice", "fromDisplayName": "Alice"}
	PartyService.apply_party({
		"partyId": "p_bob",
		"leaderCharacterId": "char-a",
		"members": [{"characterId": "char-a", "displayName": "Alice", "isLeader": true}],
	})
	assert_str(String(PartyService.pending_invite.get("partyId", ""))).is_equal("")


func test_party_rpc_login_error_does_not_open_the_credentials_modal() -> void:
	var fake := _fake()
	fake.rpc_ok = false
	fake.rpc_code = "invalid_credentials"
	fake.rpc_message = "Email or password is incorrect."
	AppState.last_error_code = ""
	AppState.last_error_message = ""
	PartyService.request_leave()
	await get_tree().process_frame
	assert_str(AppState.last_error_code).is_not_equal("invalid_credentials")
	assert_str(PartyService.last_error).is_equal("invalid_credentials")
	assert_str(AppState.last_error_message).is_not_equal("Email or password is incorrect.")


func test_party_domain_payload_stays_on_the_hud() -> void:
	var fake := _fake()
	fake.rpc_payload = JSON.stringify({"ok": false, "code": "not_leader"})
	AppState.last_error_code = ""
	PartyService.request_kick("char-b")
	await get_tree().process_frame
	await get_tree().process_frame
	assert_str(AppState.last_error_code).is_equal("")
	assert_str(PartyService.last_error).is_equal("not_leader")


func test_party_chat_join_failure_does_not_open_the_error_dialog() -> void:
	var fake := _fake()
	fake.join_chat_ok = false
	fake.join_chat_code = "invalid_channel"
	fake.join_chat_message = "Could not join zone chat."
	AppState.last_error_code = ""
	PartyService.apply_party({
		"partyId": "p_one",
		"leaderCharacterId": "char-a",
		"members": [{"characterId": "char-a", "displayName": "Alice", "isLeader": true}],
	})
	await get_tree().process_frame
	await get_tree().process_frame
	assert_str(AppState.last_error_code).is_not_equal("invalid_channel")
	assert_str(PartyService.last_error).is_equal("party_chat_join_failed")


func test_party_session_expired_while_in_match_stays_on_the_hud() -> void:
	var fake := _fake()
	fake.socket_is_connected = true
	fake.rpc_ok = false
	fake.rpc_code = "session_expired"
	fake.rpc_message = "The session expired. Sign in again."
	NetworkService.match_id = "match-starter-shared"
	AppState.last_error_code = ""
	AppState.last_error_message = ""
	PartyService.request_leave()
	await get_tree().process_frame
	await get_tree().process_frame
	assert_int(fake.refresh_calls).is_greater_equal(1)
	assert_str(AppState.last_error_code).is_not_equal("session_expired")
	assert_str(PartyService.last_error).is_equal("party_failed")


func test_party_session_expired_without_a_match_still_stays_on_the_hud() -> void:
	var fake := _fake()
	fake.rpc_ok = false
	fake.rpc_code = "session_expired"
	fake.rpc_message = "The session expired. Sign in again."
	AppState.last_error_code = ""
	PartyService.request_disband()
	await get_tree().process_frame
	await get_tree().process_frame
	assert_str(AppState.last_error_code).is_not_equal("session_expired")
	assert_str(PartyService.last_error).is_equal("party_failed")


func test_party_session_expired_retries_after_refresh() -> void:
	var fake := _fake()
	fake.socket_is_connected = true
	fake.rpc_fail_remaining = 1
	fake.rpc_code = "session_expired"
	fake.rpc_message = "The session expired. Sign in again."
	fake.rpc_payload = JSON.stringify({
		"ok": true,
		"code": "ok",
		"party": {
			"partyId": "p_retry",
			"leaderCharacterId": "char-a",
			"members": [{"characterId": "char-a", "displayName": "Alice", "isLeader": true}],
		},
	})
	NetworkService.match_id = "match-starter-shared"
	AppState.last_error_code = ""
	PartyService.request_create()
	await get_tree().process_frame
	await get_tree().process_frame
	assert_int(fake.refresh_calls).is_equal(1)
	assert_str(AppState.last_error_code).is_equal("")
	assert_str(String(PartyService.party.get("partyId", ""))).is_equal("p_retry")


func test_kick_and_promote_require_a_selected_member() -> void:
	PartyService.apply_party({
		"partyId": "p_one",
		"leaderCharacterId": "char-a",
		"members": [{"characterId": "char-a", "displayName": "Alice", "isLeader": true}],
	})
	var fake := _fake()
	PartyService.request_kick("")
	assert_str(fake.last_rpc_id).is_not_equal("party_kick")
	assert_str(PartyService.last_error).is_equal("invalid_target")
	PartyService.request_promote("char-a")
	assert_str(fake.last_rpc_id).is_not_equal("party_promote")
	PartyService.request_invite("Alice")
	assert_str(fake.last_rpc_id).is_not_equal("party_invite")
	var hud: WorldHud = auto_free(preload("res://scenes/world/world_hud.tscn").instantiate())
	add_child(hud)
	await get_tree().process_frame
	hud.refresh_party()
	hud._on_party_kick()
	assert_str(hud.get_node("Root/Notice").text).contains("Select a party member")
	assert_bool(hud.get_node("Root/LeftColumn/Party/Margin/Scroll/VBox/ActionRow/KickButton").disabled).is_true()
	PartyService.apply_party({
		"partyId": "p_one",
		"leaderCharacterId": "char-a",
		"members": [
			{"characterId": "char-a", "displayName": "Alice", "isLeader": true},
			{"characterId": "char-b", "displayName": "Bob", "isLeader": false},
		],
	})
	hud.refresh_party()
	assert_bool(hud.get_node("Root/LeftColumn/Party/Margin/Scroll/VBox/ActionRow/KickButton").disabled).is_false()
	assert_bool(hud.get_node("Root/LeftColumn/Party/Margin/Scroll/VBox/ActionRow/PromoteButton").disabled).is_false()
