extends GdUnitTestSuite

## ACCT-08 shell UX: catalog, navigation, loading, cards, and accessibility helpers.


func before_test() -> void:
	SceneRouter.reset_for_tests()
	AppState.reset_for_tests()
	NetworkService.reset_for_tests()
	AccountService.reset_for_tests()
	AccountService.backend = FakeAccountBackend.new()
	WindowManager.reset_for_tests()
	NotificationService.reset_for_tests()
	GameService.last_identity = {}
	GameService.enter_world_after_bootstrap = false
	assert_bool(ContentRegistry.load_bundle()).is_true()
	ContentRegistry.visuals.load_map()
	ContentRegistry.assets.load_manifest()


func after_test() -> void:
	WindowManager.reset_for_tests()
	RememberEmailStore.clear()


func test_unknown_error_mapping_uses_request_id() -> void:
	assert_str(AccountErrors.message_for("AUTH_INVALID_CREDENTIALS")).is_equal("Email or password is incorrect.")
	assert_str(AccountErrors.message_for("CHARACTER_SLOTS_FULL")).contains("five")
	assert_str(AccountErrors.display_for("AUTH_RATE_LIMITED")).is_equal(AccountErrors.message_for("AUTH_RATE_LIMITED"))
	var unknown := AccountErrors.display_for("SOME_INTERNAL_PANIC", "req-123")
	assert_str(unknown).contains("Something went wrong.")
	assert_str(unknown).contains("Reference: req-123")
	assert_bool(unknown.contains("PANIC")).is_false()
	assert_bool(AccountErrors.display_for("nope", "").contains("Something went wrong.")).is_true()


func test_code_formatter_and_email_mask() -> void:
	assert_str(CodeFormatter.normalize("ab c-12")).is_equal("ABC12")
	assert_str(CodeFormatter.grouped("abcdef")).is_equal("ABC DEF")
	assert_str(EmailMask.mask("player@example.com")).is_equal("p***@example.com")
	assert_str(EmailMask.mask("")).is_equal("")
	assert_bool(bool(EmailSyntax.guidance("not-an-email").get("ok", true))).is_false()
	assert_bool(bool(EmailSyntax.guidance("name@example.com").get("ok", false))).is_true()


func test_class_cards_are_distinguishable_without_color_only() -> void:
	assert_str(String(ClassPresentation.for_id("class.warrior").get("shape", ""))).contains("Sword")
	assert_str(String(ClassPresentation.for_id("class.marksman").get("shape", ""))).contains("Bow")
	assert_str(String(ClassPresentation.for_id("class.mage").get("shape", ""))).contains("Staff")
	assert_str(ClassPresentation.selected_summary("class.warrior")).contains("Close-range")


func test_login_tab_order_and_double_submit() -> void:
	var page: Control = auto_free(preload("res://scenes/login/login.tscn").instantiate())
	add_child(page)
	await await_idle_frame()
	var email: LineEdit = page.get_node("Center/VBox/EmailEdit")
	var password: LineEdit = page.get_node("Center/VBox/PasswordRow/PasswordEdit")
	assert_str(str(email.focus_neighbor_bottom)).is_not_equal("")
	assert_object(email.get_node(email.focus_next)).is_equal(password)
	assert_int(email.focus_mode).is_equal(Control.FOCUS_ALL)
	email.text = "keep@example.com"
	password.text = "wrong-password-15"
	(AccountService.backend as FakeAccountBackend).login_ok = false
	page.set("_busy", true)
	var before := (AccountService.backend as FakeAccountBackend).login_calls
	await page._on_login_pressed()
	assert_int((AccountService.backend as FakeAccountBackend).login_calls).is_equal(before)
	page.set("_busy", false)
	await page._on_login_pressed()
	assert_str(email.text).is_equal("keep@example.com")
	assert_str(password.text).is_equal("")
	var login_button: Button = page.get_node("Center/VBox/LoginButton")
	page.call("_set_busy", true)
	assert_bool(login_button.disabled).is_true()
	assert_str(login_button.text).contains("Signing")


