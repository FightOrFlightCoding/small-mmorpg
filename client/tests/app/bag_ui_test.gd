extends GdUnitTestSuite

## Thirty-slot bag UI: fixed squares, tooltips, drag intentions, split/merge, equipment.


func before_test() -> void:
	SceneRouter.reset_for_tests()
	AppState.reset_for_tests()
	NetworkService.reset_for_tests()
	InventoryService.reset_for_tests()
	EquipmentService.reset_for_tests()
	DragDropService.reset_for_tests()
	TooltipService.reset_for_tests()
	UiStateService.reset_for_tests()
	ItemContextRouter.reset_for_tests()
	WalletService.reset_for_tests()
	CorpseService.reset_for_tests()
	VendorService.reset_for_tests()
	assert_bool(ContentRegistry.load_bundle()).is_true()
	InventoryService.configure_from_content()
	EquipmentService.configure_from_content()


func after_test() -> void:
	DragDropService.reset_for_tests()
	TooltipService.reset_for_tests()
	ItemContextRouter.reset_for_tests()
	InventoryService.reset_for_tests()
	EquipmentService.reset_for_tests()
	CorpseService.reset_for_tests()
	VendorService.reset_for_tests()


func _gel(slot: int, qty: int, instance_id: String = "inst-gel") -> Dictionary:
	return {
		"instanceId": instance_id,
		"itemId": "item.slime_gel",
		"quantity": qty,
		"slotIndex": slot,
		"metadata": {},
	}


func _sword(slot: int, instance_id: String = "inst-sword") -> Dictionary:
	return {
		"instanceId": instance_id,
		"itemId": "item.training_sword",
		"quantity": 1,
		"slotIndex": slot,
		"metadata": {},
	}


func _bag_dest(index: int) -> ItemSlotView:
	var slot := auto_free(ItemSlotView.new()) as ItemSlotView
	slot.origin_kind = "bag"
	slot.slot_index = index
	return slot


func _equip_dest(tag: String = "main_hand") -> ItemSlotView:
	var slot := auto_free(ItemSlotView.new()) as ItemSlotView
	slot.origin_kind = "equipment"
	slot.slot_index = -1
	slot.equipment_tag = tag
	return slot


func _payload(instance_id: String, from_slot: int, kind: String = "bag") -> Dictionary:
	return {
		"kind": "bag_item" if kind == "bag" else "equipment_item",
		"instanceId": instance_id,
		"fromSlot": from_slot,
		"fromKind": kind,
		"equipmentTag": "main_hand" if kind == "equipment" else "",
		"split": false,
		"quantity": 1,
		"itemId": "",
	}


func test_thirty_fixed_slot_positions() -> void:
	InventoryService.apply_canonical({
		"capacity": 30,
		"revision": 2,
		"items": [_sword(0), _gel(7, 3)],
	})
	var hud: WorldHud = auto_free(preload("res://scenes/world/world_hud.tscn").instantiate())
	add_child(hud)
	await get_tree().process_frame
	var bag: BagGrid = hud.get_node("Root/Inventory/Margin/VBox/ListHost/Bag")
	assert_int(bag.slots.size()).is_equal(30)
	assert_int(bag.columns).is_equal(6)
	assert_int(bag.slot_at(0).slot_index).is_equal(0)
	assert_int(bag.slot_at(5).slot_index).is_equal(5)
	assert_int(bag.slot_at(6).slot_index).is_equal(6)
	assert_str(String(bag.slot_at(0).instance.get("instanceId", ""))).is_equal("inst-sword")
	assert_str(String(bag.slot_at(7).instance.get("instanceId", ""))).is_equal("inst-gel")
	assert_bool(bag.slot_at(1).is_empty()).is_true()
	assert_int(int(bag.slot_at(7).instance.get("quantity", 0))).is_equal(3)
	assert_bool(bag.slot_at(0).uses_fallback_icon()).is_true()
	assert_str(hud.get_node("Root/Inventory/Margin/VBox/Capacity").text).contains("2 / 30")
	assert_str(hud.get_node("Root/Inventory/Margin/VBox/Gold").text).contains("Gold:")


