extends "res://scripts/ui/shell_page.gd"

const RESEND_SECONDS := 30

@onready var _explanation: Label = $Center/VBox/Explanation
@onready var _delay: Label = $Center/VBox/DeliveryDelay
@onready var _code_edit: LineEdit = $Center/VBox/CodeEdit
@onready var _global_error: Label = $Center/VBox/GlobalError
@onready var _verify_button: Button = $Center/VBox/VerifyButton
@onready var _resend_button: Button = $Center/VBox/ResendButton
@onready var _change_email: Button = $Center/VBox/ChangeEmailButton
@onready var _back_button: Button = $Center/VBox/BackButton

var _resend_left: int = 0
var _countdown: Timer


func _ready() -> void:
	super._ready()
	_explanation.text = "We sent a verification code to %s. Enter it here. Pasting is supported." % AccountService.pending_email
	_delay.text = "Email can take a few minutes. Check junk folders. The code expires after a short time."
	_code_edit.placeholder_text = "Verification code"
	_code_edit.secret = false
	_verify_button.pressed.connect(_on_verify_pressed)
	_resend_button.pressed.connect(_on_resend_pressed)
	_change_email.pressed.connect(func() -> void: SceneRouter.transition_to(SceneRouter.SCENE_REGISTER))
	_back_button.pressed.connect(func() -> void: SceneRouter.transition_to(SceneRouter.SCENE_LOGIN))
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


func _on_verify_pressed() -> void:
	_global_error.text = ""
	_verify_button.disabled = true
	await GameService.request_verify_email(_code_edit.text)
	_verify_button.disabled = false
	_global_error.text = AccountService.last_message


func _on_resend_pressed() -> void:
	if _resend_left > 0:
		return
	_resend_button.disabled = true
	await AccountService.request_verification()
	AppState.report_recoverable("verification_resent", "If that email is unverified, we sent another code.")
	_start_resend_wait()


func _start_resend_wait() -> void:
	_resend_left = RESEND_SECONDS
	_resend_button.disabled = true
	_resend_button.text = "Resend (%ss)" % str(_resend_left)
	_countdown.start()


func _on_tick() -> void:
	_resend_left -= 1
	if _resend_left <= 0:
		_countdown.stop()
		_resend_button.disabled = false
		_resend_button.text = "Resend"
		return
	_resend_button.text = "Resend (%ss)" % str(_resend_left)
