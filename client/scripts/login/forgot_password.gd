extends "res://scripts/ui/shell_page.gd"

@onready var _email_edit: LineEdit = $Center/VBox/EmailEdit
@onready var _status: Label = $Center/VBox/StatusLabel
@onready var _submit: Button = $Center/VBox/SubmitButton
@onready var _continue: Button = $Center/VBox/ContinueButton
@onready var _resend: Button = $Center/VBox/ResendButton
@onready var _back: Button = $Center/VBox/BackButton

var _busy: bool = false
var _cooldown: EmailCodeCooldown


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
	_cooldown = EmailCodeCooldown.new()
	add_child(_cooldown)
	_cooldown.add_button(_submit, "Send reset instructions")
	_cooldown.add_button(_resend, "Resend")
	_cooldown.resume_after_send(false)
	_email_edit.grab_focus()


func _on_submit() -> void:
	if _cooldown.is_blocking():
		return
	_busy = true
	_cooldown.set_busy(true)
	await GameService.request_password_reset(_email_edit.text)
	if AccountErrors.canonicalize(AccountService.last_code) == "AUTH_RATE_LIMITED":
		_status.text = AccountErrors.message_for("AUTH_RATE_LIMITED")
	else:
		_status.text = "If an account exists for that email, password-reset instructions have been sent. Check your inbox and junk folder. The code expires after 15 minutes."
		if not _email_edit.text.strip_edges().is_empty():
			var masked := EmailMask.mask(_email_edit.text)
			if not masked.is_empty():
				_status.text = "If an account exists for that email, password-reset instructions have been sent to %s. Check your inbox and junk folder. The code expires after 15 minutes." % masked
	_continue.visible = true
	_busy = false
	_cooldown.set_busy(false)
	_cooldown.apply()
