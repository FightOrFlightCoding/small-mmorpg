extends GdUnitTestSuite

## Login errors must not reveal whether an email is registered.


func test_login_does_not_leak_existing_accounts() -> void:
	var unknown: Dictionary = AuthPrivacy.sanitize_auth_failure(false, "user not found")
	var exists: Dictionary = AuthPrivacy.sanitize_auth_failure(false, "user already exists")
	var invalid: Dictionary = AuthPrivacy.sanitize_auth_failure(false, "invalid credentials")
	assert_str(String(unknown.get("code", ""))).is_equal("invalid_credentials")
	assert_str(String(exists.get("code", ""))).is_equal("invalid_credentials")
	assert_str(String(invalid.get("code", ""))).is_equal("invalid_credentials")
	assert_str(String(unknown.get("message", ""))).is_equal(String(exists.get("message", "")))


func test_registration_still_reports_email_taken() -> void:
	var taken: Dictionary = AuthPrivacy.sanitize_auth_failure(true, "already in use")
	assert_str(String(taken.get("code", ""))).is_equal("email_taken")
