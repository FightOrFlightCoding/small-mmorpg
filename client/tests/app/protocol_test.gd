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
	assert_str(String(meta.get("clientVersion", ""))).is_equal(MatchProtocol.CLIENT_VERSION)
	assert_str(MatchProtocol.SESSION_HANDSHAKE_RPC).is_equal("session_handshake")
	assert_bool(MatchProtocol.is_compatibility_code("client_too_old")).is_true()
	assert_bool(MatchProtocol.is_maintenance_code("server_maintenance")).is_true()
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
	assert_int(MatchProtocol.CLIENT_DESTROY_ITEM).is_equal(10)
	assert_int(MatchProtocol.CLIENT_SPLIT_STACK).is_equal(11)
	assert_int(MatchProtocol.CLIENT_MOVE_ITEM).is_equal(12)
	assert_int(MatchProtocol.CLIENT_USE_ABILITY).is_equal(13)
	assert_int(MatchProtocol.CLIENT_CANCEL_CAST).is_equal(14)
	assert_int(MatchProtocol.CLIENT_ASSIGN_HOTBAR).is_equal(15)
	assert_int(MatchProtocol.CLIENT_UNLOCK_ABILITY).is_equal(16)
	assert_int(MatchProtocol.CLIENT_SET_TARGET).is_equal(17)
	assert_int(MatchProtocol.CLIENT_RELEASE_RESPAWN).is_equal(18)
	assert_int(MatchProtocol.CLIENT_VENDOR_BUY).is_equal(19)
	assert_int(MatchProtocol.CLIENT_VENDOR_SELL).is_equal(20)
	assert_int(MatchProtocol.CLIENT_INN_REST).is_equal(21)
	assert_int(MatchProtocol.CLIENT_CAVE_ENTER).is_equal(22)
	assert_int(MatchProtocol.CLIENT_CAVE_EXIT).is_equal(23)
	assert_int(MatchProtocol.CLIENT_TRADE_INVITE).is_equal(24)
	assert_int(MatchProtocol.CLIENT_TRADE_ACCEPT_INVITE).is_equal(25)
	assert_int(MatchProtocol.CLIENT_TRADE_DECLINE_INVITE).is_equal(26)
	assert_int(MatchProtocol.CLIENT_TRADE_SET_OFFER).is_equal(27)
	assert_int(MatchProtocol.CLIENT_TRADE_REMOVE_OFFER).is_equal(28)
	assert_int(MatchProtocol.CLIENT_TRADE_SET_GOLD).is_equal(29)
	assert_int(MatchProtocol.CLIENT_TRADE_ACCEPT_REVISION).is_equal(30)
	assert_int(MatchProtocol.CLIENT_TRADE_CANCEL).is_equal(31)
	assert_int(MatchProtocol.CLIENT_RETURN_TO_CHARACTER_SELECT).is_equal(32)
	assert_int(MatchProtocol.CLIENT_SELECT_BRANCH).is_equal(33)
	assert_int(MatchProtocol.CLIENT_SET_AUTO_ASSIGN).is_equal(34)
	assert_int(MatchProtocol.CLIENT_AUTO_ASSIGN_UNSPENT_POINTS).is_equal(35)
	assert_int(MatchProtocol.CLIENT_ALLOCATE_ATTRIBUTES_BATCH).is_equal(36)
	assert_int(MatchProtocol.CLIENT_DIALOGUE_CHOOSE).is_equal(39)
	assert_int(MatchProtocol.CLIENT_INTERACTION_CLOSE).is_equal(40)
	assert_int(MatchProtocol.CLIENT_RECOVER_OVERFLOW_ITEM).is_equal(41)
	assert_int(MatchProtocol.CLIENT_OPEN_CORPSE).is_equal(42)
	assert_int(MatchProtocol.CLIENT_CLOSE_CORPSE).is_equal(43)
	assert_int(MatchProtocol.CLIENT_CLAIM_CORPSE_ITEM).is_equal(44)
	assert_int(MatchProtocol.CLIENT_CLAIM_CORPSE_GOLD).is_equal(45)
	assert_int(MatchProtocol.CLIENT_LOOT_ALL_CORPSE).is_equal(46)
	assert_int(MatchProtocol.CLIENT_SUBMIT_LOOT_ROLL).is_equal(47)
	assert_int(MatchProtocol.CLIENT_DROP_ITEM).is_equal(48)
	assert_int(MatchProtocol.CLIENT_PICKUP_GROUND_ITEM).is_equal(49)
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
	assert_int(MatchProtocol.SERVER_ABILITY_STATE).is_equal(112)
	assert_int(MatchProtocol.SERVER_PARTY_STATE).is_equal(113)
	assert_int(MatchProtocol.SERVER_PARTY_EVENT).is_equal(114)
	assert_int(MatchProtocol.SERVER_TRADE_STATE).is_equal(115)
	assert_int(MatchProtocol.SERVER_CORPSE_STATE).is_equal(116)
	assert_int(MatchProtocol.SERVER_CORPSE_REMOVED).is_equal(117)
	assert_int(MatchProtocol.SERVER_LOOT_ROLL_STATE).is_equal(118)
	assert_int(MatchProtocol.SERVER_GROUND_ITEM_REMOVED).is_equal(119)
	assert_float(MatchProtocol.INPUT_SEND_HZ).is_equal(10.0)
	assert_float(MatchProtocol.SNAPSHOT_RATE_HZ).is_equal(10.0)
	assert_float(MatchProtocol.SNAPSHOT_TIMEOUT_SEC).is_equal(2.0)
	assert_float(MatchProtocol.INTERP_DELAY_TICKS).is_equal(1.0)
	assert_float(SnapshotBuffer.INTERP_DELAY_TICKS).is_equal(MatchProtocol.INTERP_DELAY_TICKS)
	assert_float(MatchProtocol.SNAP_THRESHOLD_PX).is_equal(24.0)
	assert_float(MatchProtocol.TRADE_RANGE_PX).is_equal(80.0)
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


