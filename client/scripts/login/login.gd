extends "res://scripts/ui/shell_page.gd"

const HINT_WIDTH := 640.0

@onready var _hint: Label = $Center/VBox/Hint
@onready var _server_hint: Label = $Center/VBox/ServerHint
@onready var _version: Label = $Center/VBox/VersionLabel
@onready var _email_edit: LineEdit = $Center/VBox/EmailEdit
@onready var _password_edit: LineEdit = $Center/VBox/PasswordRow/PasswordEdit
@onready var _show_password: Button = $Center/VBox/PasswordRow/ShowPasswordButton
@onready var _caps: Label = $Center/VBox/CapsLockLabel
@onready var _remember: CheckBox = $Center/VBox/RememberEmail
@onready var _stay_signed_in: CheckBox = $Center/VBox/StaySignedIn
@onready var _global_error: Label = $Center/VBox/GlobalError
@onready var _login_button: Button = $Center/VBox/LoginButton
@onready var _register_button: Button = $Center/VBox/RegisterButton
@onready var _forgot_password: Button = $Center/VBox/ForgotPasswordButton
@onready var _forgot_email: Button = $Center/VBox/ForgotEmailButton
@onready var _alice_button: Button = $Center/VBox/AliceButton
@onready var _bob_button: Button = $Center/VBox/BobButton
@onready var _sign_in_button: Button = $Center/VBox/SignInButton
@onready var _vbox: VBoxContainer = $Center/VBox

var _caps_on: bool = false
var _busy: bool = false
var _banner: UxStatusBanner
var _form_errors: UxFormErrors
var _rate_label: Label
var _rate_left: int = 0
var _rate_timer: Timer
var _spinner: UxSpinner


func _ready() -> void:
	super._ready()
	_alice_button.pressed.connect(_on_alice_pressed)
	_bob_button.pressed.connect(_on_bob_pressed)
	_sign_in_button.pressed.connect(_on_sign_in_pressed)
	_login_button.pressed.connect(_on_login_pressed)
	_register_button.pressed.connect(_on_register_pressed)
	_forgot_password.pressed.connect(_on_forgot_password)
	_forgot_email.pressed.connect(_on_forgot_email)
	_show_password.pressed.connect(_on_toggle_password)
	_email_edit.text_changed.connect(func(_value: String) -> void: _clear_errors())
	_password_edit.text_changed.connect(_on_password_changed)
	_email_edit.text_submitted.connect(func(_value: String) -> void: _password_edit.grab_focus())
	_password_edit.text_submitted.connect(func(_value: String) -> void: _on_login_pressed())
	WindowManager.open(WindowManager.LOGIN)
	_hint.custom_minimum_size.x = HINT_WIDTH
	_server_hint.custom_minimum_size.x = HINT_WIDTH
	_hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_server_hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	ShellTheme.style_field(_email_edit, "email")
	ShellTheme.style_field(_password_edit, "password")
	ShellTheme.style_primary(_login_button)
	ShellTheme.style_secondary(_register_button)
	ShellTheme.style_secondary(_forgot_password)
	ShellTheme.style_secondary(_forgot_email)
	ShellTheme.style_secondary(_show_password)
	_install_chrome()
	_wire_tab_order()
	_password_edit.secret = true
	_caps.visible = false
	_stay_signed_in.visible = AccountService.stay_signed_in_available()
	_stay_signed_in.button_pressed = false
	_version.visible = OS.is_debug_build()
	_version.text = "Client %s" % AccountService.CLIENT_VERSION
	var dev_allowed := DevIdentity.development_auth_allowed()
	_alice_button.visible = dev_allowed
	_bob_button.visible = dev_allowed
	_sign_in_button.visible = dev_allowed
	var identity := DevIdentity.resolve(OS.get_cmdline_user_args(), OS.get_unique_id())
	GameService.last_identity = identity
	if not dev_allowed:
		_hint.text = "Register or log in with email and password. Development identities are disabled in this build."
	elif not String(identity.get("error", "")).is_empty():
		_hint.text = String(identity.get("warning", "Invalid development user."))
	elif String(identity.get("source", "")) == "dev":
		_hint.text = "Development identity: %s" % String(identity.get("dev_user", ""))
		_sign_in_button.text = "Sign in"
	else:
		_hint.text = "Use email and password, or sign in as Alice in one Play window and Bob in the other."
		_sign_in_button.text = "Sign in with this machine"
	if AccountService.shows_local_operator_hints():
		_server_hint.text = "Auth gateway 127.0.0.1:8787. Nakama must be running at 127.0.0.1:7350 (scripts/backend-up.ps1). Local verification mail is captured at http://127.0.0.1:8025 and is not delivered to Gmail."
	else:
		_server_hint.text = "Sign in with your email and password. If the account service is unavailable, wait and try again."
	if not AppState.content_ready:
		ContentRegistry.load_bundle()
	_email_edit.text = RememberEmailStore.load_email()
	_remember.button_pressed = not _email_edit.text.is_empty()
	_email_edit.grab_focus()
	_refresh_banners()
	if _wants_shell_self_test():
		print("SHELL_LOGIN")
		get_tree().quit(0)
		return
	GameService.try_restore_session()
	if AccountService.auto_probe:
		await AccountService.probe_ready()
		_refresh_banners()
		if not AccountService.gateway_reachable:
			SceneRouter.transition_to(SceneRouter.SCENE_SERVER_UNAVAILABLE)


