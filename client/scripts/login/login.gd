extends "res://scripts/ui/shell_page.gd"

const HINT_WIDTH := 640.0

@onready var _hint: Label = $Center/VBox/Hint
@onready var _server_hint: Label = $Center/VBox/ServerHint
@onready var _email_edit: LineEdit = $Center/VBox/EmailEdit
@onready var _password_edit: LineEdit = $Center/VBox/PasswordEdit
@onready var _confirm_edit: LineEdit = $Center/VBox/ConfirmEdit
@onready var _login_button: Button = $Center/VBox/LoginButton
@onready var _register_button: Button = $Center/VBox/RegisterButton
@onready var _alice_button: Button = $Center/VBox/AliceButton
@onready var _bob_button: Button = $Center/VBox/BobButton
@onready var _sign_in_button: Button = $Center/VBox/SignInButton


func _ready() -> void:
	super._ready()
	_alice_button.pressed.connect(_on_alice_pressed)
	_bob_button.pressed.connect(_on_bob_pressed)
	_sign_in_button.pressed.connect(_on_sign_in_pressed)
	_login_button.pressed.connect(_on_login_pressed)
	_register_button.pressed.connect(_on_register_pressed)
	WindowManager.open(WindowManager.LOGIN)
	WindowManager.open(WindowManager.REGISTER)
	_hint.custom_minimum_size.x = HINT_WIDTH
	_server_hint.custom_minimum_size.x = HINT_WIDTH
	_hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_server_hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_password_edit.secret = true
	_confirm_edit.secret = true
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
	_server_hint.text = "Nakama must be running at 127.0.0.1:7350 (scripts/backend-up.ps1). Password recovery is administrator-assisted for this private release."
	if not AppState.content_ready:
		ContentRegistry.load_bundle()
	_email_edit.grab_focus()
	if _wants_shell_self_test():
		print("SHELL_LOGIN")
		get_tree().quit(0)
		return
	GameService.try_restore_session()


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
	GameService.enter_world_after_bootstrap = false
	GameService.request_login_email(_email_edit.text, _password_edit.text)


func _on_register_pressed() -> void:
	GameService.enter_world_after_bootstrap = false
	GameService.request_register(_email_edit.text, _password_edit.text, _confirm_edit.text)
