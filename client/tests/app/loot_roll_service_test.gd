extends GdUnitTestSuite

## LootRollService sends Need/Greed/Pass without a client roll number.


func before_test() -> void:
	SceneRouter.reset_for_tests()
	AppState.reset_for_tests()
	NetworkService.reset_for_tests()
	LootRollService.reset_for_tests()
	NotificationService.reset_for_tests()
	WindowManager.reset_for_tests()
	assert_bool(ContentRegistry.load_bundle()).is_true()


func after_test() -> void:
	LootRollService.reset_for_tests()
	NotificationService.reset_for_tests()
	WindowManager.reset_for_tests()


func test_submit_choice_omits_roll_number() -> void:
	var fake := FakeNetworkBackend.new()
	NetworkService.backend = fake
	NetworkService.match_id = "match-starter-shared"
	LootRollService.request_choice("roll-9", "NEED")
	await get_tree().process_frame
	assert_int(fake.last_send_opcode).is_equal(MatchProtocol.CLIENT_SUBMIT_LOOT_ROLL)
	var payload: Dictionary = JSON.parse_string(fake.last_send_payload)
	assert_str(String(payload.get("rollId", ""))).is_equal("roll-9")
	assert_str(String(payload.get("choice", ""))).is_equal("NEED")
	assert_bool(payload.has("roll")).is_false()
	assert_bool(payload.has("requestId")).is_true()


func test_simultaneous_rolls_do_not_overwrite() -> void:
	LootRollService._on_loot_roll_state({
		"ok": true,
		"roll": {
			"rollId": "roll-a",
			"itemId": "item.slime_gel",
			"itemInstanceId": "inst-a",
			"quantity": 1,
			"state": "OPEN",
			"ownChoice": "",
			"closesAt": 700,
			"tick": 100,
		},
	})
	LootRollService._on_loot_roll_state({
		"ok": true,
		"roll": {
			"rollId": "roll-b",
			"itemId": "item.training_sword",
			"itemInstanceId": "inst-b",
			"quantity": 2,
			"state": "OPEN",
			"ownChoice": "",
			"closesAt": 700,
			"tick": 100,
		},
	})
	assert_int(LootRollService.open_count()).is_equal(2)
	assert_int(LootRollService._window.roll_count()).is_equal(2)
	assert_str(LootRollService._window.card_text("roll-a")).is_not_equal("")
	assert_str(LootRollService._window.card_text("roll-b")).is_not_equal("")


func test_result_goes_to_the_feed() -> void:
	LootRollService._on_loot_roll_state({
		"ok": true,
		"roll": {
			"rollId": "roll-c",
			"itemId": "item.slime_gel",
			"itemInstanceId": "inst-c",
			"quantity": 1,
			"state": "AWARDED",
			"ownChoice": "NEED",
			"winnerCharacterId": "char-alice",
			"winningChoice": "NEED",
			"winningRoll": 87,
			"closesAt": 700,
			"tick": 700,
		},
	})
	assert_str(LootRollService.last_notice).contains("won")
	assert_str(NotificationService.last_message).contains("won")