func test_move_swap_merge_and_excess() -> void:
	var fake := FakeNetworkBackend.new()
	NetworkService.backend = fake
	NetworkService.match_id = "match-starter-shared"
	InventoryService.apply_canonical({
		"capacity": 30,
		"revision": 3,
		"items": [_gel(0, 5, "gel-a"), _gel(2, 8, "gel-b"), _sword(4)],
	})
	var move_id := InventoryService.handle_drop(_payload("gel-a", 0), _bag_dest(9))
	assert_str(move_id).is_not_empty()
	assert_int(fake.last_send_opcode).is_equal(MatchProtocol.CLIENT_MOVE_ITEM)
	var move_payload: Dictionary = JSON.parse_string(fake.last_send_payload)
	assert_str(String(move_payload.get("instanceId", ""))).is_equal("gel-a")
	assert_int(int(move_payload.get("toSlotIndex", -1))).is_equal(9)
	assert_bool(move_payload.has("items")).is_false()
	var swap_id := InventoryService.handle_drop(_payload("gel-a", 0), _bag_dest(4))
	assert_str(swap_id).is_not_empty()
	var swap_payload: Dictionary = JSON.parse_string(fake.last_send_payload)
	assert_int(int(swap_payload.get("toSlotIndex", -1))).is_equal(4)
	var merge_id := InventoryService.handle_drop(_payload("gel-b", 2), _bag_dest(0))
	assert_str(merge_id).is_not_empty()
	assert_int(fake.last_send_opcode).is_equal(MatchProtocol.CLIENT_MOVE_ITEM)
	assert_int(int(InventoryService.item_by_instance("gel-a").get("quantity", 0))).is_equal(5)
	assert_int(int(InventoryService.item_by_instance("gel-b").get("quantity", 0))).is_equal(8)


func test_full_stack_and_locked_reject_without_send() -> void:
	var fake := FakeNetworkBackend.new()
	NetworkService.backend = fake
	NetworkService.match_id = "match-starter-shared"
	InventoryService.apply_canonical({
		"capacity": 30,
		"revision": 4,
		"items": [
			_gel(0, 20, "gel-full-a"),
			_gel(1, 20, "gel-full-b"),
			{
				"instanceId": "gel-lock",
				"itemId": "item.slime_gel",
				"quantity": 2,
				"slotIndex": 3,
				"lockReason": "trade",
				"lockType": "TRADE",
				"metadata": {},
			},
		],
	})
	fake.send_calls = 0
	var rejected := InventoryService.handle_drop(_payload("gel-full-b", 1), _bag_dest(0))
	assert_str(rejected).is_empty()
	assert_int(fake.send_calls).is_equal(0)
	assert_str(InventoryService.last_reject_code).is_equal("stack_full")
	assert_int(int(InventoryService.item_at_slot(0).get("quantity", 0))).is_equal(20)
	assert_int(int(InventoryService.item_at_slot(1).get("quantity", 0))).is_equal(20)
	var locked := InventoryService.handle_drop(_payload("gel-lock", 3), _bag_dest(8))
	assert_str(locked).is_empty()
	assert_int(fake.send_calls).is_equal(0)
	assert_str(InventoryService.last_reject_code).is_equal("item_locked")
	assert_str(InventoryService.last_notice.to_lower()).contains("lock")


