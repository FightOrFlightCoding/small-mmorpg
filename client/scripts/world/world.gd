extends "res://scripts/ui/shell_page.gd"

@onready var _status: Label = $Center/VBox/Status
@onready var _logout_button: Button = $Center/VBox/LogoutButton


func _ready() -> void:
	super._ready()
	_logout_button.pressed.connect(_on_logout_pressed)
	var name := String(AppState.character_view.get("name", ""))
	if name.is_empty():
		_status.text = "World screen. The starter-zone match is not available in this build."
	else:
		_status.text = "%s is ready. The starter-zone match is not available in this build." % name


func _on_logout_pressed() -> void:
	GameService.request_logout()
