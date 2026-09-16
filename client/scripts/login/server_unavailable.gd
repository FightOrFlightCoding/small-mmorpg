extends "res://scripts/ui/shell_page.gd"

@onready var _status: Label = $Center/VBox/Status
@onready var _retry: Button = $Center/VBox/RetryButton
@onready var _back: Button = $Center/VBox/BackButton


func _ready() -> void:
	super._ready()
	_status.text = "The account service is unavailable. Nakama and the auth gateway must both be running."
	_retry.pressed.connect(_on_retry)
	_back.pressed.connect(func() -> void: SceneRouter.transition_to(SceneRouter.SCENE_LOGIN))


func _on_retry() -> void:
	_retry.disabled = true
	var ok := await AccountService.probe_ready()
	_retry.disabled = false
	if ok:
		SceneRouter.transition_to(SceneRouter.SCENE_LOGIN)
	else:
		AppState.report_recoverable("AUTH_UNAVAILABLE", AccountErrors.message_for("AUTH_UNAVAILABLE"))