func test_split_valid_invalid_and_selector_range() -> void:
	var fake := FakeNetworkBackend.new()
	NetworkService.backend = fake
	NetworkService.match_id = "match-starter-shared"
	InventoryService.apply_canonical({
		"capacity": 30,
		"revision": 5,
		"items": [_gel(0, 6, "gel-split")],
	})
	assert_bool(InventoryService.prompt_split("gel-split")).is_true()
	var dialog: SplitStackDialog = InventoryService.get_node("OverlayLayer/SplitStackDialog")
	assert_object(dialog).is_not_null()
	assert_bool(dialog.visible).is_true()
	assert_int(int(dialog._spin.max_value)).is_equal(5)
	assert_int(int(dialog._spin.min_value)).is_equal(1)
	dialog._spin.value = 2
	dialog._on_confirm()
	assert_int(fake.last_send_opcode).is_equal(MatchProtocol.CLIENT_SPLIT_STACK)
	var split_payload: Dictionary = JSON.parse_string(fake.last_send_payload)
	assert_str(String(split_payload.get("instanceId", ""))).is_equal("gel-split")
	assert_int(int(split_payload.get("quantity", 0))).is_equal(2)
	assert_bool(split_payload.has("newInstanceId")).is_false()
	fake.send_calls = 0
	assert_str(InventoryService.request_split("gel-split", 6)).is_empty()
	assert_int(fake.send_calls).is_equal(0)
	assert_str(InventoryService.last_reject_code).is_equal("invalid_split")
	assert_bool(InventoryService.prompt_split("missing")).is_false()


func test_equip_unequip_and_full_bag() -> void:
	var fake := FakeNetworkBackend.new()
	NetworkService.backend = fake
	NetworkService.match_id = "match-starter-shared"
	InventoryService.apply_canonical({
		"capacity": 30,
		"revision": 6,
		"items": [_sword(2)],
	})
	var equip_id := InventoryService.handle_drop(_payload("inst-sword", 2), _equip_dest())
	assert_str(equip_id).is_not_empty()
	assert_int(fake.last_send_opcode).is_equal(MatchProtocol.CLIENT_EQUIP)
	var equip_payload: Dictionary = JSON.parse_string(fake.last_send_payload)
	assert_str(String(equip_payload.get("instanceId", ""))).is_equal("inst-sword")
	assert_str(String(equip_payload.get("slot", ""))).is_equal("main_hand")
	ItemContextRouter.execute(ItemContextRouter.ACTION_EQUIP, {"kind": "bag"}, _sword(2))
	assert_int(fake.last_send_opcode).is_equal(MatchProtocol.CLIENT_EQUIP)
	EquipmentService.apply_canonical({
		"slots": {"main_hand": "inst-sword"},
		"items": [_sword(-1, "inst-sword")],
		"derived": {"attack": 6},
	})
	InventoryService.apply_canonical({"capacity": 30, "revision": 7, "items": []})
	var unequip_id := InventoryService.handle_drop(_payload("inst-sword", -1, "equipment"), _bag_dest(4))
	assert_str(unequip_id).is_not_empty()
	var unequip_payload: Dictionary = JSON.parse_string(fake.last_send_payload)
	assert_bool(unequip_payload.has("instanceId")).is_false()
	assert_str(String(unequip_payload.get("slot", ""))).is_equal("main_hand")
	var filled: Array = []
	for index in range(30):
		filled.append(_sword(index, "sword-%s" % str(index)))
	InventoryService.apply_canonical({"capacity": 30, "revision": 8, "items": filled})
	EquipmentService.apply_canonical({
		"slots": {"main_hand": "eq-sword"},
		"items": [{"instanceId": "eq-sword", "itemId": "item.training_sword", "quantity": 1}],
		"derived": {"attack": 6},
	})
	fake.send_calls = 0
	var full := InventoryService.handle_drop(_payload("eq-sword", -1, "equipment"), _bag_dest(0))
	assert_str(full).is_empty()
	assert_int(fake.send_calls).is_equal(0)
	assert_str(InventoryService.last_reject_code).is_equal("inventory_full")


