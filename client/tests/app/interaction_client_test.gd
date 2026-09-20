extends GdUnitTestSuite

## Nearby interact pick, server-approved dialogue, and QUEST_ACCEPT intentions.


func before_test() -> void:
	SceneRouter.reset_for_tests()
	AppState.reset_for_tests()
	NetworkService.reset_for_tests()
	QuestService.reset_for_tests()
	VendorService.reset_for_tests()
	InnService.reset_for_tests()
	CaveService.reset_for_tests()
	WindowManager.reset_for_tests()
	HudController.reset_for_tests()
	assert_bool(ContentRegistry.load_bundle()).is_true()


func test_nearby_npc_uses_client_poses_only() -> void:
	var elder := [{"id": "npc.elder", "npcId": "npc.elder", "x": 160, "y": 320}]
	assert_str(InteractIntent.nearest_npc_id(Vector2(160, 320), elder)).is_equal("npc.elder")
	assert_str(InteractIntent.nearest_npc_id(Vector2(240, 384), elder)).is_equal("")
	assert_str(InteractIntent.nearest_npc_id(Vector2(160, 320), [{"id": "npc.missing", "x": 10, "y": 10}])).is_equal("")


func test_dialogue_does_not_open_without_matching_approval() -> void:
	var presenter: DialoguePresenter = auto_free(DialoguePresenter.new())
	add_child(presenter)
	await get_tree().process_frame
	presenter.note_intent("npc.elder", "req-interact-1")
	var opened := presenter.handle_interaction_result({
		"result_ok": false,
		"code": "out_of_range",
		"request_id": "req-interact-1",
		"target_id": "npc.elder",
	})
	assert_bool(opened).is_false()
	assert_int(presenter.open_count).is_equal(0)
	presenter.note_intent("npc.elder", "req-interact-2")
	opened = presenter.handle_interaction_result({
		"result_ok": true,
		"code": "ok",
		"request_id": "req-other",
		"target_id": "npc.other",
	})
	assert_bool(opened).is_false()
	assert_int(presenter.open_count).is_equal(0)
	assert_bool(presenter._window.is_loading()).is_true()


func test_dialogue_opens_after_server_ok() -> void:
	var presenter: DialoguePresenter = auto_free(DialoguePresenter.new())
	add_child(presenter)
	await get_tree().process_frame
	presenter.note_intent("npc.elder", "req-interact-ok")
	var opened := presenter.handle_interaction_result({
		"result_ok": true,
		"code": "ok",
		"request_id": "req-interact-ok",
		"target_id": "npc.elder",
	})
	assert_bool(opened).is_true()
	assert_int(presenter.open_count).is_equal(1)
	assert_str(presenter.last_opened_npc_id).is_equal("npc.elder")


func test_elder_dialogue_compiles_with_required_titles() -> void:
	var file := FileAccess.open("res://content/dialogue/npc.elder.dialogue", FileAccess.READ)
	assert_object(file).is_not_null()
	var resource: DialogueResource = DialogueManager.create_resource_from_text(file.get_as_text())
	assert_object(resource).is_not_null()
	assert_bool(resource.titles.has("start")).is_true()
	assert_bool(resource.titles.has("in_progress")).is_true()
	assert_bool(resource.titles.has("ready")).is_true()
	assert_bool(resource.titles.has("completed")).is_true()
	assert_str(file.get_as_text()).contains("do QuestService.request_accept_offered()")
	assert_str(file.get_as_text()).contains("do QuestService.request_turn_in_offered()")
	assert_str(file.get_as_text()).contains("QuestService.is_completed_offered()")
	assert_bool(file.get_as_text().contains("quest.slime_problem")).is_false()


func test_proof_and_cert_dialogues_turn_in_from_content() -> void:
	var proof := FileAccess.get_file_as_string("res://content/dialogue/npc.proof_giver.dialogue")
	assert_str(proof).contains("do QuestService.request_turn_in_offered()")
	assert_bool(proof.contains("quest.proof_errand")).is_false()
	var cert := FileAccess.get_file_as_string("res://content/dialogue/npc.cert_quartermaster.dialogue")
	assert_str(cert).contains("do QuestService.request_turn_in_offered()")
	assert_bool(cert.contains("quest.cert_scout")).is_false()
	var proof_resource: DialogueResource = DialogueManager.create_resource_from_text(proof)
	assert_object(proof_resource).is_not_null()
	var cert_resource: DialogueResource = DialogueManager.create_resource_from_text(cert)
	assert_object(cert_resource).is_not_null()


