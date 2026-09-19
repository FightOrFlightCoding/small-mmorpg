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
		"capacity": 30,
		"items": [
			{"instanceId": "inst-sword", "itemId": "item.training_sword", "quantity": 1, "metadata": {}},
			{"instanceId": "inst-gel", "itemId": "item.slime_gel", "quantity": 2, "metadata": {}},
		],
	})
	assert_int(InventoryService.item_count()).is_equal(2)
	assert_int(InventoryService.quantity_of("item.training_sword")).is_equal(1)
	assert_int(InventoryService.quantity_of("item.slime_gel")).is_equal(2)
	assert_int(InventoryService.capacity).is_equal(30)


func test_expected_revision_is_omitted_until_canonical_arrives() -> void:
	assert_int(InventoryService.expected_revision()).is_equal(-1)
	InventoryService.apply_canonical({
		"capacity": 30,
		"revision": 4,
		"items": [{"instanceId": "inst-gel", "itemId": "item.slime_gel", "quantity": 1, "metadata": {}}],
	})
	assert_int(InventoryService.expected_revision()).is_equal(4)
	assert_int(InventoryService.revision).is_equal(4)


func test_unsupported_local_gloot_mutation_is_reverted() -> void:
	InventoryService.apply_canonical({
		"capacity": 30,
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
			"capacity": 30,
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
			"capacity": 30,
			"items": [
				{"instanceId": "inst-sword", "itemId": "item.training_sword", "quantity": 1},
				{"instanceId": "inst-gel", "itemId": "item.slime_gel", "quantity": 1},
			],
			"revision": 6,
		})
	)
	assert_int(InventoryService.item_count()).is_equal(2)
	assert_int(InventoryService.quantity_of("item.slime_gel")).is_equal(1)
	assert_int(InventoryService.revision).is_equal(6)


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
		"capacity": 30,
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
	assert_str(capacity.text).contains("2 / 30")
	assert_str(hud.get_node("Root/Inventory/Margin/VBox/Heading").text).is_equal("Inventory")
	assert_object(hud.get_node("Root/Inventory/Margin/VBox/MutateRow/DestroyButton")).is_not_null()
	assert_object(hud.get_node("Root/Inventory/Margin/VBox/MutateRow/SplitButton")).is_not_null()
	var bag: BagGrid = hud.get_node("Root/Inventory/Margin/VBox/ListHost/Bag")
	assert_object(bag).is_not_null()
	assert_int(bag.slots.size()).is_equal(30)
	assert_int(bag.columns).is_equal(6)


func test_destroy_and_split_send_intentions_without_instance_id_invention() -> void:
	var fake := FakeNetworkBackend.new()
	NetworkService.backend = fake
	NetworkService.match_id = "match-starter-shared"
	var destroy_id := InventoryService.request_destroy("inst-cloth")
	await get_tree().process_frame
	assert_str(destroy_id).is_not_empty()
	assert_int(fake.last_send_opcode).is_equal(MatchProtocol.CLIENT_DESTROY_ITEM)
	var destroy_payload: Dictionary = JSON.parse_string(fake.last_send_payload)
	assert_str(String(destroy_payload.get("instanceId", ""))).is_equal("inst-cloth")
	assert_str(String(destroy_payload.get("requestId", ""))).is_equal(destroy_id)
	assert_bool(destroy_payload.has("newInstanceId")).is_false()
	var split_id := InventoryService.request_split("inst-cloth", 2)
	await get_tree().process_frame
	assert_str(split_id).is_not_empty()
	assert_int(fake.last_send_opcode).is_equal(MatchProtocol.CLIENT_SPLIT_STACK)
	var split_payload: Dictionary = JSON.parse_string(fake.last_send_payload)
	assert_str(String(split_payload.get("instanceId", ""))).is_equal("inst-cloth")
	assert_int(int(split_payload.get("quantity", 0))).is_equal(2)
	assert_bool(split_payload.has("newInstanceId")).is_false()


func test_overflow_recovery_sends_server_instance_id_only() -> void:
	InventoryService.apply_canonical({
		"capacity": 30,
		"items": [{"instanceId": "inst-sword", "itemId": "item.training_sword", "quantity": 1, "metadata": {}}],
		"overflow": {
			"items": [{"instanceId": "inst-overflow", "itemId": "item.slime_gel", "quantity": 2}],
			"revision": 1,
		},
	})
	assert_int(InventoryService.overflow_items.size()).is_equal(1)
	var fake := FakeNetworkBackend.new()
	NetworkService.backend = fake
	NetworkService.match_id = "match-starter-shared"
	var request_id := InventoryService.request_recover_overflow("inst-overflow")
	await get_tree().process_frame
	assert_str(request_id).is_not_empty()
	assert_int(fake.last_send_opcode).is_equal(MatchProtocol.CLIENT_RECOVER_OVERFLOW_ITEM)
	var payload: Dictionary = JSON.parse_string(fake.last_send_payload)
	assert_str(String(payload.get("instanceId", ""))).is_equal("inst-overflow")
	assert_str(String(payload.get("requestId", ""))).is_equal(request_id)
	assert_bool(payload.has("newInstanceId")).is_false()


