extends "res://scripts/ui/shell_page.gd"

const RESEND_SECONDS := 30

@onready var _explanation: Label = $Center/VBox/Explanation
@onready var _code_edit: LineEdit = $Center/VBox/CodeEdit
@onready var _status: Label = $Center/VBox/StatusLabel
@onready var _continue: Button = $Center/VBox/ContinueButton
@onready var _resend: Button = $Center/VBox/ResendButton
@onready var _back: Button = $Center/VBox/BackButton

var _resend_left: int = 0
var _countdown: Timer
var _busy: bool = false


func _ready() -> void:
	super._ready()
	WindowManager.open(WindowManager.PASSWORD_RESET_CODE)
	_explanation.text = "Enter the reset code sent to your email. Pasting is supported. If the code expired, request a new one."
	_code_edit.placeholder_text = "Reset code"
	_continue.pressed.connect(_on_continue)
	_resend.pressed.connect(_on_resend)
	_back.pressed.connect(func() -> void: SceneRouter.transition_to(SceneRouter.SCENE_FORGOT_PASSWORD))
	_code_edit.gui_input.connect(_on_code_gui_input)
	_countdown = Timer.new()
	_countdown.one_shot = false
	_countdown.wait_time = 1.0
	_countdown.timeout.connect(_on_tick)
	add_child(_countdown)
	_start_resend_wait()
	_code_edit.grab_focus()


func _on_code_gui_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and event.ctrl_pressed and event.keycode == KEY_V:
		var pasted := DisplayServer.clipboard_get().strip_edges()
		if not pasted.is_empty():
			_code_edit.text = pasted


func _on_continue() -> void:
	if _busy:
		return
	AccountService.pending_reset_code = _code_edit.text.strip_edges()
	SceneRouter.transition_to(SceneRouter.SCENE_PASSWORD_RESET_NEW)


func _on_resend() -> void:
	if _resend_left > 0 or _busy:
		return
	_busy = true
	_resend.disabled = true
	await AccountService.request_password_reset(AccountService.pending_reset_email)
	_status.text = "If an account exists for that email, password-reset instructions have been sent."
	_busy = false
	_start_resend_wait()


func _start_resend_wait() -> void:
	_resend_left = RESEND_SECONDS
	_resend.disabled = true
	_resend.text = "Resend (%ss)" % str(_resend_left)
	_countdown.start()


func _on_tick() -> void:
	_resend_left -= 1
	if _resend_left <= 0:
		_countdown.stop()
		_resend.disabled = false
		_resend.text = "Resend"
		return
	_resend.text = "Resend (%ss)" % str(_resend_left)
