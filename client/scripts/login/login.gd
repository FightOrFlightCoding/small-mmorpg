extends "res://scripts/ui/shell_page.gd"

const HINT_WIDTH := 640.0

@onready var _hint: Label = $Center/VBox/Hint
@onready var _server_hint: Label = $Center/VBox/ServerHint
@onready var _alice_button: Button = $Center/VBox/AliceButton
@onready var _bob_button: Button = $Center/VBox/BobButton
@onready var _sign_in_button: Button = $Center/VBox/SignInButton


func _ready() -> void:
	super._ready()
	_alice_button.pressed.connect(_on_alice_pressed)
	_bob_button.pressed.connect(_on_bob_pressed)
	_sign_in_button.pressed.connect(_on_sign_in_pressed)
	_hint.custom_minimum_size.x = HINT_WIDTH
	_server_hint.custom_minimum_size.x = HINT_WIDTH
	_hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_server_hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	var identity := DevIdentity.resolve(OS.get_cmdline_user_args(), OS.get_unique_id())
	GameService.last_identity = identity
	if not String(identity.get("error", "")).is_empty():
		_hint.text = String(identity.get("warning", "Invalid development user."))
	elif String(identity.get("source", "")) == "dev":
		_hint.text = "Development identity: %s" % String(identity.get("dev_user", ""))
		_sign_in_button.text = "Sign in"
	else:
		_hint.text = String(identity.get("warning", "This client will use a local device identity."))
		_sign_in_button.text = "Sign in with this machine"
	_server_hint.text = "Requires local Nakama at 127.0.0.1:7350 (scripts/backend-up.ps1). Then sign in as Alice or Bob and press Continue on the character screen."
	if _wants_shell_self_test():
		print("SHELL_LOGIN")
		get_tree().quit(0)


func _on_alice_pressed() -> void:
	GameService.request_authenticate("", "alice")


func _on_bob_pressed() -> void:
	GameService.request_authenticate("", "bob")


func _on_sign_in_pressed() -> void:
	GameService.request_authenticate()