func test_world_sends_interact_without_opening_dialogue() -> void:
	var fake := FakeNetworkBackend.new()
	NetworkService.backend = fake
	NetworkService.match_id = "match-starter-shared"
	AppState.notify_zone_state({
		"self_id": "user-alice",
		"zone_id": "zone.starter",
		"tick": 1,
		"ack_seq": 0,
		"players": [{"userId": "user-alice", "name": "Alice", "x": 160, "y": 320}],
		"npcs": [{"id": "npc.elder", "npcId": "npc.elder", "x": 160, "y": 320}],
		"enemies": [],
		"loot": [],
		"quests": [],
	}, true)
	var world: Node = auto_free(preload("res://scenes/world/world.tscn").instantiate())
	add_child(world)
	await get_tree().process_frame
	world.set_process(false)
	world.try_interact()
	await get_tree().process_frame
	assert_int(fake.last_send_opcode).is_equal(MatchProtocol.CLIENT_INTERACT)
	var payload: Dictionary = JSON.parse_string(fake.last_send_payload)
	assert_str(String(payload.get("targetId", ""))).is_equal("npc.elder")
	assert_bool(payload.has("requestId")).is_true()
	var dialogue: DialoguePresenter = world.get_node("DialoguePresenter")
	assert_int(dialogue.open_count).is_equal(0)
	world._on_interaction_result({
		"result_ok": true,
		"code": "ok",
		"request_id": String(payload.get("requestId", "")),
		"target_id": "npc.elder",
	})
	assert_int(dialogue.open_count).is_equal(1)


func test_right_click_pick_sends_same_interact_intent() -> void:
	var fake := FakeNetworkBackend.new()
	NetworkService.backend = fake
	NetworkService.match_id = "match-starter-shared"
	AppState.notify_zone_state({
		"self_id": "user-alice",
		"zone_id": "zone.starter",
		"tick": 1,
		"ack_seq": 0,
		"players": [{"userId": "user-alice", "name": "Alice", "x": 160, "y": 320}],
		"npcs": [{"id": "npc.elder", "npcId": "npc.elder", "x": 160, "y": 320}],
		"enemies": [],
		"loot": [],
		"quests": [],
	}, true)
	var world: Node = auto_free(preload("res://scenes/world/world.tscn").instantiate())
	add_child(world)
	await get_tree().process_frame
	world.set_process(false)
	assert_bool(world.try_interact_at(Vector2(160, 320))).is_true()
	await get_tree().process_frame
	assert_int(fake.last_send_opcode).is_equal(MatchProtocol.CLIENT_INTERACT)
	var payload: Dictionary = JSON.parse_string(fake.last_send_payload)
	assert_str(String(payload.get("targetId", ""))).is_equal("npc.elder")
	assert_bool(payload.has("requestId")).is_true()
	assert_bool(payload.has("x")).is_false()
	assert_bool(payload.has("y")).is_false()


func test_right_click_ground_item_sends_pickup() -> void:
	var fake := FakeNetworkBackend.new()
	NetworkService.backend = fake
	NetworkService.match_id = "match-starter-shared"
	AppState.notify_zone_state({
		"self_id": "user-alice",
		"zone_id": "zone.starter",
		"tick": 1,
		"ack_seq": 0,
		"players": [{"userId": "user-alice", "name": "Alice", "x": 2016, "y": 2816, "health": 10}],
		"npcs": [],
		"enemies": [],
		"loot": [],
		"quests": [],
		"groundItems": [{
			"groundEntityId": "ground.qa.potion",
			"itemId": "item.test_potion",
			"quantity": 1,
			"x": 2016,
			"y": 2816,
			"rarity": "rarity.common",
		}],
	}, true)
	var world: Node = auto_free(preload("res://scenes/world/world.tscn").instantiate())
	add_child(world)
	await get_tree().process_frame
	world.set_process(false)
	assert_bool(world.try_interact_at(Vector2(2016, 2816))).is_true()
	await get_tree().process_frame
	assert_int(fake.last_send_opcode).is_equal(MatchProtocol.CLIENT_PICKUP_GROUND_ITEM)
	var payload: Dictionary = JSON.parse_string(fake.last_send_payload)
	assert_str(String(payload.get("groundEntityId", ""))).is_equal("ground.qa.potion")
	assert_bool(payload.has("requestId")).is_true()
	assert_bool(world.try_interact_at(Vector2(2016, 2840))).is_true()
	assert_int(fake.last_send_opcode).is_equal(MatchProtocol.CLIENT_PICKUP_GROUND_ITEM)