func test_back_navigation_does_not_skip_verification() -> void:
	assert_bool(GameService.start_boot()).is_true()
	assert_bool(SceneRouter.transition_to(SceneRouter.SCENE_REGISTER)).is_true()
	assert_bool(SceneRouter.go_back()).is_true()
	assert_str(SceneRouter.current_scene_id).is_equal(SceneRouter.SCENE_LOGIN)
	assert_bool(SceneRouter.transition_to(SceneRouter.SCENE_VERIFY)).is_true()
	AppState.notify_authenticated("user-alice", "alice")
	assert_bool(SceneRouter.go_back()).is_true()
	assert_str(SceneRouter.current_scene_id).is_equal(SceneRouter.SCENE_LOGIN)
	assert_str(SceneRouter.current_scene_id).is_not_equal(SceneRouter.SCENE_CHARACTER)


func test_session_expired_and_verification_transitions() -> void:
	assert_bool(GameService.start_boot()).is_true()
	await GameService.request_register("pending@example.com", "secret-pass-15x", "secret-pass-15x")
	assert_str(SceneRouter.current_scene_id).is_equal(SceneRouter.SCENE_VERIFY)
	await GameService.request_login_email("pending@example.com", "secret-pass-15x")
	assert_str(SceneRouter.current_scene_id).is_equal(SceneRouter.SCENE_VERIFY)
	assert_str(AppState.last_error_code).is_equal("EMAIL_VERIFICATION_REQUIRED")
	assert_str(AccountErrors.message_for("AUTH_SESSION_EXPIRED")).contains("Sign in again")


func test_five_character_cards_and_full_slot_state() -> void:
	NetworkService.backend = FakeNetworkBackend.new()
	AppState.is_authenticated = true
	var scene: Node = auto_free(preload("res://scenes/character/character.tscn").instantiate())
	add_child(scene)
	await await_idle_frame()
	await await_idle_frame()
	var rows: Array = []
	for i in 5:
		rows.append({
			"characterId": "char-%s" % str(i),
			"displayName": "Hero%s" % str(i),
			"name": "Hero%s" % str(i),
			"classId": "class.warrior" if i % 3 == 0 else ("class.marksman" if i % 3 == 1 else "class.mage"),
			"level": 1,
			"status": "ACTIVE",
			"activePresenceState": "OFFLINE",
		})
	AppState.notify_character_list(rows, 5, 5, int(Time.get_unix_time_from_system() * 1000.0))
	NetworkService.character_list_finished.emit(true, "")
	await await_idle_frame()
	await await_idle_frame()
	var slot_row: Node = scene.get_node("Root/VBox/SelectPanel/SlotRow")
	assert_int(slot_row.get_child_count()).is_equal(5)
	assert_bool((scene.get_node("Root/VBox/SelectPanel/NavRow/CreateButton") as Button).disabled).is_true()
	var play_count := 0
	for card in slot_row.get_children():
		for box in card.get_children():
			for child in box.get_children():
				if child is Button and String((child as Button).text) == "Play":
					play_count += 1
	assert_int(play_count).is_equal(5)


func test_soft_delete_restore_and_full_slot_error() -> void:
	NetworkService.backend = FakeNetworkBackend.new()
	AppState.is_authenticated = true
	var scene: Node = auto_free(preload("res://scenes/character/character.tscn").instantiate())
	add_child(scene)
	await await_idle_frame()
	var live: Array = []
	for i in 5:
		live.append({
			"characterId": "live-%s" % str(i),
			"displayName": "Live%s" % str(i),
			"name": "Live%s" % str(i),
			"classId": "class.warrior",
			"level": 1,
			"status": "ACTIVE",
		})
	live.append({
		"characterId": "gone-1",
		"displayName": "Archived",
		"name": "Archived",
		"classId": "class.mage",
		"level": 2,
		"status": "SOFT_DELETED",
		"deletedAt": 1,
		"softDeleteExpiresAt": int(Time.get_unix_time_from_system() * 1000.0) + 86400000,
	})
	AppState.notify_character_list(live, 5, 5, int(Time.get_unix_time_from_system() * 1000.0))
	NetworkService.character_list_finished.emit(true, "")
	await await_idle_frame()
	await await_idle_frame()
	scene.call("_show_deleted")
	await await_idle_frame()
	var deleted: Node = scene.get_node("Root/VBox/DeletedPanel/DeletedList")
	assert_int(deleted.get_child_count()).is_greater_equal(1)
	var found_full := false
	var found_restore := false
	for card in deleted.get_children():
		for child in card.get_children():
			if child is Button and String((child as Button).text) == "Restore":
				found_restore = true
				assert_bool((child as Button).disabled).is_true()
			if child is Label and String((child as Label).text).contains("five"):
				found_full = true
	assert_bool(found_restore).is_true()
	assert_bool(found_full).is_true()


