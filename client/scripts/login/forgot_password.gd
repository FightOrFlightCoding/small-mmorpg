extends "res://scripts/ui/shell_page.gd"

@onready var _email_edit: LineEdit = $Center/VBox/EmailEdit
@onready var _status: Label = $Center/VBox/StatusLabel
@onready var _submit: Button = $Center/VBox/SubmitButton
@onready var _continue: Button = $Center/VBox/ContinueButton
@onready var _resend: Button = $Center/VBox/ResendButton
@onready var _back: Button = $Center/VBox/BackButton

var _busy: bool = false


func _ready() -> void:
	super._ready()
	WindowManager.open(WindowManager.FORGOT_PASSWORD)
	_continue.visible = false
	_status.text = "If an account exists for that email, password-reset instructions have been sent."
	if not AccountService.pending_reset_email.is_empty():
		_email_edit.text = AccountService.pending_reset_email
	elif not AccountService.pending_email.is_empty():
		_email_edit.text = AccountService.pending_email
	_submit.pressed.connect(_on_submit)
	_continue.pressed.connect(func() -> void: SceneRouter.transition_to(SceneRouter.SCENE_PASSWORD_RESET_CODE))
	_resend.pressed.connect(_on_submit)
	_back.pressed.connect(func() -> void: SceneRouter.transition_to(SceneRouter.SCENE_LOGIN))
	_email_edit.grab_focus()


func _on_submit() -> void:
	if _busy:
		return
	_busy = true
	_submit.disabled = true
	_resend.disabled = true
	await GameService.request_password_reset(_email_edit.text)
	_status.text = "If an account exists for that email, password-reset instructions have been sent. Check your inbox and junk folder. The code expires after 15 minutes."
	_continue.visible = true
	_busy = false
	_submit.disabled = false
	_resend.disabled = false