func test_right_click_picks_nearest_ground_item_when_pointer_misses() -> void:
	var fake := FakeNetworkBackend.new()
	NetworkService.backend = fake
	NetworkService.match_id = "match-starter-shared"
	AppState.notify_zone_state({
		"self_id": "user-alice",
		"zone_id": "zone.starter",
		"tick": 1,
		"ack_seq": 0,
		"players": [{"userId": "user-alice", "name": "Alice", "x": 2016, "y": 2816, "health": 10}],
		"npcs": [],
		"enemies": [],
		"loot": [],
		"quests": [],
		"groundItems": [{
			"groundEntityId": "ground.qa.potion",
			"itemId": "item.test_potion",
			"quantity": 1,
			"x": 2016,
			"y": 2816,
			"rarity": "rarity.common",
		}],
	}, true)
	var world: Node = auto_free(preload("res://scenes/world/world.tscn").instantiate())
	add_child(world)
	await get_tree().process_frame
	world.set_process(false)
	assert_bool(world.try_interact_at(Vector2(100, 100))).is_false()
	world.try_pickup()
	await get_tree().process_frame
	assert_int(fake.last_send_opcode).is_equal(MatchProtocol.CLIENT_PICKUP_GROUND_ITEM)
	var payload: Dictionary = JSON.parse_string(fake.last_send_payload)
	assert_str(String(payload.get("groundEntityId", ""))).is_equal("ground.qa.potion")


func test_south_camera_limit_leaves_hud_reserve() -> void:
	var world: Node = auto_free(preload("res://scenes/world/world.tscn").instantiate())
	add_child(world)
	await get_tree().process_frame
	world.set_process(false)
	world._apply_camera_limits({"width": 4096, "height": 3072})
	assert_int(int(world._camera.limit_bottom)).is_equal(3312)


func test_world_interact_skips_bag_not_hotbar() -> void:
	var world: Node = auto_free(preload("res://scenes/world/world.tscn").instantiate())
	add_child(world)
	await get_tree().process_frame
	world.set_process(false)
	var slot: ItemSlotView = auto_free(ItemSlotView.new())
	assert_bool(world.pointer_blocks_world_interact(slot)).is_false()
	slot.instance = {"instanceId": "inst-potion"}
	assert_bool(world.pointer_blocks_world_interact(slot)).is_true()
	var hotbar := Button.new()
	hotbar.name = "Slot4"
	assert_bool(world.pointer_blocks_world_interact(hotbar)).is_false()
	hotbar.free()
	var chat_input := LineEdit.new()
	assert_bool(world.pointer_blocks_world_interact(chat_input)).is_true()
	chat_input.free()
	var inventory := PanelContainer.new()
	inventory.name = "Inventory"
	assert_bool(world.pointer_blocks_world_interact(inventory)).is_false()
	inventory.free()
	var journal := PanelContainer.new()
	journal.name = "Journal"
	assert_bool(world.pointer_blocks_world_interact(journal)).is_false()
	journal.free()
	var bag := BagGrid.new()
	assert_bool(world.pointer_blocks_world_interact(bag)).is_false()
	bag.free()


func test_world_does_not_auto_open_inventory() -> void:
	var world: Node = auto_free(preload("res://scenes/world/world.tscn").instantiate())
	add_child(world)
	await get_tree().process_frame
	world.set_process(false)
	assert_bool(WindowManager.is_open(WindowManager.HUD)).is_true()
	assert_bool(WindowManager.is_open(WindowManager.INVENTORY)).is_false()
	assert_bool(WindowManager.is_open(WindowManager.QUEST_JOURNAL)).is_false()
	assert_bool(WindowManager.is_open(WindowManager.TRADE)).is_false()


