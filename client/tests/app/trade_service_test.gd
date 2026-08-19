extends GdUnitTestSuite

## TradeService mirrors server trade state and never predicts ownership.


func before_test() -> void:
	SceneRouter.reset_for_tests()
	AppState.reset_for_tests()
	NetworkService.reset_for_tests()
	TradeService.reset_for_tests()
	AppState.character_view = {"character_id": "char-a", "name": "Alice"}


func _fake() -> FakeNetworkBackend:
	var fake := FakeNetworkBackend.new()
	NetworkService.backend = fake
	NetworkService.match_id = "match-starter-shared"
	return fake


func test_invite_offer_accept_and_cancel_are_intentions() -> void:
	var fake := _fake()
	TradeService.request_invite("user-bob")
	await get_tree().process_frame
	assert_int(fake.last_send_opcode).is_equal(MatchProtocol.CLIENT_TRADE_INVITE)
	var invite_payload: Dictionary = JSON.parse_string(fake.last_send_payload)
	assert_str(String(invite_payload.get("targetId", ""))).is_equal("user-bob")
	assert_bool(invite_payload.has("gold")).is_false()
	assert_bool(invite_payload.has("items")).is_false()
	TradeService.apply_trade({
		"tradeId": "trade-1",
		"state": "open",
		"revision": 1,
		"participantA": {"characterId": "char-a", "accountUserId": "user-alice", "displayName": "Alice"},
		"participantB": {"characterId": "char-b", "accountUserId": "user-bob", "displayName": "Bob"},
		"offers": {},
		"goldOffers": {},
		"acceptanceRevisionByParticipant": {},
	})
	assert_bool(TradeService.is_trading()).is_true()
	TradeService.request_set_offer("inst-1", 2)
	await get_tree().process_frame
	assert_int(fake.last_send_opcode).is_equal(MatchProtocol.CLIENT_TRADE_SET_OFFER)
	TradeService.request_set_gold(5)
	await get_tree().process_frame
	assert_int(fake.last_send_opcode).is_equal(MatchProtocol.CLIENT_TRADE_SET_GOLD)
	var gold_payload: Dictionary = JSON.parse_string(fake.last_send_payload)
	assert_bool(gold_payload.has("gold")).is_false()
	assert_int(int(gold_payload.get("amount", -1))).is_equal(5)
	TradeService.request_accept_revision()
	await get_tree().process_frame
	assert_int(fake.last_send_opcode).is_equal(MatchProtocol.CLIENT_TRADE_ACCEPT_REVISION)
	TradeService.request_cancel()
	await get_tree().process_frame
	assert_int(fake.last_send_opcode).is_equal(MatchProtocol.CLIENT_TRADE_CANCEL)


func test_offer_change_sets_warning_and_does_not_move_items() -> void:
	TradeService.apply_trade({
		"tradeId": "trade-1",
		"state": "open",
		"revision": 1,
		"participantA": {"characterId": "char-a"},
		"participantB": {"characterId": "char-b"},
	})
	assert_bool(TradeService.offer_changed).is_false()
	TradeService.apply_trade({
		"tradeId": "trade-1",
		"state": "open",
		"revision": 2,
		"participantA": {"characterId": "char-a"},
		"participantB": {"characterId": "char-b"},
	})
	assert_bool(TradeService.offer_changed).is_true()
	assert_int(InventoryService.items.size()).is_equal(0)


func test_completed_trade_shows_result_without_local_grant() -> void:
	TradeService.apply_trade({
		"tradeId": "trade-1",
		"state": "open",
		"revision": 3,
		"participantA": {"characterId": "char-a"},
		"participantB": {"characterId": "char-b"},
	})
	TradeService.apply_trade({
		"tradeId": "trade-1",
		"state": "completed",
		"revision": 3,
		"participantA": {"characterId": "char-a"},
		"participantB": {"characterId": "char-b"},
	})
	assert_str(TradeService.last_result).is_equal("Trade complete.")
	assert_bool(TradeService.is_trading()).is_false()


func test_invitee_can_decline() -> void:
	var fake := _fake()
	TradeService.apply_trade({
		"tradeId": "trade-1",
		"state": "inviting",
		"revision": 0,
		"participantA": {"characterId": "char-b"},
		"participantB": {"characterId": "char-a"},
	})
	TradeService.request_decline_invite()
	await get_tree().process_frame
	assert_int(fake.last_send_opcode).is_equal(MatchProtocol.CLIENT_TRADE_DECLINE_INVITE)


func test_hud_invite_uses_typed_character_name() -> void:
	var fake := _fake()
	var hud: WorldHud = auto_free(preload("res://scenes/world/world_hud.tscn").instantiate())
	add_child(hud)
	await get_tree().process_frame
	var state := {
		"self_id": "user-alice",
		"players": [
			{"userId": "user-alice", "name": "Alice", "health": 10, "maxHealth": 10},
			{"userId": "user-bob", "name": "Bob", "health": 10, "maxHealth": 10},
		],
	}
	AppState.zone_view = state
	hud.refresh(state, PackedStringArray(["Alice", "Bob"]))
	var name_edit: LineEdit = hud.find_child("TradeName", true, false)
	name_edit.text = "Bob"
	hud._on_trade_invite()
	await get_tree().process_frame
	assert_int(fake.last_send_opcode).is_equal(MatchProtocol.CLIENT_TRADE_INVITE)
	var payload: Dictionary = JSON.parse_string(fake.last_send_payload)
	assert_str(String(payload.get("targetId", ""))).is_equal("user-bob")


func test_trade_error_codes_are_readable() -> void:
	assert_str(TradeService.message_for_code("out_of_range")).contains("80")
	assert_str(TradeService.message_for_code("in_combat")).contains("combat")
	_fake()
	TradeService.request_invite("user-bob")
	TradeService._on_action_result({"ok": false, "code": "out_of_range"})
	assert_str(TradeService.last_error).is_equal("out_of_range")


func test_hud_invite_blocks_out_of_range_before_send() -> void:
	var fake := _fake()
	var hud: WorldHud = auto_free(preload("res://scenes/world/world_hud.tscn").instantiate())
	add_child(hud)
	await get_tree().process_frame
	var state := {
		"self_id": "user-alice",
		"players": [
			{"userId": "user-alice", "name": "Alice", "health": 10, "x": 0, "y": 0},
			{"userId": "user-bob", "name": "Bob", "health": 10, "x": 400, "y": 0},
		],
	}
	AppState.zone_view = state
	hud.refresh(state, PackedStringArray(["Alice", "Bob"]))
	var name_edit: LineEdit = hud.find_child("TradeName", true, false)
	name_edit.text = "Bob"
	hud._on_trade_invite()
	await get_tree().process_frame
	assert_int(fake.last_send_opcode).is_not_equal(MatchProtocol.CLIENT_TRADE_INVITE)
	var notice: Label = hud.get_node("Root/Notice")
	assert_str(notice.text).contains("80")