func test_tooltip_rarity_and_fallback() -> void:
	var relic := {
		"instanceId": "inst-relic",
		"itemId": "item.test_relic_blade",
		"quantity": 1,
		"slotIndex": 0,
		"metadata": {},
	}
	var text := ItemPresentation.tooltip_text(relic, true)
	assert_str(text).contains("Test Relic Blade")
	assert_str(text).contains("Rarity: Rare")
	assert_str(text).contains("Quantity: 1")
	assert_str(text).contains("Category: weapon")
	assert_str(text).contains("Equipment slot: main hand")
	assert_str(text).contains("Level requirement: 5")
	assert_str(text).contains("Class requirement:")
	assert_str(text).contains("Stat modifiers:")
	assert_str(text).contains("Quest item: no")
	assert_str(text).contains("Tradeable: yes")
	assert_str(text).contains("Droppable: yes")
	assert_str(text).contains("Vendor value: 20g")
	assert_str(text).contains("itemId: item.test_relic_blade")
	assert_str(text).contains("instanceId: inst-relic")
	var gel_text := ItemPresentation.tooltip_text(_gel(1, 4), false)
	assert_str(gel_text).contains("Quest item: yes")
	assert_str(gel_text).contains("Slime Gel")
	var sword_def: Dictionary = ItemPresentation.definition_for("item.training_sword")
	assert_bool(ItemPresentation.uses_fallback_icon(sword_def)).is_true()
	assert_str(ItemPresentation.rarity_label(sword_def)).is_equal("Common")


func test_stale_timeout_resync_and_duplicate_signals() -> void:
	var fake := FakeNetworkBackend.new()
	NetworkService.backend = fake
	NetworkService.match_id = "match-starter-shared"
	NetworkService._connect_match_signals()
	InventoryService.apply_canonical({
		"capacity": 30,
		"revision": 9,
		"items": [_gel(0, 2, "gel-stale")],
	})
	var request_id := InventoryService.request_move("gel-stale", 4)
	assert_str(InventoryService.last_request_id).is_equal(request_id)
	assert_bool(InventoryService.slot_is_pending(0)).is_true()
	InventoryService._on_action_result({
		"ok": true,
		"result_ok": false,
		"code": "inventory_stale",
		"request_id": request_id,
		"message": "stale",
	})
	await get_tree().process_frame
	assert_int(fake.last_send_opcode).is_equal(MatchProtocol.CLIENT_RESYNC_REQUEST)
	assert_str(InventoryService.last_request_id).is_equal(request_id)
	assert_bool(InventoryService.pending.is_empty()).is_true()
	InventoryService.apply_canonical({
		"capacity": 30,
		"revision": 9,
		"items": [_gel(0, 2, "gel-stale")],
	})
	var timeout_id := InventoryService.request_move("gel-stale", 5)
	InventoryService.force_pending_timeout()
	await get_tree().process_frame
	assert_str(InventoryService.last_request_id).is_equal(timeout_id)
	assert_str(InventoryService.last_reject_code).is_equal("request_timeout")
	assert_bool(DragDropService.active).is_false()
	var hits := [0]
	var cb := func() -> void:
		hits[0] = int(hits[0]) + 1
	WindowManager.connect_once(InventoryService.inventory_changed, cb)
	WindowManager.connect_once(InventoryService.inventory_changed, cb)
	InventoryService._ready()
	InventoryService._ready()
	hits[0] = 0
	InventoryService.apply_canonical({
		"capacity": 30,
		"revision": 10,
		"request_id": "req-resync",
		"items": [_sword(11)],
	})
	assert_int(int(hits[0])).is_equal(1)
	assert_str(String(InventoryService.item_at_slot(11).get("instanceId", ""))).is_equal("inst-sword")
	assert_bool(InventoryService.pending.is_empty()).is_true()