func test_nearby_npc_click_pick_uses_server_range() -> void:
	var elder := [{"id": "npc.elder", "npcId": "npc.elder", "x": 160, "y": 320}]
	assert_str(InteractIntent.npc_id_at(Vector2(160, 320), Vector2(160, 320), elder)).is_equal("npc.elder")
	assert_str(InteractIntent.npc_id_at(Vector2(160, 320), Vector2(240, 384), elder)).is_equal("npc.elder")
	assert_str(InteractIntent.npc_id_at(Vector2(400, 400), Vector2(160, 320), elder)).is_equal("")


func test_interact_pointer_defaults_to_right_mouse() -> void:
	InputSettingsService.ensure_actions()
	assert_bool(InputMap.has_action("interact_pointer")).is_true()
	var found := false
	for event in InputMap.action_get_events("interact_pointer"):
		if event is InputEventMouseButton and int((event as InputEventMouseButton).button_index) == MOUSE_BUTTON_RIGHT:
			found = true
	assert_bool(found).is_true()


func test_interaction_window_loading_error_and_present() -> void:
	var window: NpcInteractionWindow = auto_free(NpcInteractionWindow.new())
	add_child(window)
	await get_tree().process_frame
	window.show_loading("Elder")
	assert_bool(window.is_open()).is_true()
	assert_bool(window.is_loading()).is_true()
	window.show_error("Elder", "You are too far away.")
	assert_bool(window.is_loading()).is_false()
	assert_str(window._status.text).is_equal("You are too far away.")
	window.present({
		"npc_id": "npc.elder",
		"npc_name": "Elder",
		"interaction_session_id": "sess-window-1",
		"current_node_id": "start",
		"text": "Hello.\nNeed anything?",
		"options": [{"id": "opt.hear_more", "text": "What do you keep?"}],
		"services": ["quest_offer"],
	})
	assert_int(window._options.get_child_count()).is_equal(1)
	assert_int(window._services.get_child_count()).is_equal(1)
	window.close_window()
	assert_bool(window.is_open()).is_false()


func test_interaction_window_and_presenter_do_not_duplicate_signals() -> void:
	var presenter: DialoguePresenter = auto_free(DialoguePresenter.new())
	add_child(presenter)
	await get_tree().process_frame
	presenter._ensure_window()
	presenter._ensure_window()
	assert_int(presenter._window.option_chosen.get_connections().size()).is_equal(1)
	assert_int(presenter._window.service_chosen.get_connections().size()).is_equal(1)
	assert_int(presenter._window.close_requested.get_connections().size()).is_equal(1)
	var opened: Array[int] = [0]
	presenter.dialogue_opened.connect(func(_npc_id: String) -> void:
		opened[0] += 1
	)
	presenter.note_intent("npc.elder", "req-dup-1")
	var payload := {
		"result_ok": true,
		"code": "ok",
		"request_id": "req-dup-1",
		"target_id": "npc.elder",
		"dialogue_id": "dialogue.npc.elder",
		"interaction_session_id": "sess-dup-1",
		"current_node_id": "start",
		"allowed_option_ids": ["opt.not_now"],
		"available_service_ids": ["quest_offer"],
	}
	assert_bool(presenter.handle_interaction_result(payload)).is_true()
	# Same-session INTERACTION_RESULT refreshes quest dialogue without a second open.
	assert_bool(presenter.handle_interaction_result({
		"result_ok": true,
		"code": "ok",
		"request_id": "req-other",
		"target_id": "npc.elder",
		"interaction_session_id": "sess-dup-1",
		"current_node_id": "start",
	})).is_true()
	assert_int(opened[0]).is_equal(1)
	assert_int(presenter.open_count).is_equal(1)


