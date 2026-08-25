extends "res://scripts/ui/shell_page.gd"

@onready var _explanation: Label = $Center/VBox/Explanation
@onready var _code_edit: LineEdit = $Center/VBox/CodeEdit
@onready var _status: Label = $Center/VBox/StatusLabel
@onready var _continue: Button = $Center/VBox/ContinueButton
@onready var _resend: Button = $Center/VBox/ResendButton
@onready var _back: Button = $Center/VBox/BackButton

var _busy: bool = false
var _cooldown: EmailCodeCooldown


func _ready() -> void:
	super._ready()
	WindowManager.open(WindowManager.PASSWORD_RESET_CODE)
	_explanation.text = "%s Pasting is supported. If the code expired, request a new one. Codes expire after 15 minutes." % EmailMask.explain_destination(AccountService.pending_reset_email if not AccountService.pending_reset_email.is_empty() else AccountService.pending_email, "the address you entered")
	CodeFormatter.configure_edit(_code_edit)
	ShellTheme.style_field(_code_edit, "text")
	ShellTheme.style_primary(_continue)
	ShellTheme.style_secondary(_resend)
	ShellTheme.style_secondary(_back)
	_continue.pressed.connect(_on_continue)
	_resend.pressed.connect(_on_resend)
	_back.pressed.connect(func() -> void: SceneRouter.transition_to(SceneRouter.SCENE_FORGOT_PASSWORD))
	_code_edit.gui_input.connect(_on_code_gui_input)
	_code_edit.text_changed.connect(func(_value: String) -> void: CodeFormatter.apply_to_edit(_code_edit))
	_code_edit.text_submitted.connect(func(_value: String) -> void: _on_continue())
	_cooldown = EmailCodeCooldown.new()
	add_child(_cooldown)
	_cooldown.add_button(_resend, "Resend")
	_cooldown.resume_after_send(true)
	_code_edit.grab_focus()


func _on_code_gui_input(event: InputEvent) -> void:
	CodeFormatter.handle_gui_paste(_code_edit, event)


func _on_continue() -> void:
	if _busy:
		return
	AccountService.pending_reset_code = CodeFormatter.normalize(_code_edit.text)
	SceneRouter.transition_to(SceneRouter.SCENE_PASSWORD_RESET_NEW)


func _on_resend() -> void:
	if _cooldown.is_blocking() or _busy:
		return
	_busy = true
	_cooldown.set_busy(true)
	await AccountService.request_password_reset(AccountService.pending_reset_email)
	if AccountErrors.canonicalize(AccountService.last_code) == "AUTH_RATE_LIMITED":
		_status.text = AccountErrors.message_for("AUTH_RATE_LIMITED")
	else:
		_status.text = "If an account exists for that email, password-reset instructions have been sent."
	_busy = false
	_cooldown.set_busy(false)
	_cooldown.apply()
