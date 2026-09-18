extends GdUnitTestSuite

## Nearby interact pick, server-approved dialogue, and QUEST_ACCEPT intentions.


func before_test() -> void:
	SceneRouter.reset_for_tests()
	AppState.reset_for_tests()
	NetworkService.reset_for_tests()
	QuestService.reset_for_tests()
	WindowManager.reset_for_tests()
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
		"target_id": "npc.elder",
	})
	assert_bool(opened).is_false()
	assert_int(presenter.open_count).is_equal(0)


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


func test_nearby_npc_click_pick_uses_server_range() -> void:
	var elder := [{"id": "npc.elder", "npcId": "npc.elder", "x": 160, "y": 320}]
	assert_str(InteractIntent.npc_id_at(Vector2(160, 320), Vector2(160, 320), elder)).is_equal("npc.elder")
	assert_str(InteractIntent.npc_id_at(Vector2(160, 320), Vector2(240, 384), elder)).is_equal("")
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
	var opened := 0
	presenter.dialogue_opened.connect(func(_npc_id: String) -> void:
		opened += 1
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
	assert_bool(presenter.handle_interaction_result({
		"result_ok": true,
		"code": "ok",
		"request_id": "req-other",
		"target_id": "npc.elder",
		"interaction_session_id": "sess-dup-1",
		"current_node_id": "start",
	})).is_false()
	assert_int(opened).is_equal(1)
	assert_int(presenter.open_count).is_equal(1)
