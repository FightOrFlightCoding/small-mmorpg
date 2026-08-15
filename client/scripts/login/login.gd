extends "res://scripts/ui/shell_page.gd"

@onready var _hint: Label = $Center/VBox/Hint
@onready var _sign_in_button: Button = $Center/VBox/SignInButton


func _ready() -> void:
	super._ready()
	_sign_in_button.pressed.connect(_on_sign_in_pressed)
	var identity := DevIdentity.resolve(OS.get_cmdline_user_args(), OS.get_unique_id())
	GameService.last_identity = identity
	if not String(identity.get("error", "")).is_empty():
		_hint.text = String(identity.get("warning", "Invalid development user."))
	elif String(identity.get("source", "")) == "dev":
		_hint.text = "Development identity: %s" % String(identity.get("dev_user", ""))
	else:
		_hint.text = String(identity.get("warning", "This client will use a local device identity."))
	if _wants_shell_self_test():
		print("SHELL_LOGIN")
		get_tree().quit(0)


func _on_sign_in_pressed() -> void:
	GameService.request_authenticate()
