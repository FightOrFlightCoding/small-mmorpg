extends GdUnitTestSuite

## GmService sends the server RPC and never grants locally.


func before_test() -> void:
	SceneRouter.reset_for_tests()
	AppState.reset_for_tests()
	NetworkService.reset_for_tests()
	GmService.reset_for_tests()
	WalletService.reset_for_tests()
	AppState.character_view = {"character_id": "char-a", "name": "Alice"}


func _fake() -> FakeNetworkBackend:
	var fake := FakeNetworkBackend.new()
	NetworkService.backend = fake
	return fake


func test_gm_command_is_an_rpc_intention() -> void:
	var fake := _fake()
	fake.rpc_payload = JSON.stringify({
		"ok": true,
		"code": "ok",
		"command": "inspect_character",
		"characterId": "char-a",
		"result": {"x": 240},
	})
	WalletService.gold = 12
	GmService.run_command("inspect_character", "lab inspect")
	await get_tree().process_frame
	assert_str(fake.last_rpc_id).is_equal("gm_command")
	assert_str(fake.last_rpc_payload).contains("inspect_character")
	assert_str(fake.last_rpc_payload).contains("lab inspect")
	assert_str(fake.last_rpc_payload).contains("characterId")
	assert_str(fake.last_rpc_payload).contains("requestId")
	assert_int(WalletService.gold).is_equal(12)
	assert_str(GmService.last_code).is_equal("ok")


func test_debug_panel_flag_does_not_grant_authority() -> void:
	assert_bool(GmService.is_debug_panel_allowed()).is_equal(OS.is_debug_build())
	WalletService.gold = 3
	GmService.run_command("grant_test_gold", "should not mutate locally", {"amount": 99})
	await get_tree().process_frame
	assert_int(WalletService.gold).is_equal(3)
