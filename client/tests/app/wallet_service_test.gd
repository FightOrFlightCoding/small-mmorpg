extends GdUnitTestSuite

## WalletService mirrors server gold and never sends currency.


func before_test() -> void:
	SceneRouter.reset_for_tests()
	AppState.reset_for_tests()
	NetworkService.reset_for_tests()
	QuestService.reset_for_tests()
	WalletService.reset_for_tests()
	assert_bool(ContentRegistry.load_bundle()).is_true()


func test_wallet_state_updates_gold_only_from_server() -> void:
	NetworkService.backend = FakeNetworkBackend.new()
	NetworkService.match_id = "match-starter-shared"
	NetworkService._connect_match_signals()
	assert_int(WalletService.gold).is_equal(0)
	NetworkService.backend.match_state_received.emit(
		MatchProtocol.SERVER_WALLET_STATE,
		JSON.stringify({
			"protocolVersion": 1,
			"contentHash": ContentRegistry.get_content_hash(),
			"requestId": "req-turnin-1",
			"gold": 25,
		})
	)
	assert_int(WalletService.gold).is_equal(25)


func test_full_state_wallet_restores_gold() -> void:
	var parsed: Dictionary = MatchProtocol.parse_full_state(JSON.stringify({
		"protocolVersion": 1,
		"contentHash": ContentRegistry.get_content_hash(),
		"tick": 4,
		"zoneId": "zone.starter",
		"selfId": "user-alice",
		"players": [{"userId": "user-alice", "name": "Alice"}],
		"npcs": [{"npcId": "npc.elder"}],
		"enemies": [],
		"wallet": {"gold": 25},
	}), ContentRegistry.get_content_hash())
	assert_bool(bool(parsed.get("ok", false))).is_true()
	AppState.notify_zone_state(parsed["view"], true)
	assert_int(WalletService.gold).is_equal(25)


func test_quest_complete_notice_does_not_inject_gold() -> void:
	NetworkService.backend = FakeNetworkBackend.new()
	NetworkService.match_id = "match-starter-shared"
	NetworkService._connect_match_signals()
	NetworkService.backend.match_state_received.emit(
		MatchProtocol.SERVER_SYSTEM_MESSAGE,
		JSON.stringify({
			"protocolVersion": 1,
			"code": "quest_complete",
			"message": "Quest complete. You received an Iron Sword and 25 gold.",
		})
	)
	assert_int(WalletService.gold).is_equal(0)
	assert_str(WalletService.last_notice).contains("Iron Sword")
	assert_str(AppState.last_error_code).is_equal("")


func test_hud_shows_server_gold_and_notice() -> void:
	WalletService.apply_gold(25)
	WalletService.last_notice = "Quest complete. You received an Iron Sword and 25 gold."
	var hud: WorldHud = auto_free(preload("res://scenes/world/world_hud.tscn").instantiate())
	add_child(hud)
	await get_tree().process_frame
	assert_str(hud.get_node("Root/Inventory/Margin/VBox/Gold").text).is_equal("Gold: 25")
	hud.show_notice(WalletService.last_notice)
	assert_str(hud.get_node("Root/Notice").text).contains("Iron Sword")
	assert_bool(hud.get_node("Root/Notice").visible).is_true()