func test_pending_intent_accepts_matching_npc_even_if_request_id_differs() -> void:
	var presenter: DialoguePresenter = auto_free(DialoguePresenter.new())
	add_child(presenter)
	await get_tree().process_frame
	presenter.note_intent("npc.cert_quartermaster", "req-cert-a")
	assert_bool(presenter._window.is_loading()).is_true()
	var opened := presenter.handle_interaction_result({
		"result_ok": true,
		"code": "ok",
		"request_id": "req-cert-b",
		"target_id": "npc.cert_quartermaster",
		"dialogue_id": "dialogue.npc.cert_quartermaster",
		"interaction_session_id": "sess-cert-1",
		"current_node_id": "start",
		"allowed_option_ids": ["opt.not_now"],
		"available_service_ids": ["quest_offer", "vendor"],
	})
	assert_bool(opened).is_true()
	assert_bool(presenter._window.is_loading()).is_false()
	assert_str(presenter._window._status.text).is_equal("")
	assert_str(presenter._window._body.text).contains("north-east ridge")
	assert_int(presenter._window._options.get_child_count()).is_equal(1)
	assert_int(presenter._window._services.get_child_count()).is_equal(2)


func test_platform_quest_presents_text_and_accept_without_options() -> void:
	var presenter: DialoguePresenter = auto_free(DialoguePresenter.new())
	add_child(presenter)
	await get_tree().process_frame
	presenter.note_intent("npc.platform_quest", "req-pq-1")
	assert_str(presenter._window._status.text).is_equal("Waiting for the server…")
	var opened := presenter.handle_interaction_result({
		"result_ok": true,
		"code": "ok",
		"request_id": "req-pq-1",
		"target_id": "npc.platform_quest",
		"dialogue_id": "dialogue.npc.platform_quest",
		"interaction_session_id": "sess-pq-1",
		"current_node_id": "start",
		"allowed_option_ids": [],
		"available_service_ids": ["quest_offer"],
	})
	assert_bool(opened).is_true()
	assert_bool(presenter._window.is_loading()).is_false()
	assert_str(presenter._window._status.text).is_equal("")
	assert_str(presenter._window._body.text).contains("Speak with me again")
	assert_int(presenter._window._options.get_child_count()).is_equal(0)
	assert_int(presenter._window._services.get_child_count()).is_equal(1)
	assert_str((presenter._window._services.get_child(0) as Button).text).is_equal("Accept quest")


func test_loading_timeout_and_recoverable_error_clear_waiting_status() -> void:
	var presenter: DialoguePresenter = auto_free(DialoguePresenter.new())
	add_child(presenter)
	await get_tree().process_frame
	presenter.note_intent("npc.platform_quest", "req-timeout")
	presenter._on_loading_timeout()
	assert_bool(presenter._window.is_loading()).is_false()
	assert_str(presenter._window._status.text).is_equal("The server did not answer.")
	assert_str(presenter.pending_request_id).is_equal("req-timeout")
	var late := presenter.handle_interaction_result({
		"result_ok": true,
		"code": "ok",
		"request_id": "req-timeout",
		"target_id": "npc.platform_quest",
		"dialogue_id": "dialogue.npc.platform_quest",
		"interaction_session_id": "sess-late-1",
		"current_node_id": "start",
		"allowed_option_ids": [],
		"available_service_ids": ["quest_offer"],
	})
	assert_bool(late).is_true()
	assert_str(presenter._window._status.text).is_equal("")
	assert_str(presenter._window._body.text).contains("Speak with me again")
	presenter.note_intent("npc.cert_quartermaster", "req-rate")
	AppState.report_recoverable("rate_limited", "Too many interact requests.")
	assert_bool(presenter._window.is_loading()).is_false()
	assert_str(presenter._window._status.text).is_equal("Too many interact requests.")


func test_window_process_timeout_clears_waiting_copy() -> void:
	var window: NpcInteractionWindow = auto_free(NpcInteractionWindow.new())
	add_child(window)
	await get_tree().process_frame
	window.show_loading("Platform Questgiver")
	window._loading_started_msec = Time.get_ticks_msec() - 2500
	window._process(0.05)
	assert_bool(window.is_loading()).is_false()
	assert_str(window._status.text).is_equal("The server did not answer.")


