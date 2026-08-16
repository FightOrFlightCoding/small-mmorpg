extends GdUnitTestSuite

## Development device identities are deterministic and valid Nakama device ids.


func test_alice_and_bob_are_distinct_valid_device_ids() -> void:
	var alice := DevIdentity.device_id_for_dev_user("alice")
	var bob := DevIdentity.device_id_for_dev_user("bob")
	assert_str(alice).is_equal("vibecode-dev-alice")
	assert_str(bob).is_equal("vibecode-dev-bob")
	assert_bool(alice == bob).is_false()
	assert_bool(DevIdentity.is_valid_device_id(alice)).is_true()
	assert_bool(DevIdentity.is_valid_device_id(bob)).is_true()


func test_dev_user_argument_is_parsed() -> void:
	var args := PackedStringArray(["--quit-after-login", "--dev-user=alice"])
	assert_str(DevIdentity.parse_dev_user(args)).is_equal("alice")
	var identity := DevIdentity.resolve(args, "ignored")
	assert_str(identity["device_id"]).is_equal("vibecode-dev-alice")
	assert_str(identity["source"]).is_equal("dev")
	assert_str(identity["display_name"]).is_equal("Alice")
	assert_str(identity["error"]).is_equal("")


func test_invalid_dev_user_is_rejected() -> void:
	var identity := DevIdentity.resolve(PackedStringArray(["--dev-user=Alice!"]), "machine")
	assert_str(identity["error"]).is_equal("invalid_dev_user")
	assert_bool(String(identity["warning"]).is_empty()).is_false()


func test_machine_identity_documents_limitations() -> void:
	var identity := DevIdentity.resolve(PackedStringArray(), "ABC-123-UNIQUE")
	assert_str(identity["source"]).is_equal("machine")
	assert_str(identity["device_id"]).starts_with("vibecode-local-")
	assert_bool(DevIdentity.is_valid_device_id(String(identity["device_id"]))).is_true()
	assert_bool(String(identity["warning"]).contains("production")).is_true()


func test_missing_unique_id_uses_shared_fallback() -> void:
	var identity := DevIdentity.resolve(PackedStringArray(), "")
	assert_str(identity["source"]).is_equal("shared")
	assert_str(identity["device_id"]).is_equal("vibecode-local-shared")
	assert_bool(DevIdentity.is_valid_device_id(String(identity["device_id"]))).is_true()
	assert_bool(String(identity["warning"]).is_empty()).is_false()


func test_release_config_blocks_development_auth() -> void:
	DevIdentity.force_release_config = true
	assert_bool(DevIdentity.development_auth_allowed()).is_false()
	DevIdentity.force_release_config = false
	assert_bool(DevIdentity.development_auth_allowed()).is_equal(OS.is_debug_build())
