extends GdUnitTestSuite

## EquipmentService mirrors server equipment and sends instance id plus slot only.

# Force MatchProtocol to load before GdUnit scans this suite during editor boot.
const _PROTOCOL := preload("res://scripts/network/protocol.gd")


func before_test() -> void:
	SceneRouter.reset_for_tests()
	AppState.reset_for_tests()
	NetworkService.reset_for_tests()
	InventoryService.reset_for_tests()
	EquipmentService.reset_for_tests()
	assert_bool(ContentRegistry.load_bundle()).is_true()
	InventoryService.configure_from_content()
	EquipmentService.configure_from_content()


func test_equip_sends_instance_id_slot_and_request_id_only() -> void:
	var fake := FakeNetworkBackend.new()
	NetworkService.backend = fake
	NetworkService.match_id = "match-starter-shared"
	var request_id := EquipmentService.request_equip("inst-sword", "main_hand")
	await get_tree().process_frame
	assert_str(request_id).is_not_empty()
	assert_int(fake.last_send_opcode).is_equal(_PROTOCOL.CLIENT_EQUIP)
	var payload: Dictionary = JSON.parse_string(fake.last_send_payload)
	assert_str(String(payload.get("instanceId", ""))).is_equal("inst-sword")
	assert_str(String(payload.get("slot", ""))).is_equal("main_hand")
	assert_str(String(payload.get("requestId", ""))).is_equal(request_id)
	assert_bool(payload.has("attack")).is_false()
	assert_bool(payload.has("attackBonus")).is_false()
	assert_bool(payload.has("itemId")).is_false()


func test_unequip_omits_instance_id() -> void:
	var fake := FakeNetworkBackend.new()
	NetworkService.backend = fake
	NetworkService.match_id = "match-starter-shared"
	var request_id := EquipmentService.request_unequip("main_hand")
	await get_tree().process_frame
	assert_str(request_id).is_not_empty()
	var payload: Dictionary = JSON.parse_string(fake.last_send_payload)
	assert_bool(payload.has("instanceId")).is_false()
	assert_str(String(payload.get("slot", ""))).is_equal("main_hand")
	assert_str(String(payload.get("requestId", ""))).is_equal(request_id)


func test_equipment_state_updates_attack_only_from_server() -> void:
	InventoryService.apply_canonical({
		"capacity": 20,
		"items": [{"instanceId": "inst-sword", "itemId": "item.training_sword", "quantity": 1, "metadata": {}}],
	})
	NetworkService.backend = FakeNetworkBackend.new()
	NetworkService.match_id = "match-starter-shared"
	NetworkService._connect_match_signals()
	NetworkService.backend.match_state_received.emit(
		_PROTOCOL.SERVER_EQUIPMENT_STATE,
		JSON.stringify({
			"protocolVersion": 1,
			"contentHash": ContentRegistry.get_content_hash(),
			"requestId": "req-equip-ok1",
			"slots": {"main_hand": "inst-sword"},
			"derived": {"attack": 6},
		})
	)
	assert_str(EquipmentService.main_hand_instance_id).is_equal("inst-sword")
	assert_int(EquipmentService.attack).is_equal(6)
	assert_str(EquipmentService.equipped_display_name()).is_equal("Training Sword")


func test_full_state_equipment_restores_the_slot() -> void:
	InventoryService.apply_canonical({
		"capacity": 20,
		"items": [{"instanceId": "inst-sword", "itemId": "item.training_sword", "quantity": 1, "metadata": {}}],
	})
	var parsed: Dictionary = _PROTOCOL.parse_full_state(JSON.stringify({
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
		"equipment": {"slots": {"main_hand": "inst-sword"}},
		"derived": {"attack": 6},
	}), ContentRegistry.get_content_hash())
	assert_bool(bool(parsed.get("ok", false))).is_true()
	AppState.notify_zone_state(parsed["view"], true)
	assert_str(EquipmentService.main_hand_instance_id).is_equal("inst-sword")
	assert_int(EquipmentService.attack).is_equal(6)


func test_hud_shows_server_attack_and_main_hand() -> void:
	InventoryService.apply_canonical({
		"capacity": 20,
		"items": [{"instanceId": "inst-sword", "itemId": "item.training_sword", "quantity": 1, "metadata": {}}],
	})
	EquipmentService.apply_canonical({
		"slots": {"main_hand": "inst-sword"},
		"derived": {"attack": 6},
	})
	var hud: WorldHud = auto_free(preload("res://scenes/world/world_hud.tscn").instantiate())
	add_child(hud)
	await get_tree().process_frame
	hud.refresh_equipment()
	var attack: Label = hud.get_node("Root/Inventory/Margin/VBox/Attack")
	var main_hand: Label = hud.get_node("Root/Inventory/Margin/VBox/MainHand")
	assert_str(attack.text).is_equal("Attack: 6")
	assert_str(main_hand.text).contains("Training Sword")
	assert_object(hud.get_node("Root/Inventory/Margin/VBox/EquipRow/EquipButton")).is_not_null()
	assert_object(hud.get_node("Root/Inventory/Margin/VBox/EquipRow/UnequipButton")).is_not_null()
	assert_object(hud.get_node("Root/Inventory/Margin/VBox/EquipRow/SlotOption")).is_not_null()
	assert_int(EquipmentService.slot_tags().size()).is_greater_equal(6)


func test_equipment_state_mirrors_extra_slots_from_the_server() -> void:
	InventoryService.apply_canonical({
		"capacity": 20,
		"items": [
			{"instanceId": "inst-sword", "itemId": "item.training_sword", "quantity": 1, "metadata": {}},
			{"instanceId": "inst-cap", "itemId": "item.test_leather_cap", "quantity": 1, "metadata": {}},
		],
	})
	EquipmentService.apply_canonical({
		"slots": {"main_hand": "inst-sword", "head": "inst-cap", "chest": ""},
		"derived": {"attack": 6},
	})
	assert_str(EquipmentService.main_hand_instance_id).is_equal("inst-sword")
	assert_str(String(EquipmentService.slots.get("head", ""))).is_equal("inst-cap")
	assert_str(String(EquipmentService.slots.get("chest", ""))).is_equal("")
	var request_id := EquipmentService.request_equip("inst-cap", "head")
	assert_str(request_id).is_not_empty()