func test_character_switch_logout_and_reconnect() -> void:
	InventoryService.apply_canonical({
		"capacity": 30,
		"revision": 11,
		"items": [_gel(3, 2)],
	})
	DragDropService.begin({"instanceId": "inst-gel", "fromSlot": 3, "fromKind": "bag"})
	assert_bool(DragDropService.active).is_true()
	UiStateService.last_character_id = "char-a"
	UiStateService.handle_character_switch("char-b")
	assert_bool(DragDropService.active).is_false()
	assert_bool(InventoryService.pending.is_empty()).is_true()
	assert_str(InventoryService.selected_instance_id).is_empty()
	AppState.notify_character_loaded({"character_id": "char-c", "name": "Cora"}, false)
	assert_int(InventoryService.items.size()).is_equal(0)
	InventoryService.apply_canonical({
		"capacity": 30,
		"revision": 12,
		"items": [_sword(5)],
	})
	AppState.logged_out.emit()
	assert_int(InventoryService.items.size()).is_equal(0)
	assert_bool(DragDropService.active).is_false()
	AppState.notify_zone_state({
		"zone_id": "zone.starter",
		"inventory": {
			"capacity": 30,
			"revision": 20,
			"items": [_gel(8, 4, "gel-re")],
		},
	}, true)
	assert_str(String(InventoryService.item_at_slot(8).get("instanceId", ""))).is_equal("gel-re")
	assert_int(InventoryService.revision).is_equal(20)


func test_context_router_stays_generic() -> void:
	var sword := _sword(0)
	var actions: Array = ItemContextRouter.actions_for({"kind": "bag"}, sword)
	assert_int(actions.size()).is_greater_equal(1)
	assert_str(String((actions[0] as Dictionary).get("id", ""))).is_equal(ItemContextRouter.ACTION_EQUIP)
	var gel_actions: Array = ItemContextRouter.actions_for({"kind": "bag"}, _gel(1, 4))
	assert_str(String((gel_actions[0] as Dictionary).get("id", ""))).is_equal(ItemContextRouter.ACTION_SPLIT)
	var locked: Dictionary = _gel(2, 2)
	locked["lockReason"] = "trade"
	var locked_actions: Array = ItemContextRouter.actions_for({"kind": "bag"}, locked)
	assert_str(String((locked_actions[0] as Dictionary).get("id", ""))).is_equal(ItemContextRouter.ACTION_LOCKED)
	ItemContextRouter.set_context(ItemContextRouter.CONTEXT_TRADE)
	var trade_actions: Array = ItemContextRouter.actions_for({"kind": "bag"}, sword)
	assert_int(trade_actions.size()).is_equal(1)
	assert_str(String((trade_actions[0] as Dictionary).get("id", ""))).is_equal(ItemContextRouter.ACTION_OFFER)
	ItemContextRouter.set_context(ItemContextRouter.CONTEXT_CORPSE)
	assert_int(ItemContextRouter.actions_for({"kind": "bag"}, sword).size()).is_greater_equal(1)
	ItemContextRouter.set_context(ItemContextRouter.CONTEXT_BAG)
	CorpseService.last_corpse = {"eligible": true}
	var corpse_item := {
		"instanceId": "entry-1",
		"entryId": "entry-1",
		"itemId": "item.slime_gel",
		"quantity": 1,
		"state": "PRIVATE_AVAILABLE",
	}
	var corpse_actions: Array = ItemContextRouter.actions_for({"kind": "corpse"}, corpse_item)
	assert_int(corpse_actions.size()).is_equal(1)
	assert_str(String((corpse_actions[0] as Dictionary).get("id", ""))).is_equal(ItemContextRouter.ACTION_LOOT)
	var rolling := corpse_item.duplicate(true)
	rolling["state"] = "ROLL_PENDING"
	var rolling_actions: Array = ItemContextRouter.actions_for({"kind": "corpse"}, rolling)
	assert_str(String((rolling_actions[0] as Dictionary).get("id", ""))).is_equal(ItemContextRouter.ACTION_LOCKED)
	var merchant_item := {
		"instanceId": "vendor.test_general:item.test_potion",
		"stockEntryId": "vendor.test_general:item.test_potion",
		"itemId": "item.test_potion",
		"buyPrice": 10,
		"quantity": 1,
	}
	var merchant_actions: Array = ItemContextRouter.actions_for({"kind": "merchant"}, merchant_item)
	assert_int(merchant_actions.size()).is_equal(1)
	assert_str(String((merchant_actions[0] as Dictionary).get("id", ""))).is_equal(ItemContextRouter.ACTION_BUY)