func test_null_option_and_service_lists_still_present() -> void:
	var presenter: DialoguePresenter = auto_free(DialoguePresenter.new())
	add_child(presenter)
	await get_tree().process_frame
	presenter.note_intent("npc.platform_quest", "req-null-lists")
	var payload := {
		"result_ok": true,
		"code": "ok",
		"request_id": "req-null-lists",
		"target_id": "npc.platform_quest",
		"dialogue_id": "dialogue.npc.platform_quest",
		"interaction_session_id": "sess-null-1",
		"current_node_id": "start",
	}
	payload["allowed_option_ids"] = null
	payload["available_service_ids"] = null
	payload["services"] = null
	VendorService.reset_for_tests()
	VendorService._on_interaction_result(payload)
	assert_bool(presenter.handle_interaction_result(payload)).is_true()
	assert_bool(presenter._window.is_loading()).is_false()
	assert_str(presenter._window._body.text).contains("Speak with me again")
	assert_int(presenter._window._services.get_child_count()).is_equal(0)


func test_server_camel_case_payloads_roundtrip_through_parse_vendor_and_presenter() -> void:
	var quest_raw := JSON.stringify({
		"protocolVersion": 1,
		"ok": true,
		"code": "ok",
		"requestId": "req-live-pq",
		"targetId": "npc.platform_quest",
		"dialogueId": "dialogue.npc.platform_quest",
		"interactionSessionId": "sess-live-pq",
		"currentNodeId": "start",
		"allowedOptionIds": [],
		"availableServiceIds": ["quest_offer"],
		"services": ["quest_offer"],
		"expiresAtTick": 301,
	})
	var quest_parsed: Dictionary = MatchProtocol.parse_interaction_result(quest_raw)
	var presenter: DialoguePresenter = auto_free(DialoguePresenter.new())
	add_child(presenter)
	await get_tree().process_frame
	presenter.note_intent("npc.platform_quest", "req-live-pq")
	VendorService.reset_for_tests()
	VendorService._on_interaction_result(quest_parsed)
	assert_bool(presenter.handle_interaction_result(quest_parsed)).is_true()
	assert_str(presenter._window._body.text).contains("Speak with me again")
	assert_int(presenter._window._services.get_child_count()).is_equal(1)
	var vendor_raw := JSON.stringify({
		"protocolVersion": 1,
		"ok": true,
		"code": "ok",
		"requestId": "req-live-cert",
		"targetId": "npc.cert_quartermaster",
		"dialogueId": "dialogue.npc.cert_quartermaster",
		"interactionSessionId": "sess-live-cert",
		"currentNodeId": "start",
		"allowedOptionIds": ["opt.not_now"],
		"availableServiceIds": ["quest_offer", "vendor"],
		"services": ["quest_offer", "vendor"],
		"vendorId": "vendor.cert_quartermaster",
		"currencyId": "gold",
		"stock": [{"itemId": "item.cert_mail", "buyPrice": 5}],
		"expiresAtTick": 301,
	})
	var vendor_parsed: Dictionary = MatchProtocol.parse_interaction_result(vendor_raw)
	presenter.note_intent("npc.cert_quartermaster", "req-live-cert")
	VendorService._on_interaction_result(vendor_parsed)
	InnService._on_interaction_result(vendor_parsed)
	CaveService._on_interaction_result(vendor_parsed)
	assert_bool(presenter.handle_interaction_result(vendor_parsed)).is_true()
	assert_str(presenter._window._body.text).contains("north-east ridge")
	assert_int(presenter._window._options.get_child_count()).is_equal(1)
	assert_int(presenter._window._services.get_child_count()).is_equal(2)
	assert_str(VendorService.last_vendor_id).is_equal("vendor.cert_quartermaster")
	assert_int(VendorService.last_stock.size()).is_equal(1)


func test_failed_interaction_result_with_message_keeps_request_id() -> void:
	var parsed: Dictionary = MatchProtocol.parse_interaction_result(
		JSON.stringify({
			"protocolVersion": 1,
			"ok": false,
			"code": "out_of_range",
			"requestId": "req-fail-1",
			"targetId": "npc.platform_quest",
			"message": "Too far from that NPC.",
		})
	)
	assert_bool(bool(parsed.get("ok", false))).is_true()
	assert_bool(bool(parsed.get("result_ok", true))).is_false()
	assert_str(String(parsed.get("request_id", ""))).is_equal("req-fail-1")
	assert_str(String(parsed.get("target_id", ""))).is_equal("npc.platform_quest")
	assert_str(String(parsed.get("message", ""))).is_equal("Too far from that NPC.")


