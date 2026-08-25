extends GdUnitTestSuite

## ACCT-09 release-build presentation: no development auth, Mailpit, or local operator URLs.


func before_test() -> void:
	DevIdentity.force_release_config = false
	AccountService.reset_for_tests()


func after_test() -> void:
	DevIdentity.force_release_config = false
	AccountService.reset_for_tests()


func test_release_hides_development_auth_and_local_operator_urls() -> void:
	DevIdentity.force_release_config = true
	AccountService.gateway_url = AccountService.DEFAULT_GATEWAY_URL
	assert_bool(DevIdentity.development_auth_allowed()).is_false()
	assert_bool(AccountService.shows_local_operator_hints()).is_false()
	assert_bool(AccountService.local_mail_capture_copy().contains("Mailpit")).is_false()
	assert_bool(AccountService.local_mail_capture_copy().contains("8025")).is_false()
	var page: Control = auto_free(preload("res://scenes/login/login.tscn").instantiate())
	add_child(page)
	await await_idle_frame()
	assert_bool(page.get_node("Center/VBox/AliceButton").visible).is_false()
	assert_bool(page.get_node("Center/VBox/BobButton").visible).is_false()
	assert_bool(page.get_node("Center/VBox/SignInButton").visible).is_false()
	var hint: String = String(page.get_node("Center/VBox/ServerHint").text)
	assert_bool(hint.contains("8025")).is_false()
	assert_bool(hint.contains("Mailpit")).is_false()
	assert_bool(hint.contains("127.0.0.1:8787")).is_false()
	var register_page: Control = auto_free(preload("res://scenes/login/register.tscn").instantiate())
	add_child(register_page)
	await await_idle_frame()
	assert_bool(String(register_page.get_node("Center/VBox/MailHint").text).contains("Mailpit")).is_false()
	assert_bool(String(register_page.get_node("Center/VBox/MailHint").text).contains("8025")).is_false()
	var verify_page: Control = auto_free(preload("res://scenes/login/verify.tscn").instantiate())
	add_child(verify_page)
	await await_idle_frame()
	assert_bool(String(verify_page.get_node("Center/VBox/DeliveryDelay").text).contains("Mailpit")).is_false()
	assert_bool(String(verify_page.get_node("Center/VBox/DeliveryDelay").text).contains("8025")).is_false()
	assert_bool(verify_page.get_node("Center/VBox/InboxButton").visible).is_false()


func test_gateway_url_override_from_args() -> void:
	AccountService.apply_runtime_gateway_url(PackedStringArray(["--gateway-url=https://auth.example/v1"]))
	assert_str(AccountService.gateway_url).is_equal("https://auth.example/v1")
	assert_bool(AccountService.uses_local_mail_capture()).is_false()


func test_debug_local_gateway_does_not_mention_mailpit() -> void:
	DevIdentity.force_release_config = false
	AccountService.gateway_url = AccountService.DEFAULT_GATEWAY_URL
	assert_bool(AccountService.shows_local_operator_hints()).is_true()
	assert_bool(AccountService.inbox_delivery_copy().contains("Mailpit")).is_false()
	assert_bool(AccountService.inbox_delivery_copy().contains("8025")).is_false()
