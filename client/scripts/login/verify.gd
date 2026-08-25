extends "res://scripts/ui/shell_page.gd"

const RESEND_SECONDS := 30

@onready var _explanation: Label = $Center/VBox/Explanation
@onready var _delay: Label = $Center/VBox/DeliveryDelay
@onready var _inbox_button: Button = $Center/VBox/InboxButton
@onready var _code_edit: LineEdit = $Center/VBox/CodeEdit
@onready var _global_error: Label = $Center/VBox/GlobalError
@onready var _verify_button: Button = $Center/VBox/VerifyButton
@onready var _resend_button: Button = $Center/VBox/ResendButton
@onready var _change_email: Button = $Center/VBox/ChangeEmailButton
@onready var _back_button: Button = $Center/VBox/BackButton
@onready var _vbox: VBoxContainer = $Center/VBox

var _resend_left: int = 0
var _countdown: Timer
var _busy: bool = false
var _banner: UxStatusBanner
var _expiry: Label
var _spinner: UxSpinner


func _ready() -> void:
	super._ready()
	ShellTheme.style_field(_code_edit, "text")
	ShellTheme.style_primary(_verify_button)
	ShellTheme.style_secondary(_resend_button)
	ShellTheme.style_secondary(_change_email)
	ShellTheme.style_secondary(_back_button)
	_explanation.text = "%s Enter it here. Pasting is supported." % EmailMask.explain_destination(AccountService.pending_email)
	_delay.text = AccountService.local_mail_capture_copy()
	_inbox_button.visible = AccountService.shows_local_operator_hints()
	_inbox_button.pressed.connect(_on_inbox_pressed)
	_code_edit.placeholder_text = "XXX XXX"
	_code_edit.secret = false
	_verify_button.pressed.connect(_on_verify_pressed)
	_resend_button.pressed.connect(_on_resend_pressed)
	_change_email.pressed.connect(func() -> void: SceneRouter.transition_to(SceneRouter.SCENE_REGISTER))
	_back_button.pressed.connect(func() -> void: SceneRouter.transition_to(SceneRouter.SCENE_LOGIN))
	_code_edit.gui_input.connect(_on_code_gui_input)
	_code_edit.text_changed.connect(func(_value: String) -> void: CodeFormatter.apply_to_edit(_code_edit))
	_code_edit.text_submitted.connect(func(_value: String) -> void: _on_verify_pressed())
	_banner = UxStatusBanner.new()
	_vbox.add_child(_banner)
	_vbox.move_child(_banner, 1)
	_expiry = Label.new()
	_expiry.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_expiry.text = "Codes expire after a short time. Request a new one if this one no longer works."
	_vbox.add_child(_expiry)
	_vbox.move_child(_expiry, _code_edit.get_index())
	_spinner = UxSpinner.new()
	_spinner.visible = false
	_vbox.add_child(_spinner)
	if not AccountService.last_email_provider_ok:
		_banner.show_message("Email sending is delayed or unavailable. You can still enter a code if you already received one.", UxStatusBanner.Tone.WARNING)
	_countdown = Timer.new()
	_countdown.one_shot = false
	_countdown.wait_time = 1.0
	_countdown.timeout.connect(_on_tick)
	add_child(_countdown)
	_start_resend_wait()
	_code_edit.grab_focus()


func _on_inbox_pressed() -> void:
	OS.shell_open(AccountService.LOCAL_MAILPIT_URL)


func _on_code_gui_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and event.ctrl_pressed and event.keycode == KEY_V:
		var pasted := DisplayServer.clipboard_get().strip_edges()
		if not pasted.is_empty():
			_code_edit.text = CodeFormatter.grouped(pasted)


func _on_verify_pressed() -> void:
	if _busy:
		return
	_global_error.text = ""
	_busy = true
	_verify_button.disabled = true
	_spinner.set_active(true)
	await GameService.request_verify_email(CodeFormatter.normalize(_code_edit.text))
	_busy = false
	_verify_button.disabled = false
	_spinner.set_active(false)
	_global_error.text = AccountService.last_message
	if AccountErrors.canonicalize(AccountService.last_code) == "AUTH_VERIFICATION_EXPIRED":
		_global_error.text = AccountErrors.message_for("AUTH_VERIFICATION_EXPIRED")


func _on_resend_pressed() -> void:
	if _resend_left > 0 or _busy:
		return
	_resend_button.disabled = true
	await AccountService.request_verification()
	if not AccountService.last_email_provider_ok:
		AppState.report_recoverable("EMAIL_DELIVERY_DELAYED", AccountErrors.message_for("EMAIL_DELIVERY_DELAYED"))
	else:
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