func _install_chrome() -> void:
	_banner = UxStatusBanner.new()
	_banner.name = "StatusBanner"
	_vbox.add_child(_banner)
	_vbox.move_child(_banner, 1)
	_form_errors = UxFormErrors.new()
	_form_errors.name = "FormErrorSummary"
	_vbox.add_child(_form_errors)
	_vbox.move_child(_form_errors, _global_error.get_index())
	_rate_label = Label.new()
	_rate_label.name = "RateLimitLabel"
	_rate_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_rate_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_rate_label.visible = false
	_vbox.add_child(_rate_label)
	_vbox.move_child(_rate_label, _global_error.get_index() + 1)
	_spinner = UxSpinner.new()
	_spinner.name = "LoginSpinner"
	_spinner.visible = false
	_vbox.add_child(_spinner)
	_vbox.move_child(_spinner, _login_button.get_index())
	_rate_timer = Timer.new()
	_rate_timer.one_shot = false
	_rate_timer.wait_time = 1.0
	_rate_timer.timeout.connect(_on_rate_tick)
	add_child(_rate_timer)


func _wire_tab_order() -> void:
	_email_edit.focus_next = _email_edit.get_path_to(_password_edit)
	_email_edit.focus_neighbor_bottom = _email_edit.get_path_to(_password_edit)
	_password_edit.focus_previous = _password_edit.get_path_to(_email_edit)
	_password_edit.focus_neighbor_top = _password_edit.get_path_to(_email_edit)
	_password_edit.focus_neighbor_right = _password_edit.get_path_to(_show_password)
	_password_edit.focus_neighbor_bottom = _password_edit.get_path_to(_remember)
	_password_edit.focus_next = _password_edit.get_path_to(_show_password)
	_show_password.focus_neighbor_left = _show_password.get_path_to(_password_edit)
	_show_password.focus_next = _show_password.get_path_to(_remember)
	_remember.focus_neighbor_top = _remember.get_path_to(_password_edit)
	_remember.focus_neighbor_bottom = _remember.get_path_to(_login_button)
	_remember.focus_next = _remember.get_path_to(_login_button)
	_login_button.focus_neighbor_top = _login_button.get_path_to(_remember)
	_login_button.focus_neighbor_bottom = _login_button.get_path_to(_register_button)
	_login_button.focus_next = _login_button.get_path_to(_register_button)
	_register_button.focus_neighbor_top = _register_button.get_path_to(_login_button)
	_register_button.focus_neighbor_bottom = _register_button.get_path_to(_forgot_password)
	_register_button.focus_next = _register_button.get_path_to(_forgot_password)
	_forgot_password.focus_neighbor_bottom = _forgot_password.get_path_to(_forgot_email)
	_forgot_password.focus_next = _forgot_password.get_path_to(_forgot_email)


func _refresh_banners() -> void:
	if _banner == null:
		return
	if AppState.server_maintenance:
		_banner.show_message(AccountErrors.message_for("MAINTENANCE_ACTIVE"), UxStatusBanner.Tone.WARNING)
	elif not AccountService.last_email_provider_ok:
		_banner.show_message(AccountErrors.message_for("EMAIL_DELIVERY_DELAYED"), UxStatusBanner.Tone.WARNING)
	elif not AccountService.gateway_reachable:
		_banner.show_message(AccountErrors.message_for("ACCOUNT_SERVER_UNAVAILABLE"), UxStatusBanner.Tone.ERROR)
	else:
		_banner.clear()