func test_corpse_drag_rejects_bag_to_corpse_and_occupied_slot() -> void:
	var fake := FakeNetworkBackend.new()
	NetworkService.backend = fake
	NetworkService.match_id = "match-starter-shared"
	CorpseService.last_corpse_id = "corpse-1"
	InventoryService.apply_canonical({
		"capacity": 30,
		"revision": 3,
		"items": [_gel(0, 2, "gel-bag"), _sword(1, "sword-bag")],
	})
	var corpse_dest := auto_free(ItemSlotView.new()) as ItemSlotView
	corpse_dest.origin_kind = "corpse"
	corpse_dest.slot_index = 0
	var rejected := InventoryService.handle_drop(_payload("gel-bag", 0), corpse_dest)
	assert_str(rejected).is_empty()
	assert_str(InventoryService.last_reject_code).is_equal("destination_unavailable")
	assert_int(fake.send_calls).is_equal(0)
	var occupied := InventoryService.handle_drop({
		"kind": "corpse_item",
		"fromKind": "corpse",
		"fromSlot": 0,
		"entryId": "entry-gel",
		"instanceId": "entry-gel",
		"itemId": "item.slime_gel",
		"quantity": 1,
	}, _bag_dest(1))
	assert_str(occupied).is_empty()
	assert_str(InventoryService.last_reject_code).is_equal("invalid_slot")
	var claimed := InventoryService.handle_drop({
		"kind": "corpse_item",
		"fromKind": "corpse",
		"fromSlot": 0,
		"entryId": "entry-gel",
		"instanceId": "entry-gel",
		"itemId": "item.slime_gel",
		"quantity": 1,
	}, _bag_dest(4))
	assert_str(claimed).is_not_empty()
	await get_tree().process_frame
	assert_int(fake.last_send_opcode).is_equal(MatchProtocol.CLIENT_CLAIM_CORPSE_ITEM)
	var payload: Dictionary = JSON.parse_string(fake.last_send_payload)
	assert_str(String(payload.get("corpseId", ""))).is_equal("corpse-1")
	assert_str(String(payload.get("entryId", ""))).is_equal("entry-gel")
	assert_int(int(payload.get("toSlotIndex", -1))).is_equal(4)
	assert_bool(payload.has("lootRecipients")).is_false()


func test_merchant_drag_buys_into_empty_and_compatible_slots() -> void:
	var fake := FakeNetworkBackend.new()
	NetworkService.backend = fake
	NetworkService.match_id = "match-starter-shared"
	VendorService.last_npc_id = "npc.test_vendor"
	VendorService.last_session_id = "sess-merchant-drag"
	VendorService.last_vendor_id = "vendor.test_general"
	InventoryService.apply_canonical({
		"capacity": 30,
		"revision": 4,
		"items": [_sword(1, "sword-bag")],
	})
	var merchant_payload := {
		"kind": "merchant_item",
		"fromKind": "merchant",
		"fromSlot": 0,
		"stockEntryId": "vendor.test_general:item.test_potion",
		"instanceId": "vendor.test_general:item.test_potion",
		"itemId": "item.test_potion",
		"quantity": 1,
	}
	var bought := InventoryService.handle_drop(merchant_payload, _bag_dest(8))
	assert_str(bought).is_not_empty()
	await get_tree().process_frame
	assert_int(fake.last_send_opcode).is_equal(MatchProtocol.CLIENT_VENDOR_BUY)
	var payload: Dictionary = JSON.parse_string(fake.last_send_payload)
	assert_str(String(payload.get("vendorId", ""))).is_equal("vendor.test_general")
	assert_str(String(payload.get("stockEntryId", ""))).is_equal("vendor.test_general:item.test_potion")
	assert_int(int(payload.get("preferredSlot", -1))).is_equal(8)
	assert_bool(payload.has("price")).is_false()
	var rejected := InventoryService.handle_drop(merchant_payload, _bag_dest(1))
	assert_str(rejected).is_empty()
	assert_str(InventoryService.last_reject_code).is_equal("stack_incompatible")
	var merchant_dest := auto_free(ItemSlotView.new()) as ItemSlotView
	merchant_dest.origin_kind = "merchant"
	merchant_dest.slot_index = 0
	var sell_rejected := InventoryService.handle_drop(_payload("sword-bag", 1), merchant_dest)
	assert_str(sell_rejected).is_empty()
	assert_str(InventoryService.last_reject_code).is_equal("destination_unavailable")


