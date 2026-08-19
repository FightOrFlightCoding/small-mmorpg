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

var _caps_on: bool = false


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
	WindowManager.open(WindowManager.LOGIN)
	_hint.custom_minimum_size.x = HINT_WIDTH
	_server_hint.custom_minimum_size.x = HINT_WIDTH
	_hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_server_hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_password_edit.secret = true
	_caps.visible = false
	_stay_signed_in.visible = AccountService.stay_signed_in_available()
	_stay_signed_in.button_pressed = false
	_version.text = "Version %s" % AccountService.CLIENT_VERSION
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
	_server_hint.text = "Auth gateway 127.0.0.1:8787. Nakama must be running at 127.0.0.1:7350 (scripts/backend-up.ps1)."
	if not AppState.content_ready:
		ContentRegistry.load_bundle()
	_email_edit.text = RememberEmailStore.load_email()
	_remember.button_pressed = not _email_edit.text.is_empty()
	_email_edit.grab_focus()
	if _wants_shell_self_test():
		print("SHELL_LOGIN")
		get_tree().quit(0)
		return
	GameService.try_restore_session()
	if AccountService.auto_probe:
		await AccountService.probe_ready()
		if not AccountService.gateway_reachable:
			SceneRouter.transition_to(SceneRouter.SCENE_SERVER_UNAVAILABLE)


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
	_clear_errors()
	_set_busy(true)
	if _remember.button_pressed:
		RememberEmailStore.save_email(_email_edit.text)
	else:
		RememberEmailStore.clear()
	GameService.enter_world_after_bootstrap = false
	await GameService.request_login_email(_email_edit.text, _password_edit.text)
	_set_busy(false)
	_global_error.text = AccountService.last_message


func _on_register_pressed() -> void:
	SceneRouter.transition_to(SceneRouter.SCENE_REGISTER)


func _on_forgot_password() -> void:
	SceneRouter.transition_to(SceneRouter.SCENE_FORGOT_PASSWORD)


func _on_forgot_email() -> void:
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


func _set_busy(busy: bool) -> void:
	_login_button.disabled = busy
	_register_button.disabled = busy
	_forgot_password.disabled = busy
	_forgot_email.disabled = busy