func _on_alice_pressed() -> void:
	GameService.enter_world_after_bootstrap = true
	GameService.request_authenticate("", "alice")


func _on_bob_pressed() -> void:
	GameService.enter_world_after_bootstrap = true
	GameService.request_authenticate("", "bob")


func _on_sign_in_pressed() -> void:
	GameService.enter_world_after_bootstrap = false
	GameService.request_authenticate()


func _on_login_pressed() -> void:
	if _busy:
		return
	_clear_errors()
	_set_busy(true)
	if _remember.button_pressed:
		RememberEmailStore.save_email(_email_edit.text)
	else:
		RememberEmailStore.clear()
	GameService.enter_world_after_bootstrap = false
	await GameService.request_login_email(_email_edit.text, _password_edit.text)
	_set_busy(false)
	_apply_login_result()


func _apply_login_result() -> void:
	var code := AccountService.last_code
	_global_error.text = AccountService.last_message
	if code == "AUTH_INVALID_CREDENTIALS" or code == "invalid_credentials":
		_password_edit.text = ""
		_password_edit.grab_focus()
		_form_errors.set_errors(PackedStringArray([AccountErrors.message_for("AUTH_INVALID_CREDENTIALS")]))
	elif AccountErrors.canonicalize(code) == "AUTH_RATE_LIMITED":
		_password_edit.text = ""
		_start_rate_limit(AccountService.last_retry_after_seconds)
	elif AccountErrors.canonicalize(code) == "CLIENT_UPDATE_REQUIRED":
		_banner.show_message(AccountErrors.message_for("CLIENT_UPDATE_REQUIRED"), UxStatusBanner.Tone.ERROR)
	elif AccountErrors.canonicalize(code) == "MAINTENANCE_ACTIVE":
		_banner.show_message(AccountErrors.message_for("MAINTENANCE_ACTIVE"), UxStatusBanner.Tone.WARNING)
	elif not AccountErrors.is_known(code) and not code.is_empty():
		_global_error.text = AccountErrors.display_for(code, AccountService.last_request_id)


func _start_rate_limit(seconds: int) -> void:
	_rate_left = maxi(seconds, 1)
	_login_button.disabled = true
	_rate_label.visible = true
	_rate_label.text = "Too many attempts. Try again in %s seconds." % str(_rate_left)
	_rate_timer.start()


func _on_rate_tick() -> void:
	_rate_left -= 1
	if _rate_left <= 0:
		_rate_timer.stop()
		_rate_label.visible = false
		if not _busy:
			_login_button.disabled = false
		return
	_rate_label.text = "Too many attempts. Try again in %s seconds." % str(_rate_left)


func _on_register_pressed() -> void:
	if _busy:
		return
	SceneRouter.transition_to(SceneRouter.SCENE_REGISTER)


func _on_forgot_password() -> void:
	if _busy:
		return
	SceneRouter.transition_to(SceneRouter.SCENE_FORGOT_PASSWORD)


func _on_forgot_email() -> void:
	if _busy:
		return
	SceneRouter.transition_to(SceneRouter.SCENE_FORGOT_EMAIL)


func _on_toggle_password() -> void:
	_password_edit.secret = not _password_edit.secret
	_show_password.text = "Hide" if not _password_edit.secret else "Show"


func _on_password_changed(value: String) -> void:
	_clear_errors()
	var shift := Input.is_key_pressed(KEY_SHIFT)
	var last := value.substr(value.length() - 1, 1) if value.length() > 0 else ""
	_caps_on = last.length() > 0 and last.to_upper() == last and last.to_lower() != last and not shift
	_caps.visible = _caps_on
	_caps.text = "Caps Lock may be on."


func _clear_errors() -> void:
	_global_error.text = ""
	if _form_errors != null:
		_form_errors.clear()


func _set_busy(busy: bool) -> void:
	_busy = busy
	_login_button.disabled = busy or _rate_left > 0
	_register_button.disabled = busy
	_forgot_password.disabled = busy
	_forgot_email.disabled = busy
	_alice_button.disabled = busy
	_bob_button.disabled = busy
	_sign_in_button.disabled = busy
	if _spinner != null:
		_spinner.set_active(busy)
	_login_button.text = "Signing in…" if busy else "Log in"
