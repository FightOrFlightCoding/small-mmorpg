extends GdUnitTestSuite

## TradeWindow shows local bag and 20-slot offers without the remote bag.


func before_test() -> void:
	SceneRouter.reset_for_tests()
	AppState.reset_for_tests()
	NetworkService.reset_for_tests()
	InventoryService.reset_for_tests()
	TradeService.reset_for_tests()
	WindowManager.reset_for_tests()
	AppState.character_view = {"character_id": "char-a", "name": "Alice"}
	assert_bool(ContentRegistry.load_bundle()).is_true()


func after_test() -> void:
	TradeService.reset_for_tests()
	WindowManager.reset_for_tests()


func test_open_trade_shows_twenty_slots_bag_and_gold() -> void:
	var window: TradeWindow = auto_free(TradeWindow.new())
	add_child(window)
	await get_tree().process_frame
	window.present({
		"state": "open",
		"revision": 2,
		"changed": true,
		"other_name": "Bob",
		"mine_offers": _slots({"instanceId": "inst-1", "itemId": "item.test_pebble", "quantity": 3, "lockId": "trade-1", "slotIndex": 0}),
		"theirs_offers": _slots({"instanceId": "inst-2", "itemId": "item.test_potion", "quantity": 1, "lockId": "trade-1", "slotIndex": 1}),
		"mine_gold": 4,
		"theirs_gold": 9,
		"mine_accepted": true,
		"theirs_accepted": false,
		"status": "",
	})
	assert_bool(window.is_open()).is_true()
	assert_int(window._mine_slots.size()).is_equal(20)
	assert_int(window._theirs_slots.size()).is_equal(20)
	assert_str(window._title.text).contains("Bob")
	assert_str(window._revision.text).contains("2")
	assert_bool(window._warning.visible).is_true()
	assert_str(window._warning.text).is_equal("The trade has changed.")
	assert_str(window._mine_gold.text).is_equal("4")
	assert_str(window._theirs_gold.text).contains("9")
	assert_str(window._mine_accept.text).contains("accepted")
	assert_str(window._theirs_accept.text).contains("not accepted")
	assert_bool(window._bag_host.get_node_or_null("Bag") != null).is_true()
	assert_str(String((window._mine_slots[0] as ItemSlotView).instance.get("instanceId", ""))).is_equal("inst-1")
	assert_str(String((window._theirs_slots[1] as ItemSlotView).instance.get("instanceId", ""))).is_equal("inst-2")


func test_trade_service_opens_window_without_moving_items() -> void:
	TradeService.apply_trade({
		"tradeId": "trade-1",
		"state": "open",
		"revision": 1,
		"participantA": {"characterId": "char-a", "displayName": "Alice"},
		"participantB": {"characterId": "char-b", "displayName": "Bob"},
		"offers": {
			"char-a": [{"instanceId": "inst-1", "itemId": "item.test_pebble", "quantity": 2, "lockId": "trade-1", "slotIndex": 0}],
			"char-b": [],
		},
		"goldOffers": {"char-a": 0, "char-b": 3},
		"acceptanceRevisionByParticipant": {"char-a": 0, "char-b": 0},
	})
	assert_bool(TradeService.is_window_open()).is_true()
	assert_int(TradeService.local_offers().size()).is_equal(1)
	assert_int(InventoryService.items.size()).is_equal(0)
	TradeService.apply_trade({
		"tradeId": "trade-1",
		"state": "open",
		"revision": 2,
		"participantA": {"characterId": "char-a", "displayName": "Alice"},
		"participantB": {"characterId": "char-b", "displayName": "Bob"},
		"offers": {
			"char-a": [{"instanceId": "inst-1", "itemId": "item.test_pebble", "quantity": 2, "lockId": "trade-1", "slotIndex": 0}],
			"char-b": [],
		},
		"goldOffers": {"char-a": 5, "char-b": 3},
		"acceptanceRevisionByParticipant": {"char-a": 0, "char-b": 0},
	})
	assert_bool(TradeService.offer_changed).is_true()
	assert_str(TradeService.TRADE_CHANGED_MESSAGE).is_equal("The trade has changed.")
	assert_int(InventoryService.items.size()).is_equal(0)


func _slots(entry: Dictionary) -> Array:
	var rows: Array = []
	for index in range(20):
		if int(entry.get("slotIndex", -1)) == index:
			rows.append(entry)
		else:
			rows.append({"slotIndex": index, "instanceId": "", "itemId": "", "quantity": 0, "lockId": ""})
	return rows