func test_inventory_recovery_panel_shows_overflow_only() -> void:
	InventoryService.apply_canonical({
		"capacity": 30,
		"items": [{"instanceId": "inst-sword", "itemId": "item.training_sword", "quantity": 1, "metadata": {}}],
		"overflow": {
			"items": [{"instanceId": "inst-overflow", "itemId": "item.slime_gel", "quantity": 2}],
			"revision": 1,
		},
	})
	var hud: WorldHud = auto_free(preload("res://scenes/world/world_hud.tscn").instantiate())
	add_child(hud)
	await get_tree().process_frame
	var panel: CanvasItem = hud.get_node("InventoryRecovery")
	assert_object(panel).is_not_null()
	assert_bool(panel.visible).is_true()
	InventoryService.apply_canonical({
		"capacity": 30,
		"items": [{"instanceId": "inst-sword", "itemId": "item.training_sword", "quantity": 1, "metadata": {}}],
		"overflow": {"items": [], "revision": 2},
	})
	hud.refresh_inventory()
	assert_bool(panel.visible).is_false()


func test_ground_drop_sends_instance_quantity_and_hints_not_coordinates() -> void:
	InventoryService.apply_canonical({
		"capacity": 30,
		"revision": 2,
		"items": [{"instanceId": "inst-cloth", "itemId": "item.test_cloth", "quantity": 5, "metadata": {}}],
	})
	var fake := FakeNetworkBackend.new()
	NetworkService.backend = fake
	NetworkService.match_id = "match-starter-shared"
	var request_id := InventoryService.request_ground_drop("inst-cloth", 2, 8.0, -3.0)
	await get_tree().process_frame
	assert_str(request_id).is_not_empty()
	assert_int(fake.last_send_opcode).is_equal(MatchProtocol.CLIENT_DROP_ITEM)
	var payload: Dictionary = JSON.parse_string(fake.last_send_payload)
	assert_str(String(payload.get("instanceId", ""))).is_equal("inst-cloth")
	assert_int(int(payload.get("quantity", 0))).is_equal(2)
	assert_float(float(payload.get("hintDx", 0.0))).is_equal(8.0)
	assert_float(float(payload.get("hintDy", 0.0))).is_equal(-3.0)
	assert_bool(payload.has("x")).is_false()
	assert_bool(payload.has("y")).is_false()
	assert_int(int(payload.get("expectedRevision", 0))).is_equal(2)


func test_pickup_ground_sends_entity_id_and_request_id_only() -> void:
	var fake := FakeNetworkBackend.new()
	NetworkService.backend = fake
	NetworkService.match_id = "match-starter-shared"
	var request_id := InventoryService.request_pickup_ground("ground-gel-1")
	await get_tree().process_frame
	assert_str(request_id).is_not_empty()
	assert_int(fake.last_send_opcode).is_equal(MatchProtocol.CLIENT_PICKUP_GROUND_ITEM)
	var payload: Dictionary = JSON.parse_string(fake.last_send_payload)
	assert_str(String(payload.get("groundEntityId", ""))).is_equal("ground-gel-1")
	assert_str(String(payload.get("requestId", ""))).is_equal(request_id)
	assert_bool(payload.has("instanceId")).is_false()
	assert_bool(payload.has("quantity")).is_false()


func test_world_drop_from_equipment_is_rejected() -> void:
	var fake := FakeNetworkBackend.new()
	NetworkService.backend = fake
	NetworkService.match_id = "match-starter-shared"
	var request_id := InventoryService.handle_world_drop({
		"instanceId": "inst-sword",
		"fromKind": "equipment",
	}, Vector2(10, 0))
	assert_str(request_id).is_empty()
	assert_int(fake.last_send_opcode).is_equal(0)


func test_uncommon_drop_prompt_requires_public_confirmation() -> void:
	InventoryService.apply_canonical({
		"capacity": 30,
		"items": [{"instanceId": "inst-iron", "itemId": "item.iron_sword", "quantity": 1, "metadata": {}}],
	})
	assert_bool(InventoryService.prompt_ground_drop("inst-iron")).is_true()
	var dialog: GroundDropDialog = InventoryService.get_node_or_null("GroundDropDialog")
	assert_object(dialog).is_not_null()
	assert_bool(dialog.visible).is_true()
	assert_str(dialog._warning.text).is_equal(GroundDropDialog.PUBLIC_WARNING)
	assert_bool(dialog._drop_button.disabled).is_true()
	dialog._confirm_check.button_pressed = true
	dialog._on_confirm_toggled(true)
	assert_bool(dialog._drop_button.disabled).is_false()
