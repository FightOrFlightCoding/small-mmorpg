extends GdUnitTestSuite

## InventoryService mirrors server inventory through GLoot and never grants locally.


func before_test() -> void:
	SceneRouter.reset_for_tests()
	AppState.reset_for_tests()
	NetworkService.reset_for_tests()
	InventoryService.reset_for_tests()
	assert_bool(ContentRegistry.load_bundle()).is_true()
	InventoryService.configure_from_content()


func test_canonical_rebuild_shows_server_items() -> void:
	InventoryService.apply_canonical({
		"capacity": 20,
		"items": [
			{"instanceId": "inst-sword", "itemId": "item.training_sword", "quantity": 1, "metadata": {}},
			{"instanceId": "inst-gel", "itemId": "item.slime_gel", "quantity": 2, "metadata": {}},
		],
	})
	assert_int(InventoryService.item_count()).is_equal(2)
	assert_int(InventoryService.quantity_of("item.training_sword")).is_equal(1)
	assert_int(InventoryService.quantity_of("item.slime_gel")).is_equal(2)
	assert_int(InventoryService.capacity).is_equal(20)


func test_unsupported_local_gloot_mutation_is_reverted() -> void:
	InventoryService.apply_canonical({
		"capacity": 20,
		"items": [{"instanceId": "inst-sword", "itemId": "item.training_sword", "quantity": 1, "metadata": {}}],
	})
	assert_int(InventoryService.item_count()).is_equal(1)
	InventoryService.mirror.create_and_add_item("item.slime_gel")
	await get_tree().process_frame
	assert_int(InventoryService.item_count()).is_equal(1)
	assert_int(InventoryService.quantity_of("item.slime_gel")).is_equal(0)


func test_pickup_sends_loot_id_and_request_id_only() -> void:
	var fake := FakeNetworkBackend.new()
	NetworkService.backend = fake
	NetworkService.match_id = "match-starter-shared"
	var request_id := InventoryService.request_pickup("loot-gel-1")
	await get_tree().process_frame
	assert_str(request_id).is_not_empty()
	assert_int(fake.last_send_opcode).is_equal(MatchProtocol.CLIENT_PICKUP)
	var payload: Dictionary = JSON.parse_string(fake.last_send_payload)
	assert_str(String(payload.get("lootId", ""))).is_equal("loot-gel-1")
	assert_str(String(payload.get("requestId", ""))).is_equal(request_id)
	assert_bool(payload.has("instanceId")).is_false()
	assert_bool(payload.has("items")).is_false()
	assert_bool(payload.has("itemId")).is_false()
	assert_bool(payload.has("quantity")).is_false()


func test_full_state_inventory_restores_the_gloot_mirror() -> void:
	var parsed: Dictionary = MatchProtocol.parse_full_state(JSON.stringify({
		"protocolVersion": 1,
		"contentHash": ContentRegistry.get_content_hash(),
		"tick": 4,
		"zoneId": "zone.starter",
		"selfId": "user-alice",
		"players": [{"userId": "user-alice", "name": "Alice"}],
		"npcs": [],
		"enemies": [],
		"loot": [],
		"inventory": {
			"capacity": 20,
			"items": [{"instanceId": "inst-sword", "itemId": "item.training_sword", "quantity": 1, "metadata": {}}],
		},
	}), ContentRegistry.get_content_hash())
	assert_bool(bool(parsed.get("ok", false))).is_true()
	AppState.notify_zone_state(parsed["view"], true)
	assert_int(InventoryService.item_count()).is_equal(1)
	assert_int(InventoryService.quantity_of("item.training_sword")).is_equal(1)


func test_inventory_state_opcode_rebuilds_from_server() -> void:
	NetworkService.backend = FakeNetworkBackend.new()
	NetworkService.match_id = "match-starter-shared"
	NetworkService._connect_match_signals()
	NetworkService.backend.match_state_received.emit(
		MatchProtocol.SERVER_INVENTORY_STATE,
		JSON.stringify({
			"protocolVersion": 1,
			"contentHash": ContentRegistry.get_content_hash(),
			"requestId": "req-pickup-ok1",
			"capacity": 20,
			"items": [
				{"instanceId": "inst-sword", "itemId": "item.training_sword", "quantity": 1},
				{"instanceId": "inst-gel", "itemId": "item.slime_gel", "quantity": 1},
			],
		})
	)
	assert_int(InventoryService.item_count()).is_equal(2)
	assert_int(InventoryService.quantity_of("item.slime_gel")).is_equal(1)


func test_nearby_loot_pick_ignores_far_targets() -> void:
	var loot := [{
		"id": "loot-gel-1",
		"itemId": "item.slime_gel",
		"x": 960,
		"y": 400,
		"quantity": 1,
	}]
	assert_str(PickupIntent.nearest_loot_id(Vector2(960, 400), loot)).is_equal("loot-gel-1")
	assert_str(PickupIntent.nearest_loot_id(Vector2(240, 384), loot)).is_equal("")


func test_hud_lists_canonical_inventory() -> void:
	InventoryService.apply_canonical({
		"capacity": 20,
		"items": [
			{"instanceId": "inst-sword", "itemId": "item.training_sword", "quantity": 1, "metadata": {}},
			{"instanceId": "inst-gel", "itemId": "item.slime_gel", "quantity": 3, "metadata": {}},
		],
	})
	var hud: WorldHud = auto_free(preload("res://scenes/world/world_hud.tscn").instantiate())
	add_child(hud)
	await get_tree().process_frame
	hud.refresh_inventory()
	var capacity: Label = hud.get_node("Root/Inventory/Margin/VBox/Capacity")
	assert_str(capacity.text).contains("2 / 20")
	assert_str(hud.get_node("Root/Inventory/Margin/VBox/Heading").text).is_equal("Inventory")
