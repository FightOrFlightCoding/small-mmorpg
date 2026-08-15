extends GdUnitTestSuite

## Matching opcodes and strict FULL_STATE validation.


func before_test() -> void:
	SceneRouter.reset_for_tests()
	AppState.reset_for_tests()
	NetworkService.reset_for_tests()


func test_opcodes_match_the_server_allocation() -> void:
	assert_int(MatchProtocol.VERSION).is_equal(1)
	assert_int(MatchProtocol.CLIENT_INPUT).is_equal(1)
	assert_int(MatchProtocol.CLIENT_INTERACT).is_equal(2)
	assert_int(MatchProtocol.CLIENT_ATTACK).is_equal(3)
	assert_int(MatchProtocol.CLIENT_PICKUP).is_equal(4)
	assert_int(MatchProtocol.CLIENT_EQUIP).is_equal(5)
	assert_int(MatchProtocol.CLIENT_QUEST_ACCEPT).is_equal(6)
	assert_int(MatchProtocol.CLIENT_QUEST_TURN_IN).is_equal(7)
	assert_int(MatchProtocol.CLIENT_RESYNC_REQUEST).is_equal(8)
	assert_int(MatchProtocol.SERVER_FULL_STATE).is_equal(101)
	assert_int(MatchProtocol.SERVER_SNAPSHOT).is_equal(102)
	assert_int(MatchProtocol.SERVER_ACTION_RESULT).is_equal(103)
	assert_int(MatchProtocol.SERVER_COMBAT_EVENT).is_equal(104)
	assert_int(MatchProtocol.SERVER_INVENTORY_STATE).is_equal(105)
	assert_int(MatchProtocol.SERVER_QUEST_STATE).is_equal(106)
	assert_int(MatchProtocol.SERVER_INTERACTION_RESULT).is_equal(107)
	assert_int(MatchProtocol.SERVER_SYSTEM_MESSAGE).is_equal(108)
	assert_str(MatchProtocol.FIND_OR_CREATE_STARTER_ZONE_RPC).is_equal("find_or_create_starter_zone")


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