func test_link_dead_countdown_copy() -> void:
	NetworkService.backend = FakeNetworkBackend.new()
	AppState.is_authenticated = true
	var now_ms := int(Time.get_unix_time_from_system() * 1000.0)
	var scene: Node = auto_free(preload("res://scenes/character/character.tscn").instantiate())
	add_child(scene)
	await await_idle_frame()
	AppState.notify_character_list([
		{
			"characterId": "char-live",
			"displayName": "Scout",
			"name": "Scout",
			"classId": "class.warrior",
			"level": 1,
			"status": "ACTIVE",
			"playBlockedReason": "link_dead",
			"playAvailableAt": now_ms + 8000,
			"activePresenceState": "LINK_DEAD",
		},
	], 5, 1, now_ms)
	NetworkService.character_list_finished.emit(true, "")
	await await_idle_frame()
	await await_idle_frame()
	var slot_row: Node = scene.get_node("Root/VBox/SelectPanel/SlotRow")
	var saw := false
	for card in slot_row.get_children():
		for box in card.get_children():
			for child in box.get_children():
				if child is Label:
					var text := String((child as Label).text)
					if text.contains("Character still in world") and text.contains("Available in"):
						saw = true
				if child is Button and String((child as Button).text) == "Play":
					assert_bool((child as Button).disabled).is_true()
	assert_bool(saw).is_true()


func test_account_deletion_confirmation_is_click_only() -> void:
	var page: Control = auto_free(preload("res://scenes/login/account_delete.tscn").instantiate())
	add_child(page)
	await await_idle_frame()
	var confirm: Button = page.get_node("Center/VBox/ConfirmButton")
	assert_int(confirm.focus_mode).is_equal(Control.FOCUS_CLICK)
	assert_str(confirm.theme_type_variation).is_equal("DestructiveButton")


func test_server_unavailable_and_email_delayed_states() -> void:
	var unavailable: Control = auto_free(preload("res://scenes/login/server_unavailable.tscn").instantiate())
	add_child(unavailable)
	await await_idle_frame()
	assert_str(String(unavailable.get_node("Center/VBox/Status").text)).contains("unavailable")
	AccountService.last_email_provider_ok = false
	AccountService.pending_email = "player@example.com"
	var verify: Control = auto_free(preload("res://scenes/login/verify.tscn").instantiate())
	add_child(verify)
	await await_idle_frame()
	var saw_delay := false
	for node in verify.find_children("*", "Label", true, false):
		if String((node as Label).text).to_lower().contains("delayed") or String((node as Label).text).to_lower().contains("unavailable"):
			saw_delay = true
	assert_bool(saw_delay).is_true()
	assert_str(String(verify.get_node("Center/VBox/Explanation").text)).contains("p***@example.com")


func test_no_duplicate_signal_connections() -> void:
	var hits: Array[int] = [0]
	var cb := func(_code: String, _message: String) -> void:
		hits[0] = hits[0] + 1
	WindowManager.connect_once(AppState.recoverable_error, cb)
	WindowManager.connect_once(AppState.recoverable_error, cb)
	AppState.report_recoverable("AUTH_INVALID_CREDENTIALS", "ignored-internal")
	assert_int(hits[0]).is_equal(1)
	if AppState.recoverable_error.is_connected(cb):
		AppState.recoverable_error.disconnect(cb)


func test_ux_components_have_focus_and_variants() -> void:
	var primary := UxButton.new()
	primary.configure(UxButton.Kind.PRIMARY, "Go")
	auto_free(primary)
	add_child(primary)
	await await_idle_frame()
	assert_str(primary.theme_type_variation).is_equal("PrimaryButton")
	assert_int(primary.focus_mode).is_equal(Control.FOCUS_ALL)
	var destructive := UxButton.new()
	destructive.configure(UxButton.Kind.DESTRUCTIVE, "Delete", true)
	auto_free(destructive)
	add_child(destructive)
	await await_idle_frame()
	assert_int(destructive.focus_mode).is_equal(Control.FOCUS_CLICK)
	var field := UxField.new()
	auto_free(field)
	add_child(field)
	field.configure(UxField.Kind.CODE, "Code")
	await await_idle_frame()
	field.edit.text = "abc123"
	CodeFormatter.apply_to_edit(field.edit)
	assert_str(field.get_value()).is_equal("ABC123")
