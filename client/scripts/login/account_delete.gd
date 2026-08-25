extends "res://scripts/ui/shell_page.gd"

const CONFIRM_PHRASE := "DELETE ACCOUNT"

@onready var _password: LineEdit = $Center/VBox/PasswordRow/PasswordEdit
@onready var _show_password: Button = $Center/VBox/PasswordRow/ShowPasswordButton
@onready var _send_code: Button = $Center/VBox/SendCodeButton
@onready var _code: LineEdit = $Center/VBox/CodeEdit
@onready var _phrase: LineEdit = $Center/VBox/PhraseEdit
@onready var _status: Label = $Center/VBox/StatusLabel
@onready var _confirm: Button = $Center/VBox/ConfirmButton
@onready var _back: Button = $Center/VBox/BackButton

var _busy: bool = false


func _ready() -> void:
	super._ready()
	WindowManager.open(WindowManager.ACCOUNT_DELETE)
	_password.secret = true
	_confirm.focus_mode = Control.FOCUS_CLICK
	_confirm.disabled = true
	_send_code.pressed.connect(_on_send_code)
	_confirm.pressed.connect(_on_confirm)
	_back.pressed.connect(func() -> void: SceneRouter.transition_to(SceneRouter.SCENE_CHARACTER))
	_show_password.pressed.connect(func() -> void: _toggle(_password, _show_password))
	_password.text_changed.connect(func(_value: String) -> void: _refresh_confirm())
	_code.text_changed.connect(func(_value: String) -> void: _refresh_confirm())
	_phrase.text_changed.connect(func(_value: String) -> void: _refresh_confirm())
	_password.grab_focus()


func _toggle(edit: LineEdit, button: Button) -> void:
	edit.secret = not edit.secret
	button.text = "Hide" if not edit.secret else "Show"


func _refresh_confirm() -> void:
	_confirm.disabled = (
		_busy
		or _password.text.is_empty()
		or _code.text.strip_edges().is_empty()
		or _phrase.text != CONFIRM_PHRASE
	)


func _on_send_code() -> void:
	if _busy:
		return
	_busy = true
	_send_code.disabled = true
	_refresh_confirm()
	var result := await GameService.request_account_deletion(_password.text)
	if bool(result.get("ok", false)):
		_status.text = "A confirmation code was sent to your email. It expires in 15 minutes."
	else:
		_status.text = AccountService.last_message
	_busy = false
	_send_code.disabled = false
	_refresh_confirm()


func _on_confirm() -> void:
	if _busy or _confirm.disabled:
		return
	_busy = true
	_confirm.disabled = true
	var result := await GameService.confirm_account_deletion(_password.text, _code.text, _phrase.text)
	if not bool(result.get("ok", false)):
		_status.text = AccountService.last_message
	elif not bool(result.get("completed", false)):
		_status.text = "Deletion is still running. Confirm again to resume."
	_busy = false
	_refresh_confirm()