func test_parse_party_state_keeps_ok_false_without_message() -> void:
	var parsed: Dictionary = MatchProtocol.parse_party_state(
		JSON.stringify({"ok": false, "code": "not_leader"})
	)
	assert_bool(bool(parsed["ok"])).is_false()
	assert_str(String(parsed.get("code", ""))).is_equal("not_leader")
	assert_str(String(parsed.get("message", ""))).is_not_empty()


func test_parse_party_event_keeps_ok_false_without_message() -> void:
	var parsed: Dictionary = MatchProtocol.parse_party_event(
		JSON.stringify({"ok": false, "code": "not_leader"})
	)
	assert_bool(bool(parsed["ok"])).is_false()
	assert_str(String(parsed.get("code", ""))).is_equal("not_leader")
	assert_str(String(parsed.get("message", ""))).is_not_empty()


func test_parse_trade_state_keeps_ok_false_without_message() -> void:
	var parsed: Dictionary = MatchProtocol.parse_trade_state(
		JSON.stringify({"ok": false, "code": "out_of_range"})
	)
	assert_bool(bool(parsed["ok"])).is_false()
	assert_str(String(parsed.get("code", ""))).is_equal("out_of_range")
	assert_str(String(parsed.get("message", ""))).is_not_empty()


func test_parse_interaction_result_normalizes_failure_with_message() -> void:
	var parsed: Dictionary = MatchProtocol.parse_interaction_result(
		JSON.stringify({
			"protocolVersion": 1,
			"ok": false,
			"code": "rate_limited",
			"requestId": "req-parse-rl",
			"targetId": "npc.cert_quartermaster",
			"message": "Too many interact requests.",
		})
	)
	assert_bool(bool(parsed.get("ok", false))).is_true()
	assert_bool(bool(parsed.get("result_ok", true))).is_false()
	assert_str(String(parsed.get("request_id", ""))).is_equal("req-parse-rl")
	assert_str(String(parsed.get("target_id", ""))).is_equal("npc.cert_quartermaster")
	assert_str(String(parsed.get("code", ""))).is_equal("rate_limited")
	assert_str(String(parsed.get("message", ""))).is_equal("Too many interact requests.")


func test_parse_corpse_state_and_loot_all_result() -> void:
	var corpse_state: Dictionary = MatchProtocol.parse_corpse_state(
		JSON.stringify({
			"protocolVersion": 1,
			"contentHash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
			"requestId": "req-open-c1",
			"corpse": {
				"corpseId": "corpse-1",
				"goldAmount": 7,
				"items": [{"entryId": "e1", "itemId": "item.slime_gel", "quantity": 1, "state": "PRIVATE_AVAILABLE"}],
			},
		})
	)
	assert_bool(bool(corpse_state.get("ok", false))).is_true()
	assert_str(String(corpse_state.get("request_id", ""))).is_equal("req-open-c1")
	assert_str(String((corpse_state["corpse"] as Dictionary).get("corpseId", ""))).is_equal("corpse-1")
	var removed: Dictionary = MatchProtocol.parse_corpse_removed(
		JSON.stringify({
			"protocolVersion": 1,
			"contentHash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
			"corpseId": "corpse-1",
			"reason": "empty",
		})
	)
	assert_bool(bool(removed.get("ok", false))).is_true()
	assert_str(String(removed.get("corpse_id", ""))).is_equal("corpse-1")
	assert_str(String(removed.get("reason", ""))).is_equal("empty")
	var action: Dictionary = MatchProtocol.parse_action_result(
		JSON.stringify({
			"protocolVersion": 1,
			"ok": true,
			"code": "ok",
			"requestId": "req-loot-all1",
			"lootAll": [{"entryId": "gold", "kind": "gold", "code": "ok", "claimed": true}],
		})
	)
	assert_bool(bool(action.get("ok", false))).is_true()
	assert_int((action.get("loot_all", []) as Array).size()).is_equal(1)
	assert_bool(GameService.start_boot()).is_true()
	var hash := ContentRegistry.get_content_hash()
	var full: Dictionary = MatchProtocol.parse_full_state(
		JSON.stringify({
			"protocolVersion": 1,
			"contentHash": hash,
			"tick": 4,
			"zoneId": "zone.starter",
			"selfId": "user-alice",
			"players": [{"userId": "user-alice", "name": "Alice"}],
			"npcs": [],
			"enemies": [],
			"loot": [],
			"corpses": [{"id": "corpse-1", "x": 10, "y": 20}],
			"groundItems": [{"groundEntityId": "ground-1", "itemId": "item.slime_gel", "quantity": 1, "x": 12, "y": 18, "rarity": "rarity.common"}],
		}),
		hash
	)
	assert_bool(bool(full.get("ok", false))).is_true()
	assert_int((full["view"]["corpses"] as Array).size()).is_equal(1)
	assert_int((full["view"]["groundItems"] as Array).size()).is_equal(1)


func test_parse_ground_item_removed() -> void:
	var parsed: Dictionary = MatchProtocol.parse_ground_item_removed(
		JSON.stringify({
			"protocolVersion": 1,
			"groundEntityId": "ground-1",
			"reason": "expired",
		})
	)
	assert_bool(bool(parsed.get("ok", false))).is_true()
	assert_str(String(parsed.get("ground_entity_id", ""))).is_equal("ground-1")
	assert_str(String(parsed.get("reason", ""))).is_equal("expired")
