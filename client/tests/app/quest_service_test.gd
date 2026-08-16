extends GdUnitTestSuite

## QuestService mirrors server state and never accepts locally.


func before_test() -> void:
	SceneRouter.reset_for_tests()
	AppState.reset_for_tests()
	NetworkService.reset_for_tests()
	QuestService.reset_for_tests()
	assert_bool(ContentRegistry.load_bundle()).is_true()


func test_request_accept_does_not_mutate_local_quest_state() -> void:
	var fake := FakeNetworkBackend.new()
	NetworkService.backend = fake
	NetworkService.match_id = "match-starter-shared"
	assert_bool(QuestService.is_accepted("quest.slime_problem")).is_false()
	QuestService.request_accept("quest.slime_problem")
	await get_tree().process_frame
	assert_bool(QuestService.is_accepted("quest.slime_problem")).is_false()
	assert_bool(QuestService.has_quest("quest.slime_problem")).is_false()
	assert_int(fake.last_send_opcode).is_equal(MatchProtocol.CLIENT_QUEST_ACCEPT)
	var payload: Dictionary = JSON.parse_string(fake.last_send_payload)
	assert_str(String(payload.get("questId", ""))).is_equal("quest.slime_problem")
	assert_bool(payload.has("requestId")).is_true()
	assert_bool(payload.has("status")).is_false()
	assert_bool(payload.has("questComplete")).is_false()
	assert_bool(payload.has("completed")).is_false()


func test_journal_mirrors_server_quest_view() -> void:
	QuestService.apply_quests([{
		"questId": "quest.slime_problem",
		"displayName": "Slime Problem",
		"status": "accepted",
		"turnInNpcId": "npc.elder",
		"objectives": [{
			"type": "acquire_item",
			"itemId": "item.slime_gel",
			"current": 0,
			"required": 1,
		}],
	}])
	var view: Dictionary = QuestService.journal_view()
	assert_bool(bool(view.get("empty", true))).is_false()
	assert_str(String(view.get("title", ""))).is_equal("Slime Problem")
	assert_str(String(view.get("state", ""))).is_equal("In progress")
	assert_str(String(view.get("objective", ""))).is_equal("Acquire Slime Gel")
	assert_int(int(view.get("current", -1))).is_equal(0)
	assert_int(int(view.get("required", -1))).is_equal(1)
	assert_str(String(view.get("turn_in_npc", ""))).is_equal("Elder")
	var hud: WorldHud = auto_free(preload("res://scenes/world/world_hud.tscn").instantiate())
	add_child(hud)
	await get_tree().process_frame
	hud.refresh_journal(view)
	assert_str(hud.get_node("Root/Journal/Margin/VBox/Body").text).contains("Slime Problem")
	assert_str(hud.get_node("Root/Journal/Margin/VBox/Body").text).contains("In progress")
	assert_str(hud.get_node("Root/Journal/Margin/VBox/Body").text).contains("0 / 1")
	assert_str(hud.get_node("Root/Journal/Margin/VBox/Body").text).contains("Elder")


func test_full_state_quests_restore_the_journal() -> void:
	var fake := FakeNetworkBackend.new()
	NetworkService.backend = fake
	NetworkService.match_id = "match-starter-shared"
	var parsed: Dictionary = MatchProtocol.parse_full_state(JSON.stringify({
		"protocolVersion": 1,
		"contentHash": ContentRegistry.get_content_hash(),
		"tick": 4,
		"zoneId": "zone.starter",
		"selfId": "user-alice",
		"players": [{"userId": "user-alice", "name": "Alice"}],
		"npcs": [{"npcId": "npc.elder"}],
		"enemies": [],
		"quests": [{
			"questId": "quest.slime_problem",
			"displayName": "Slime Problem",
			"status": "accepted",
			"turnInNpcId": "npc.elder",
			"objectives": [{
				"type": "acquire_item",
				"itemId": "item.slime_gel",
				"current": 0,
				"required": 1,
			}],
		}],
	}), ContentRegistry.get_content_hash())
	assert_bool(bool(parsed.get("ok", false))).is_true()
	AppState.notify_zone_state(parsed["view"], true)
	assert_bool(QuestService.is_accepted("quest.slime_problem")).is_true()
	assert_str(String(QuestService.journal_view().get("title", ""))).is_equal("Slime Problem")


func test_quest_state_opcode_updates_without_local_completion() -> void:
	NetworkService.backend = FakeNetworkBackend.new()
	NetworkService.match_id = "match-starter-shared"
	NetworkService._connect_match_signals()
	NetworkService.backend.match_state_received.emit(
		MatchProtocol.SERVER_QUEST_STATE,
		JSON.stringify({
			"protocolVersion": 1,
			"contentHash": ContentRegistry.get_content_hash(),
			"requestId": "req-accept-1",
			"quests": [{
				"questId": "quest.slime_problem",
				"displayName": "Slime Problem",
				"status": "accepted",
				"turnInNpcId": "npc.elder",
				"objectives": [{
					"type": "acquire_item",
					"itemId": "item.slime_gel",
					"current": 0,
					"required": 1,
				}],
			}],
		})
	)
	assert_bool(QuestService.is_completed("quest.slime_problem")).is_false()
	assert_bool(QuestService.is_accepted("quest.slime_problem")).is_true()
	assert_bool(QuestService.is_ready("quest.slime_problem")).is_false()
