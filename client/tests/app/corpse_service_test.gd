extends GdUnitTestSuite

## CorpseService sends open/claim/Loot All intentions. The client never names recipients.


func before_test() -> void:
	SceneRouter.reset_for_tests()
	AppState.reset_for_tests()
	NetworkService.reset_for_tests()
	VendorService.reset_for_tests()
	CorpseService.reset_for_tests()
	WindowManager.reset_for_tests()
	InventoryService.reset_for_tests()
	assert_bool(ContentRegistry.load_bundle()).is_true()


func after_test() -> void:
	CorpseService.reset_for_tests()
	WindowManager.reset_for_tests()


func test_open_claim_and_loot_all_omit_recipients() -> void:
	var fake := FakeNetworkBackend.new()
	NetworkService.backend = fake
	NetworkService.match_id = "match-starter-shared"
	CorpseService.request_open("corpse-9")
	await get_tree().process_frame
	assert_int(fake.last_send_opcode).is_equal(MatchProtocol.CLIENT_OPEN_CORPSE)
	var opened: Dictionary = JSON.parse_string(fake.last_send_payload)
	assert_str(String(opened.get("corpseId", ""))).is_equal("corpse-9")
	assert_bool(opened.has("lootRecipients")).is_false()
	assert_bool(opened.has("requestId")).is_true()
	CorpseService.last_corpse_id = "corpse-9"
	CorpseService.request_claim_item("entry-2")
	await get_tree().process_frame
	assert_int(fake.last_send_opcode).is_equal(MatchProtocol.CLIENT_CLAIM_CORPSE_ITEM)
	var claim: Dictionary = JSON.parse_string(fake.last_send_payload)
	assert_str(String(claim.get("corpseId", ""))).is_equal("corpse-9")
	assert_str(String(claim.get("entryId", ""))).is_equal("entry-2")
	assert_bool(claim.has("toSlotIndex")).is_false()
	assert_bool(claim.has("lootRecipients")).is_false()
	CorpseService.request_claim_gold()
	await get_tree().process_frame
	assert_int(fake.last_send_opcode).is_equal(MatchProtocol.CLIENT_CLAIM_CORPSE_GOLD)
	var gold: Dictionary = JSON.parse_string(fake.last_send_payload)
	assert_str(String(gold.get("corpseId", ""))).is_equal("corpse-9")
	assert_bool(gold.has("amount")).is_false()
	assert_bool(gold.has("lootRecipients")).is_false()
	CorpseService.request_loot_all("corpse-9")
	await get_tree().process_frame
	assert_int(fake.last_send_opcode).is_equal(MatchProtocol.CLIENT_LOOT_ALL_CORPSE)
	var loot_all: Dictionary = JSON.parse_string(fake.last_send_payload)
	assert_str(String(loot_all.get("corpseId", ""))).is_equal("corpse-9")
	assert_bool(loot_all.has("lootRecipients")).is_false()


func test_corpse_state_opens_window_and_bag() -> void:
	WindowManager.reset_for_tests()
	CorpseService._on_corpse_state({
		"ok": true,
		"request_id": "req-c1",
		"corpse": {
			"corpseId": "corpse-ui",
			"enemyId": "enemy.green_slime",
			"goldAmount": 5,
			"goldState": "PRIVATE_AVAILABLE",
			"eligible": true,
			"public": false,
			"privateUntilTick": 700,
			"expiresAtTick": 3100,
			"tick": 100,
			"items": [{
				"entryId": "e1",
				"itemId": "item.slime_gel",
				"quantity": 1,
				"state": "PRIVATE_AVAILABLE",
				"claimed": false,
			}],
		},
	})
	assert_bool(CorpseService.is_open()).is_true()
	assert_bool(WindowManager.is_open(WindowManager.CORPSE)).is_true()
	assert_bool(WindowManager.is_open(WindowManager.INVENTORY)).is_true()
	assert_str(CorpseService.last_corpse_id).is_equal("corpse-ui")
	CorpseService._on_action_result({
		"ok": true,
		"result_ok": true,
		"request_id": "pending",
		"loot_all": [
			{"entryId": "gold", "kind": "gold", "code": "ok", "claimed": true},
			{"entryId": "e1", "kind": "item", "code": "inventory_full", "claimed": false},
		],
	})
	CorpseService.last_request_id = "req-la"
	CorpseService._on_action_result({
		"ok": true,
		"result_ok": true,
		"request_id": "req-la",
		"loot_all": [
			{"entryId": "gold", "kind": "gold", "code": "ok", "claimed": true},
			{"entryId": "e1", "kind": "item", "code": "inventory_full", "claimed": false},
		],
	})
	assert_int(CorpseService.last_loot_all.size()).is_equal(2)
	assert_str(CorpseService._window._status.text).contains("left behind")
	CorpseService._on_corpse_removed({"corpse_id": "corpse-ui", "reason": "empty"})
	assert_bool(CorpseService.is_open()).is_false()


func test_nearest_corpse_uses_pickup_range() -> void:
	var corpses: Array = [
		{"id": "far", "x": 400.0, "y": 400.0},
		{"id": "near", "x": 12.0, "y": 0.0},
	]
	assert_str(CorpseService.nearest_corpse_id(Vector2.ZERO, corpses, 40.0)).is_equal("near")
	assert_str(CorpseService.nearest_corpse_id(Vector2.ZERO, corpses, 8.0)).is_empty()
