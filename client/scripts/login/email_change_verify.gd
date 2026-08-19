extends "res://scripts/ui/shell_page.gd"

const RESEND_SECONDS := 30

@onready var _explanation: Label = $Center/VBox/Explanation
@onready var _code_edit: LineEdit = $Center/VBox/CodeEdit
@onready var _status: Label = $Center/VBox/StatusLabel
@onready var _submit: Button = $Center/VBox/SubmitButton
@onready var _resend: Button = $Center/VBox/ResendButton
@onready var _back: Button = $Center/VBox/BackButton

var _resend_left: int = 0
var _countdown: Timer
var _busy: bool = false
var _done: bool = false


func _ready() -> void:
	super._ready()
	WindowManager.open(WindowManager.EMAIL_CHANGE_VERIFY)
	_explanation.text = "We sent a confirmation code to the new address. Your current email stays active until you confirm. Pasting is supported."
	_code_edit.placeholder_text = "Confirmation code"
	_submit.pressed.connect(_on_submit)
	_resend.pressed.connect(_on_resend)
	_back.pressed.connect(func() -> void: SceneRouter.transition_to(SceneRouter.SCENE_CHANGE_EMAIL if AppState.is_authenticated else SceneRouter.SCENE_LOGIN))
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


func _on_submit() -> void:
	if _busy:
		return
	if _done:
		SceneRouter.transition_to(SceneRouter.SCENE_LOGIN)
		return
	_busy = true
	_submit.disabled = true
	await GameService.confirm_email_change(_code_edit.text)
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
	if _resend_left > 0 or _busy or AccountService.pending_email_change_password.is_empty():
		return
	_busy = true
	_resend.disabled = true
	await AccountService.request_email_change(AccountService.pending_email_change_password, AccountService.pending_email_change)
	_status.text = "If that request was accepted, we sent another code to the new address."
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
