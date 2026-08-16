extends GdUnitTestSuite

## Matching opcodes and strict FULL_STATE validation.


func before_test() -> void:
	SceneRouter.reset_for_tests()
	AppState.reset_for_tests()
	NetworkService.reset_for_tests()


func test_join_metadata_carries_selection_ticket_not_character_id() -> void:
	var meta: Dictionary = MatchProtocol.join_metadata("aa", "ticket-9")
	assert_str(String(meta.get("selectionTicket", ""))).is_equal("ticket-9")
	assert_bool(meta.has("characterId")).is_false()
	assert_str(String(meta.get("protocolVersion", ""))).is_equal(str(MatchProtocol.VERSION))
	assert_int(MatchProtocol.VERSION).is_equal(1)
	assert_int(MatchProtocol.CLIENT_INPUT).is_equal(1)
	assert_int(MatchProtocol.CLIENT_INTERACT).is_equal(2)
	assert_int(MatchProtocol.CLIENT_ATTACK).is_equal(3)
	assert_int(MatchProtocol.CLIENT_PICKUP).is_equal(4)
	assert_int(MatchProtocol.CLIENT_EQUIP).is_equal(5)
	assert_int(MatchProtocol.CLIENT_QUEST_ACCEPT).is_equal(6)
	assert_int(MatchProtocol.CLIENT_QUEST_TURN_IN).is_equal(7)
	assert_int(MatchProtocol.CLIENT_RESYNC_REQUEST).is_equal(8)
	assert_int(MatchProtocol.CLIENT_ALLOCATE_ATTRIBUTES).is_equal(9)
	assert_int(MatchProtocol.SERVER_FULL_STATE).is_equal(101)
	assert_int(MatchProtocol.SERVER_SNAPSHOT).is_equal(102)
	assert_int(MatchProtocol.SERVER_ACTION_RESULT).is_equal(103)
	assert_int(MatchProtocol.SERVER_COMBAT_EVENT).is_equal(104)
	assert_int(MatchProtocol.SERVER_INVENTORY_STATE).is_equal(105)
	assert_int(MatchProtocol.SERVER_QUEST_STATE).is_equal(106)
	assert_int(MatchProtocol.SERVER_INTERACTION_RESULT).is_equal(107)
	assert_int(MatchProtocol.SERVER_SYSTEM_MESSAGE).is_equal(108)
	assert_int(MatchProtocol.SERVER_EQUIPMENT_STATE).is_equal(109)
	assert_int(MatchProtocol.SERVER_WALLET_STATE).is_equal(110)
	assert_int(MatchProtocol.SERVER_PROGRESSION_STATE).is_equal(111)
	assert_float(MatchProtocol.INPUT_SEND_HZ).is_equal(10.0)
	assert_float(MatchProtocol.SNAPSHOT_RATE_HZ).is_equal(10.0)
	assert_float(MatchProtocol.SNAPSHOT_TIMEOUT_SEC).is_equal(2.0)
	assert_float(MatchProtocol.INTERP_DELAY_TICKS).is_equal(1.0)
	assert_float(SnapshotBuffer.INTERP_DELAY_TICKS).is_equal(MatchProtocol.INTERP_DELAY_TICKS)
	assert_float(MatchProtocol.SNAP_THRESHOLD_PX).is_equal(24.0)
	assert_str(MatchProtocol.FIND_OR_CREATE_STARTER_ZONE_RPC).is_equal("find_or_create_starter_zone")


func test_next_input_seq_adopts_a_higher_ack() -> void:
	assert_int(MatchProtocol.next_input_seq(0, 40)).is_equal(40)
	assert_int(MatchProtocol.next_input_seq(40, 38)).is_equal(40)
	assert_int(MatchProtocol.next_input_seq(12, 12)).is_equal(12)
	assert_int(MatchProtocol.next_input_seq(0, 0)).is_equal(0)


func test_full_state_requires_self_and_catalog_hash() -> void:
	assert_bool(GameService.start_boot()).is_true()
	var hash := ContentRegistry.get_content_hash()
	var raw := JSON.stringify({
		"protocolVersion": 1,
		"contentHash": hash,
		"tick": 4,
		"zoneId": "zone.starter",
		"selfId": "user-alice",
		"players": [{"userId": "user-alice", "name": "Alice"}, {"userId": "user-bob", "name": "Bob"}],
		"npcs": [{"npcId": "npc.elder"}],
		"enemies": [{"enemyId": "enemy.green_slime"}],
		"loot": [],
	})
	var parsed: Dictionary = MatchProtocol.parse_full_state(raw, hash)
	assert_bool(bool(parsed["ok"])).is_true()
	assert_str(parsed["view"]["self_id"]).is_equal("user-alice")
	assert_int((parsed["view"]["players"] as Array).size()).is_equal(2)


func test_full_state_rejects_protocol_mismatch() -> void:
	var parsed: Dictionary = MatchProtocol.parse_full_state(
		JSON.stringify({
			"protocolVersion": 9,
			"contentHash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
			"tick": 1,
			"zoneId": "zone.starter",
			"selfId": "user-alice",
			"players": [{"userId": "user-alice"}],
			"npcs": [],
			"enemies": [],
		}),
		"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	)
	assert_bool(bool(parsed["ok"])).is_false()
	assert_str(parsed["code"]).is_equal("protocol_mismatch")


func test_full_state_rejects_content_mismatch() -> void:
	assert_bool(GameService.start_boot()).is_true()
	var parsed: Dictionary = MatchProtocol.parse_full_state(
		JSON.stringify({
			"protocolVersion": 1,
			"contentHash": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
			"tick": 1,
			"zoneId": "zone.starter",
			"selfId": "user-alice",
			"players": [{"userId": "user-alice"}],
			"npcs": [],
			"enemies": [],
		}),
		ContentRegistry.get_content_hash()
	)
	assert_bool(bool(parsed["ok"])).is_false()
	assert_str(parsed["code"]).is_equal("content_mismatch")


func test_parse_progression_state() -> void:
	var parsed: Dictionary = MatchProtocol.parse_progression_state(
		JSON.stringify({
			"protocolVersion": 1,
			"progression": {"level": 2, "currentXp": 10, "unspentSkillPoints": 1},
		})
	)
	assert_bool(bool(parsed["ok"])).is_true()
	assert_int(int((parsed["progression"] as Dictionary).get("level", 0))).is_equal(2)
	assert_int(int((parsed["progression"] as Dictionary).get("unspentSkillPoints", 0))).is_equal(1)
