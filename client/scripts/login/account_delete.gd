extends "res://scripts/ui/shell_page.gd"

const CONFIRM_PHRASE := "DELETE ACCOUNT"

@onready var _password: LineEdit = $Center/VBox/PasswordRow/PasswordEdit
@onready var _show_password: Button = $Center/VBox/PasswordRow/ShowPasswordButton
@onready var _send_code: Button = $Center/VBox/SendCodeButton
@onready var _code: LineEdit = $Center/VBox/CodeEdit
@onready var _phrase: LineEdit = $Center/VBox/PhraseEdit
@onready var _phrase_hint: Label = $Center/VBox/PhraseHint
@onready var _status: Label = $Center/VBox/StatusLabel
@onready var _confirm: Button = $Center/VBox/ConfirmButton
@onready var _back: Button = $Center/VBox/BackButton

var _busy: bool = false
var _cooldown: EmailCodeCooldown


func _ready() -> void:
	super._ready()
	WindowManager.open(WindowManager.ACCOUNT_DELETE)
	_password.secret = true
	ShellTheme.style_field(_password, "password")
	ShellTheme.style_field(_code, "text")
	ShellTheme.style_field(_phrase, "text")
	ShellTheme.style_secondary(_send_code)
	ShellTheme.style_destructive(_confirm, true)
	ShellTheme.style_secondary(_back)
	_confirm.focus_mode = Control.FOCUS_CLICK
	_confirm.disabled = true
	_send_code.pressed.connect(_on_send_code)
	_confirm.pressed.connect(_on_confirm)
	_back.pressed.connect(func() -> void: SceneRouter.transition_to(SceneRouter.SCENE_CHARACTER))
	_show_password.pressed.connect(func() -> void: _toggle(_password, _show_password))
	_password.text_changed.connect(func(_value: String) -> void: _refresh_confirm())
	_code.text_changed.connect(func(_value: String) -> void: _refresh_confirm())
	_phrase.text_changed.connect(func(_value: String) -> void: _refresh_confirm())
	_phrase.placeholder_text = CONFIRM_PHRASE
	_phrase_hint.text = _phrase_guidance()
	_cooldown = EmailCodeCooldown.new()
	add_child(_cooldown)
	_cooldown.add_button(_send_code, "Send confirmation code")
	_cooldown.resume_after_send(false)
	_password.grab_focus()


func _toggle(edit: LineEdit, button: Button) -> void:
	edit.secret = not edit.secret
	button.text = "Hide" if not edit.secret else "Show"


func _refresh_confirm() -> void:
	_phrase_hint.text = _phrase_guidance()
	_confirm.disabled = (
		_busy
		or _password.text.is_empty()
		or _code.text.strip_edges().is_empty()
		or _phrase.text != CONFIRM_PHRASE
	)


func _phrase_guidance() -> String:
	var typed := _phrase.text
	if typed == CONFIRM_PHRASE:
		return "Phrase matches."
	var compact := typed.replace(" ", "").replace("\t", "")
	if compact.to_upper() == "DELETEACCOUNT" and typed.find(" ") < 0:
		return "Include the space: type DELETE ACCOUNT, not DELETEACCOUNT."
	if typed.to_lower() == "delete account":
		return "Use capital letters: DELETE ACCOUNT."
	return "Type DELETE ACCOUNT exactly, including the space between the two words."


func _on_send_code() -> void:
	if _cooldown.is_blocking():
		return
	_busy = true
	_cooldown.set_busy(true)
	_refresh_confirm()
	var result := await GameService.request_account_deletion(_password.text)
	if bool(result.get("ok", false)):
		_status.text = "A confirmation code was sent to your email. It expires in 15 minutes."
	elif AccountErrors.canonicalize(AccountService.last_code) == "AUTH_RATE_LIMITED":
		_status.text = AccountErrors.message_for("AUTH_RATE_LIMITED")
	else:
		_status.text = AccountService.last_message
	_busy = false
	_cooldown.set_busy(false)
	_cooldown.apply()
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
