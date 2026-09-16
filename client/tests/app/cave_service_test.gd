extends GdUnitTestSuite

## Cave service captures entrance/exit NPCs and sends transfer intents.


func before_test() -> void:
	SceneRouter.reset_for_tests()
	AppState.reset_for_tests()
	NetworkService.reset_for_tests()
	CaveService.reset_for_tests()
	assert_bool(ContentRegistry.load_bundle()).is_true()


func test_request_enter_sends_cave_enter_without_match_id() -> void:
	var fake := FakeNetworkBackend.new()
	NetworkService.backend = fake
	NetworkService.match_id = "match-starter-shared"
	CaveService.last_npc_id = "npc.test_cave_portal"
	CaveService.request_enter()
	await get_tree().process_frame
	assert_int(fake.last_send_opcode).is_equal(MatchProtocol.CLIENT_CAVE_ENTER)
	var payload: Dictionary = JSON.parse_string(fake.last_send_payload)
	assert_str(String(payload.get("npcId", ""))).is_equal("npc.test_cave_portal")
	assert_bool(payload.has("matchId")).is_false()
	assert_bool(payload.has("instanceId")).is_false()


func test_request_exit_sends_cave_exit() -> void:
	var fake := FakeNetworkBackend.new()
	NetworkService.backend = fake
	NetworkService.match_id = "match-cave-1"
	CaveService.last_exit_npc_id = "npc.test_cave_exit"
	CaveService.request_exit()
	await get_tree().process_frame
	assert_int(fake.last_send_opcode).is_equal(MatchProtocol.CLIENT_CAVE_EXIT)
	var payload: Dictionary = JSON.parse_string(fake.last_send_payload)
	assert_str(String(payload.get("npcId", ""))).is_equal("npc.test_cave_exit")


func test_join_metadata_can_carry_a_transfer_ticket() -> void:
	var meta: Dictionary = MatchProtocol.join_metadata("aa", "", "xfer-ticket-1")
	assert_str(String(meta.get("transferTicket", ""))).is_equal("xfer-ticket-1")
	assert_bool(meta.has("selectionTicket")).is_false()
	assert_bool(meta.has("characterId")).is_false()


func test_action_result_keeps_transfer_fields() -> void:
	var parsed: Dictionary = MatchProtocol.parse_action_result(JSON.stringify({
		"protocolVersion": 1,
		"ok": true,
		"code": "ok",
		"requestId": "req-transfer01xxxx",
		"ticketId": "t-1",
		"destinationMatchId": "match-cave",
		"destinationInstanceId": "cave-1",
		"originMatchId": "match-world",
		"zoneId": "zone.cave",
		"instanceType": "party_cave",
	}))
	assert_bool(bool(parsed.get("ok", false))).is_true()
	assert_str(String(parsed.get("ticket_id", ""))).is_equal("t-1")
	assert_str(String(parsed.get("destination_match_id", ""))).is_equal("match-cave")


func test_loading_overlay_shows_transfer_copy() -> void:
	var overlay: CanvasLayer = auto_free(load("res://scenes/shared/loading_overlay.tscn").instantiate())
	add_child(overlay)
	overlay.call("show_loading", "transfer")
	var label: Label = overlay.get_node("Panel/VBox/Message")
	assert_str(label.text).is_equal("Transferring…")