func test_click_selects_bag_item_without_starting_a_drag() -> void:
	InventoryService.apply_canonical({
		"capacity": 30,
		"revision": 2,
		"items": [_gel(0, 3), _sword(2)],
	})
	var bag_slot := auto_free(ItemSlotView.new()) as ItemSlotView
	bag_slot.origin_kind = "bag"
	bag_slot.slot_index = 0
	bag_slot.refresh(_gel(0, 3))
	InventoryService.handle_slot_pressed(bag_slot)
	assert_str(InventoryService.selected_instance_id).is_equal("inst-gel")
	assert_bool(DragDropService.active).is_false()
	InventoryService.handle_slot_drag_begun(bag_slot)
	assert_bool(DragDropService.active).is_true()
	assert_str(String(DragDropService.payload.get("fromKind", ""))).is_equal("bag")
	assert_str(String(DragDropService.payload.get("instanceId", ""))).is_equal("inst-gel")
	DragDropService.cancel()
	var dest_null := InventoryService.handle_drop(_payload("inst-gel", 0), null)
	assert_str(dest_null).is_empty()
	assert_bool(DragDropService.active).is_false()


func test_successful_action_result_clears_bag_pending() -> void:
	var fake := FakeNetworkBackend.new()
	NetworkService.backend = fake
	NetworkService.match_id = "match-starter-shared"
	InventoryService.apply_canonical({
		"capacity": 30,
		"revision": 3,
		"items": [_gel(0, 2, "gel-ok")],
	})
	var request_id := InventoryService.request_move("gel-ok", 4)
	assert_bool(InventoryService.slot_is_pending(0)).is_true()
	InventoryService._on_action_result({
		"ok": true,
		"result_ok": true,
		"code": "ok",
		"request_id": request_id,
	})
	assert_bool(InventoryService.pending.is_empty()).is_true()


func test_context_menu_includes_destroy_and_drop() -> void:
	var actions: Array = ItemContextRouter.actions_for({"kind": "bag"}, _gel(1, 4))
	var ids: PackedStringArray = PackedStringArray()
	for entry in actions:
		ids.append(String((entry as Dictionary).get("id", "")))
	assert_bool(ids.has(ItemContextRouter.ACTION_SPLIT)).is_true()
	assert_bool(ids.has(ItemContextRouter.ACTION_DESTROY)).is_true()
	assert_bool(ids.has(ItemContextRouter.ACTION_DROP)).is_true()
	var equip_actions: Array = ItemContextRouter.actions_for({"kind": "equipment"}, _sword(-1))
	assert_str(String((equip_actions[0] as Dictionary).get("id", ""))).is_equal(ItemContextRouter.ACTION_UNEQUIP)


