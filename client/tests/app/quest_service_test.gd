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
	QuestService.request_accept("quest.slime_problem", "sess-accept-1", "npc.elder")
	await get_tree().process_frame
	assert_bool(QuestService.is_accepted("quest.slime_problem")).is_false()
	assert_bool(QuestService.has_quest("quest.slime_problem")).is_false()
	assert_int(fake.last_send_opcode).is_equal(MatchProtocol.CLIENT_QUEST_ACCEPT)
	var payload: Dictionary = JSON.parse_string(fake.last_send_payload)
	assert_str(String(payload.get("questId", ""))).is_equal("quest.slime_problem")
	assert_str(String(payload.get("interactionSessionId", ""))).is_equal("sess-accept-1")
	assert_str(String(payload.get("npcInstanceId", ""))).is_equal("npc.elder")
	assert_bool(payload.has("requestId")).is_true()
	assert_bool(payload.has("status")).is_false()
	assert_bool(payload.has("questComplete")).is_false()
	assert_bool(payload.has("completed")).is_false()


func test_request_turn_in_sends_session_fields_and_request_id_only() -> void:
	var fake := FakeNetworkBackend.new()
	NetworkService.backend = fake
	NetworkService.match_id = "match-starter-shared"
	assert_bool(QuestService.is_completed("quest.slime_problem")).is_false()
	QuestService.request_turn_in("quest.slime_problem", "npc.elder", "sess-turnin-1")
	await get_tree().process_frame
	assert_bool(QuestService.is_completed("quest.slime_problem")).is_false()
	assert_int(fake.last_send_opcode).is_equal(MatchProtocol.CLIENT_QUEST_TURN_IN)
	var payload: Dictionary = JSON.parse_string(fake.last_send_payload)
	assert_str(String(payload.get("questId", ""))).is_equal("quest.slime_problem")
	assert_str(String(payload.get("npcInstanceId", ""))).is_equal("npc.elder")
	assert_str(String(payload.get("interactionSessionId", ""))).is_equal("sess-turnin-1")
	assert_bool(payload.has("npcId")).is_false()
	assert_bool(payload.has("requestId")).is_true()
	assert_bool(payload.has("gold")).is_false()
	assert_bool(payload.has("questComplete")).is_false()
	assert_bool(payload.has("status")).is_false()


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


func test_quest_state_completed_updates_journal() -> void:
	QuestService.apply_quests([{
		"questId": "quest.slime_problem",
		"displayName": "Slime Problem",
		"status": "completed",
		"turnInNpcId": "npc.elder",
		"objectives": [{
			"type": "acquire_item",
			"itemId": "item.slime_gel",
			"current": 1,
			"required": 1,
		}],
	}])
	assert_bool(QuestService.is_completed("quest.slime_problem")).is_true()
	assert_str(String(QuestService.journal_view().get("state", ""))).is_equal("Completed")
	var hud: WorldHud = auto_free(preload("res://scenes/world/world_hud.tscn").instantiate())
	add_child(hud)
	await get_tree().process_frame
	hud.refresh_journal(QuestService.journal_view())
	assert_str(hud.get_node("Root/Journal/Margin/VBox/Body").text).contains("Completed")


func test_offered_helpers_use_npc_content_not_dialogue_literals() -> void:
	var fake := FakeNetworkBackend.new()
	NetworkService.backend = fake
	NetworkService.match_id = "match-starter-shared"
	QuestService.set_speaker("npc.elder")
	assert_str(QuestService.offered_quest_id()).is_equal("quest.slime_problem")
	assert_str(QuestService.turn_in_quest_id()).is_equal("quest.slime_problem")
	QuestService.request_accept_offered("sess-offer-1", "npc.elder")
	await get_tree().process_frame
	assert_int(fake.last_send_opcode).is_equal(MatchProtocol.CLIENT_QUEST_ACCEPT)
	var accept_payload: Dictionary = JSON.parse_string(fake.last_send_payload)
	assert_str(String(accept_payload.get("questId", ""))).is_equal("quest.slime_problem")
	assert_str(String(accept_payload.get("interactionSessionId", ""))).is_equal("sess-offer-1")
	assert_str(String(accept_payload.get("npcInstanceId", ""))).is_equal("npc.elder")
	QuestService.request_turn_in_offered("sess-offer-1", "npc.elder")
	await get_tree().process_frame
	assert_int(fake.last_send_opcode).is_equal(MatchProtocol.CLIENT_QUEST_TURN_IN)
	var turn_in_payload: Dictionary = JSON.parse_string(fake.last_send_payload)
	assert_str(String(turn_in_payload.get("questId", ""))).is_equal("quest.slime_problem")
	assert_str(String(turn_in_payload.get("npcInstanceId", ""))).is_equal("npc.elder")
	assert_str(String(turn_in_payload.get("interactionSessionId", ""))).is_equal("sess-offer-1")
	assert_bool(turn_in_payload.has("npcId")).is_false()
	QuestService.set_speaker("npc.test_herald")
	assert_str(QuestService.offered_quest_id()).is_equal("quest.test.talk")
	assert_str(QuestService.turn_in_quest_id()).is_equal("quest.test.talk")
	QuestService.set_speaker("")


func test_character_specific_markers_refresh_from_server_payloads() -> void:
	QuestService.apply_markers([
		{"npcId": "npc.elder", "marker": "!"},
		{"npcId": "npc.test_herald", "marker": "·"},
	])
	assert_str(QuestService.marker_for("npc.elder")).is_equal("!")
	assert_str(QuestService.marker_for("npc.test_herald")).is_equal("·")
	QuestService.apply_markers([{"npcId": "npc.elder", "marker": "?"}])
	assert_str(QuestService.marker_for("npc.elder")).is_equal("?")
	assert_str(QuestService.marker_for("npc.test_herald")).is_equal("")
	var parsed: Dictionary = MatchProtocol.parse_full_state(JSON.stringify({
		"protocolVersion": 1,
		"contentHash": ContentRegistry.get_content_hash(),
		"tick": 4,
		"zoneId": "zone.starter",
		"selfId": "user-alice",
		"players": [{"userId": "user-alice", "name": "Alice"}],
		"npcs": [{"npcId": "npc.elder"}],
		"enemies": [],
		"quests": [],
		"npcQuestMarkers": [{"npcId": "npc.elder", "marker": "!"}],
	}), ContentRegistry.get_content_hash())
	assert_bool(bool(parsed.get("ok", false))).is_true()
	AppState.notify_zone_state(parsed["view"], true)
	assert_str(QuestService.marker_for("npc.elder")).is_equal("!")
	NetworkService.backend = FakeNetworkBackend.new()
	NetworkService.match_id = "match-starter-shared"
	NetworkService._connect_match_signals()
	NetworkService.backend.match_state_received.emit(
		MatchProtocol.SERVER_QUEST_STATE,
		JSON.stringify({
			"protocolVersion": 1,
			"contentHash": ContentRegistry.get_content_hash(),
			"requestId": "req-marker-1",
			"quests": [],
			"npcQuestMarkers": [{"npcId": "npc.elder", "marker": "?"}],
		})
	)
	assert_str(QuestService.marker_for("npc.elder")).is_equal("?")
