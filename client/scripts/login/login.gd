extends "res://scripts/ui/shell_page.gd"

@onready var _sign_in_button: Button = $Center/VBox/SignInButton


func _ready() -> void:
	super._ready()
	_sign_in_button.pressed.connect(_on_sign_in_pressed)
	if _wants_shell_self_test():
		print("SHELL_LOGIN")
		get_tree().quit(0)


func _on_sign_in_pressed() -> void:
	GameService.request_authenticate()