func test_select_then_equip_sends_equip_and_tracks_pending() -> void:
	var fake := FakeNetworkBackend.new()
	NetworkService.backend = fake
	NetworkService.match_id = "match-starter-shared"
	InventoryService.apply_canonical({
		"capacity": 30,
		"revision": 4,
		"items": [_sword(2, "sword-eq")],
	})
	var bag_slot := auto_free(ItemSlotView.new()) as ItemSlotView
	bag_slot.origin_kind = "bag"
	bag_slot.slot_index = 2
	bag_slot.refresh(_sword(2, "sword-eq"))
	InventoryService.handle_slot_pressed(bag_slot)
	assert_str(InventoryService.selected_instance_id).is_equal("sword-eq")
	assert_bool(DragDropService.active).is_false()
	var request_id := InventoryService.request_equip_selected()
	assert_str(request_id).is_not_empty()
	assert_int(fake.last_send_opcode).is_equal(MatchProtocol.CLIENT_EQUIP)
	assert_str(String(InventoryService.pending.get("kind", ""))).is_equal("equip")
	InventoryService._on_action_result({
		"ok": true,
		"result_ok": true,
		"code": "ok",
		"request_id": request_id,
	})
	assert_bool(InventoryService.pending.is_empty()).is_true()
	ItemContextRouter.execute(ItemContextRouter.ACTION_EQUIP, {"kind": "bag"}, _sword(2, "sword-eq"))
	assert_int(fake.last_send_opcode).is_equal(MatchProtocol.CLIENT_EQUIP)
	assert_str(String(InventoryService.pending.get("kind", ""))).is_equal("equip")


func test_stale_full_state_does_not_rewind_bag() -> void:
	InventoryService.apply_canonical({
		"capacity": 30,
		"revision": 12,
		"items": [_gel(4, 2, "gel-live")],
	})
	AppState.notify_zone_state({
		"inventory": {
			"capacity": 30,
			"revision": 11,
			"items": [_gel(0, 1, "gel-old")],
		},
	}, true)
	assert_int(InventoryService.revision).is_equal(12)
	assert_str(String(InventoryService.item_at_slot(4).get("instanceId", ""))).is_equal("gel-live")
	assert_bool(InventoryService.item_at_slot(0).is_empty()).is_true()


func test_hud_passes_world_clicks_and_stops_bag_slots() -> void:
	var hud: WorldHud = auto_free(preload("res://scenes/world/world_hud.tscn").instantiate())
	add_child(hud)
	await get_tree().process_frame
	assert_int((hud.get_node("Root") as Control).mouse_filter).is_equal(Control.MOUSE_FILTER_IGNORE)
	assert_int((hud.get_node("Root/Inventory") as Control).mouse_filter).is_equal(Control.MOUSE_FILTER_IGNORE)
	assert_int((hud.get_node("Root/LeftColumn/Party") as Control).mouse_filter).is_equal(Control.MOUSE_FILTER_IGNORE)
	var bag: BagGrid = hud.get_node("Root/Inventory/Margin/VBox/ListHost/Bag")
	assert_int(bag.mouse_filter).is_equal(Control.MOUSE_FILTER_IGNORE)
	assert_int((bag.slot_at(0) as Control).mouse_filter).is_equal(Control.MOUSE_FILTER_STOP)
	if hud._trade_panel != null:
		assert_int(hud._trade_panel.mouse_filter).is_equal(Control.MOUSE_FILTER_IGNORE)


func test_bag_drop_targets_any_empty_slot() -> void:
	var fake := FakeNetworkBackend.new()
	NetworkService.backend = fake
	NetworkService.match_id = "match-starter-shared"
	InventoryService.apply_canonical({
		"capacity": 30,
		"revision": 9,
		"items": [_gel(0, 1, "gel-move")],
	})
	for slot in [1, 8, 15, 23, 29]:
		var move_id := InventoryService.handle_drop(_payload("gel-move", 0), _bag_dest(slot))
		assert_str(move_id).is_not_empty()
		assert_int(fake.last_send_opcode).is_equal(MatchProtocol.CLIENT_MOVE_ITEM)
		var move_payload: Dictionary = JSON.parse_string(fake.last_send_payload)
		assert_str(String(move_payload.get("instanceId", ""))).is_equal("gel-move")
		assert_int(int(move_payload.get("toSlotIndex", -1))).is_equal(slot)
	assert_str(InventoryService.request_move("gel-move", 30)).is_empty()
	assert_str(InventoryService.last_reject_code).is_equal("invalid_slot")
