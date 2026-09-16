extends "res://scripts/ui/shell_page.gd"

@onready var _current: LineEdit = $Center/VBox/CurrentRow/PasswordEdit
@onready var _show_current: Button = $Center/VBox/CurrentRow/ShowPasswordButton
@onready var _password_edit: LineEdit = $Center/VBox/PasswordRow/PasswordEdit
@onready var _show_password: Button = $Center/VBox/PasswordRow/ShowPasswordButton
@onready var _confirm_edit: LineEdit = $Center/VBox/ConfirmRow/ConfirmEdit
@onready var _show_confirm: Button = $Center/VBox/ConfirmRow/ShowConfirmButton
@onready var _status: Label = $Center/VBox/StatusLabel
@onready var _submit: Button = $Center/VBox/SubmitButton
@onready var _back: Button = $Center/VBox/BackButton

var _busy: bool = false


func _ready() -> void:
	super._ready()
	WindowManager.open(WindowManager.CHANGE_PASSWORD)
	_current.secret = true
	_password_edit.secret = true
	_confirm_edit.secret = true
	_submit.pressed.connect(_on_submit)
	_back.pressed.connect(func() -> void: SceneRouter.transition_to(SceneRouter.SCENE_CHARACTER))
	_show_current.pressed.connect(func() -> void: _toggle(_current, _show_current))
	_show_password.pressed.connect(func() -> void: _toggle(_password_edit, _show_password))
	_show_confirm.pressed.connect(func() -> void: _toggle(_confirm_edit, _show_confirm))
	_current.grab_focus()


func _toggle(edit: LineEdit, button: Button) -> void:
	edit.secret = not edit.secret
	button.text = "Hide" if not edit.secret else "Show"


func _on_submit() -> void:
	if _busy:
		return
	_busy = true
	_submit.disabled = true
	await GameService.request_change_password(_current.text, _password_edit.text, _confirm_edit.text)
	_status.text = AccountService.last_message
	_busy = false
	_submit.disabled = false
