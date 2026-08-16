extends GdUnitTestSuite

## Nearby interact pick, server-approved dialogue, and QUEST_ACCEPT intentions.


func before_test() -> void:
	SceneRouter.reset_for_tests()
	AppState.reset_for_tests()
	NetworkService.reset_for_tests()
	QuestService.reset_for_tests()
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
	assert_str(file.get_as_text()).contains("do QuestService.request_accept(\"quest.slime_problem\")")
	assert_str(file.get_as_text()).contains("do QuestService.request_turn_in(\"quest.slime_problem\", \"npc.elder\")")


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
