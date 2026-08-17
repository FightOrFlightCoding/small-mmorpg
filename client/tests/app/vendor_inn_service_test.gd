extends GdUnitTestSuite

## Vendor and inn services send intentions after a server-approved interaction.


func before_test() -> void:
	SceneRouter.reset_for_tests()
	AppState.reset_for_tests()
	NetworkService.reset_for_tests()
	VendorService.reset_for_tests()
	InnService.reset_for_tests()
	CaveService.reset_for_tests()
	assert_bool(ContentRegistry.load_bundle()).is_true()


func test_vendor_buy_does_not_send_a_client_price() -> void:
	var fake := FakeNetworkBackend.new()
	NetworkService.backend = fake
	NetworkService.match_id = "match-starter-shared"
	VendorService.last_npc_id = "npc.test_vendor"
	VendorService.request_buy("item.test_potion", 1)
	await get_tree().process_frame
	assert_int(fake.last_send_opcode).is_equal(MatchProtocol.CLIENT_VENDOR_BUY)
	var payload: Dictionary = JSON.parse_string(fake.last_send_payload)
	assert_str(String(payload.get("npcId", ""))).is_equal("npc.test_vendor")
	assert_str(String(payload.get("itemId", ""))).is_equal("item.test_potion")
	assert_bool(payload.has("requestId")).is_true()
	assert_bool(payload.has("price")).is_false()
	assert_bool(payload.has("gold")).is_false()


func test_inn_rest_sends_npc_id_without_health_values() -> void:
	var fake := FakeNetworkBackend.new()
	NetworkService.backend = fake
	NetworkService.match_id = "match-starter-shared"
	InnService.last_npc_id = "npc.test_innkeeper"
	InnService.request_rest()
	await get_tree().process_frame
	assert_int(fake.last_send_opcode).is_equal(MatchProtocol.CLIENT_INN_REST)
	var payload: Dictionary = JSON.parse_string(fake.last_send_payload)
	assert_str(String(payload.get("npcId", ""))).is_equal("npc.test_innkeeper")
	assert_str(String(payload.get("mode", ""))).is_equal("inn")
	assert_bool(payload.has("health")).is_false()
	assert_bool(payload.has("gold")).is_false()


func test_cave_enter_does_not_claim_a_transfer() -> void:
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
	assert_bool(payload.has("zoneId")).is_false()
