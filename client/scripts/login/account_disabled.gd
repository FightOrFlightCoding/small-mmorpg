extends "res://scripts/ui/shell_page.gd"

@onready var _status: Label = $Center/VBox/Status
@onready var _back: Button = $Center/VBox/BackButton


func _ready() -> void:
	super._ready()
	_status.text = AccountErrors.message_for("AUTH_ACCOUNT_DISABLED")
	_back.pressed.connect(func() -> void: SceneRouter.transition_to(SceneRouter.SCENE_LOGIN))
