extends "res://scripts/ui/shell_page.gd"

@onready var _status: Label = $Center/VBox/StatusLabel
@onready var _login: Button = $Center/VBox/LoginButton


func _ready() -> void:
	super._ready()
	WindowManager.open(WindowManager.ACCOUNT_DELETED)
	_status.text = "This account was permanently deleted. Characters, items, gold, quests, and settings cannot be restored. You may register again with the same email as a new blank account."
	_login.pressed.connect(func() -> void: SceneRouter.transition_to(SceneRouter.SCENE_LOGIN))
