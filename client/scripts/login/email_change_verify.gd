extends "res://scripts/ui/shell_page.gd"

@onready var _explanation: Label = $Center/VBox/Explanation
@onready var _code_edit: LineEdit = $Center/VBox/CodeEdit
@onready var _status: Label = $Center/VBox/StatusLabel
@onready var _submit: Button = $Center/VBox/SubmitButton
@onready var _resend: Button = $Center/VBox/ResendButton
@onready var _back: Button = $Center/VBox/BackButton

var _busy: bool = false
var _done: bool = false
var _cooldown: EmailCodeCooldown


func _ready() -> void:
	super._ready()
	WindowManager.open(WindowManager.EMAIL_CHANGE_VERIFY)
	_explanation.text = "%s Your current email stays active until you confirm. Pasting is supported. Codes expire after a short time." % EmailMask.explain_destination(AccountService.pending_email_change, "the new address")
	CodeFormatter.configure_edit(_code_edit)
	ShellTheme.style_field(_code_edit, "text")
	ShellTheme.style_primary(_submit)
	ShellTheme.style_secondary(_resend)
	ShellTheme.style_secondary(_back)
	_submit.pressed.connect(_on_submit)
	_resend.pressed.connect(_on_resend)
	_back.pressed.connect(func() -> void: SceneRouter.transition_to(SceneRouter.SCENE_CHANGE_EMAIL if AppState.is_authenticated else SceneRouter.SCENE_LOGIN))
	_code_edit.gui_input.connect(_on_code_gui_input)
	_code_edit.text_changed.connect(func(_value: String) -> void: CodeFormatter.apply_to_edit(_code_edit))
	_code_edit.text_submitted.connect(func(_value: String) -> void: _on_submit())
	_cooldown = EmailCodeCooldown.new()
	add_child(_cooldown)
	_cooldown.add_button(_resend, "Resend")
	_cooldown.resume_after_send(true)
	_code_edit.grab_focus()


func _on_code_gui_input(event: InputEvent) -> void:
	CodeFormatter.handle_gui_paste(_code_edit, event)


func _on_submit() -> void:
	if _busy:
		return
	if _done:
		SceneRouter.transition_to(SceneRouter.SCENE_LOGIN)
		return
	_busy = true
	_submit.disabled = true
	await GameService.confirm_email_change(CodeFormatter.normalize(_code_edit.text))
	_status.text = AccountService.last_message
	if AccountService.last_code == "AUTH_CHALLENGE_EXPIRED":
		_status.text = "That code has expired. Request a new email change."
	elif AccountService.last_message.is_empty() or AccountService.last_code.is_empty():
		_done = true
		_status.text = "Email changed. Sign in with the new address. All sessions were signed out."
		_submit.text = "Back to Login"
		_submit.disabled = false
		_busy = false
		return
	_busy = false
	_submit.disabled = false


func _on_resend() -> void:
	if _cooldown.is_blocking() or AccountService.pending_email_change_password.is_empty():
		return
	_cooldown.set_busy(true)
	await AccountService.request_email_change(AccountService.pending_email_change_password, AccountService.pending_email_change)
	if AccountErrors.canonicalize(AccountService.last_code) == "AUTH_RATE_LIMITED":
		_status.text = AccountErrors.message_for("AUTH_RATE_LIMITED")
	else:
		_status.text = "If that request was accepted, we sent another code to the new address."
	_cooldown.set_busy(false)
	_cooldown.apply()
