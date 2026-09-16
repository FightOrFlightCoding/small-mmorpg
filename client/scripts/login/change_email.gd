extends "res://scripts/ui/shell_page.gd"

@onready var _current: LineEdit = $Center/VBox/CurrentRow/PasswordEdit
@onready var _show_current: Button = $Center/VBox/CurrentRow/ShowPasswordButton
@onready var _email_edit: LineEdit = $Center/VBox/EmailEdit
@onready var _status: Label = $Center/VBox/StatusLabel
@onready var _submit: Button = $Center/VBox/SubmitButton
@onready var _back: Button = $Center/VBox/BackButton

var _busy: bool = false
var _cooldown: EmailCodeCooldown


func _ready() -> void:
	super._ready()
	WindowManager.open(WindowManager.CHANGE_EMAIL)
	_current.secret = true
	_submit.pressed.connect(_on_submit)
	_back.pressed.connect(func() -> void: SceneRouter.transition_to(SceneRouter.SCENE_CHARACTER))
	_show_current.pressed.connect(func() -> void: _toggle(_current, _show_current))
	_cooldown = EmailCodeCooldown.new()
	add_child(_cooldown)
	_cooldown.add_button(_submit, "Send confirmation")
	_cooldown.resume_after_send(false)
	_current.grab_focus()


func _toggle(edit: LineEdit, button: Button) -> void:
	edit.secret = not edit.secret
	button.text = "Hide" if not edit.secret else "Show"


func _on_submit() -> void:
	if _cooldown.is_blocking():
		return
	_busy = true
	_cooldown.set_busy(true)
	await GameService.request_email_change(_current.text, _email_edit.text)
	if not is_inside_tree():
		return
	_status.text = AccountService.last_message
	_busy = false
	_cooldown.set_busy(false)
	_cooldown.apply()
