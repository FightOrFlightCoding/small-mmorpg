extends "res://scripts/ui/shell_page.gd"

@onready var _status: Label = $Center/VBox/StatusLabel
@onready var _login: Button = $Center/VBox/LoginButton


func _ready() -> void:
	super._ready()
	WindowManager.open(WindowManager.PASSWORD_CHANGED)
	_status.text = "Your password was changed. Sign in with the new password. All other sessions were signed out."
	_login.pressed.connect(func() -> void: SceneRouter.transition_to(SceneRouter.SCENE_LOGIN))
