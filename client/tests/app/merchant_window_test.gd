extends GdUnitTestSuite

## MerchantWindow presents catalog data and never submits a client price.


func before_test() -> void:
	SceneRouter.reset_for_tests()
	AppState.reset_for_tests()
	NetworkService.reset_for_tests()
	VendorService.reset_for_tests()
	WindowManager.reset_for_tests()
	WalletService.reset_for_tests()
	assert_bool(ContentRegistry.load_bundle()).is_true()


func test_merchant_window_lists_stock_and_currency() -> void:
	var window: MerchantWindow = auto_free(MerchantWindow.new())
	add_child(window)
	await get_tree().process_frame
	WalletService.apply_gold(25)
	window.present({
		"npc_id": "npc.test_vendor",
		"npc_name": "Test Vendor",
		"vendor_id": "vendor.test_general",
		"interaction_session_id": "sess-merchant-1",
		"stock": VendorService.stock_entries("vendor.test_general"),
		"gold": 25,
	})
	assert_bool(window.is_open()).is_true()
	assert_str(window._name_label.text).is_equal("Test Vendor")
	assert_int(window._list.item_count).is_greater(0)
	assert_str(window._currency.text).is_equal("Gold: 25")
	assert_str(window._back.text).is_equal("Back to dialogue")


func test_merchant_buy_sends_session_fields_without_price() -> void:
	var fake := FakeNetworkBackend.new()
	NetworkService.backend = fake
	NetworkService.match_id = "match-starter-shared"
	VendorService.last_npc_id = "npc.test_vendor"
	VendorService.last_session_id = "sess-merchant-2"
	VendorService.last_vendor_id = "vendor.test_general"
	VendorService.open_from_dialogue()
	await get_tree().process_frame
	assert_bool(VendorService.is_open()).is_true()
	VendorService.request_buy("item.test_potion", 2)
	await get_tree().process_frame
	var payload: Dictionary = JSON.parse_string(fake.last_send_payload)
	assert_int(fake.last_send_opcode).is_equal(MatchProtocol.CLIENT_VENDOR_BUY)
	assert_str(String(payload.get("interactionSessionId", ""))).is_equal("sess-merchant-2")
	assert_str(String(payload.get("npcInstanceId", ""))).is_equal("npc.test_vendor")
	assert_int(int(payload.get("quantity", 0))).is_equal(2)
	assert_bool(payload.has("price")).is_false()
	assert_bool(payload.has("gold")).is_false()
	assert_bool(payload.has("npcId")).is_false()
	VendorService.reset_for_tests()