func test_presenter_presents_from_network_signal_without_world() -> void:
	var presenter: DialoguePresenter = auto_free(DialoguePresenter.new())
	add_child(presenter)
	await get_tree().process_frame
	presenter.note_intent("npc.platform_quest", "req-signal-pq")
	assert_str(presenter._window._status.text).is_equal("Waiting for the server…")
	NetworkService.interaction_result_received.emit({
		"result_ok": true,
		"code": "ok",
		"request_id": "req-signal-pq",
		"target_id": "npc.platform_quest",
		"dialogue_id": "dialogue.npc.platform_quest",
		"interaction_session_id": "sess-signal-pq",
		"current_node_id": "start",
		"allowed_option_ids": [],
		"available_service_ids": ["quest_offer"],
	})
	assert_bool(presenter._window.is_loading()).is_false()
	assert_str(presenter._window._status.text).is_equal("")
	assert_str(presenter._window._body.text).contains("Speak with me again")
	assert_int(presenter._window._services.get_child_count()).is_equal(1)


func test_vendor_inn_cave_listen_deferred_to_interaction_results() -> void:
	var vendor_deferred := false
	var inn_deferred := false
	var cave_deferred := false
	for conn in NetworkService.interaction_result_received.get_connections():
		if typeof(conn) != TYPE_DICTIONARY:
			continue
		var flags := int(conn.get("flags", 0))
		var deferred := (flags & CONNECT_DEFERRED) == CONNECT_DEFERRED
		var callable: Callable = conn.get("callable")
		if not callable.is_valid():
			continue
		var method := String(callable.get_method())
		var target: Object = callable.get_object()
		if target == VendorService and method == "_on_interaction_result":
			vendor_deferred = deferred
		elif target == InnService and method == "_on_interaction_result":
			inn_deferred = deferred
		elif target == CaveService and method == "_on_interaction_result":
			cave_deferred = deferred
	assert_bool(vendor_deferred).is_true()
	assert_bool(inn_deferred).is_true()
	assert_bool(cave_deferred).is_true()


func test_pressing_not_now_does_not_free_the_option_button_during_pressed() -> void:
	var presenter: DialoguePresenter = auto_free(DialoguePresenter.new())
	add_child(presenter)
	await get_tree().process_frame
	presenter.note_intent("npc.platform_combined", "req-steward-1")
	assert_bool(presenter.handle_interaction_result({
		"result_ok": true,
		"code": "ok",
		"request_id": "req-steward-1",
		"target_id": "npc.platform_combined",
		"dialogue_id": "dialogue.npc.platform_combined",
		"interaction_session_id": "sess-steward-1",
		"current_node_id": "start",
		"allowed_option_ids": ["opt.not_now"],
		"available_service_ids": ["quest_offer", "vendor"],
	})).is_true()
	assert_int(presenter._window._options.get_child_count()).is_equal(1)
	var button := presenter._window._options.get_child(0) as Button
	assert_str(button.text).is_equal("Not now.")
	button.pressed.emit()
	assert_bool(is_instance_valid(button)).is_true()
	assert_bool(presenter._window.is_loading()).is_true()
	assert_str(presenter._window._status.text).is_equal("Waiting for the server…")
	assert_int(presenter._window._options.get_child_count()).is_equal(0)


func test_open_dialogue_does_not_block_world_input() -> void:
	var presenter: DialoguePresenter = auto_free(DialoguePresenter.new())
	add_child(presenter)
	await get_tree().process_frame
	presenter.note_intent("npc.platform_quest", "req-block-1")
	assert_bool(presenter.is_open()).is_true()
	assert_bool(presenter.blocks_world_input()).is_false()
	presenter._on_loading_timeout()
	assert_bool(presenter.blocks_world_input()).is_false()
	presenter.handle_interaction_result({
		"result_ok": true,
		"code": "ok",
		"request_id": "req-block-1",
		"target_id": "npc.platform_quest",
		"dialogue_id": "dialogue.npc.platform_quest",
		"interaction_session_id": "sess-block-1",
		"current_node_id": "start",
		"allowed_option_ids": [],
		"available_service_ids": ["quest_offer"],
	})
	assert_bool(presenter.is_open()).is_true()
	assert_bool(presenter.blocks_world_input()).is_false()
