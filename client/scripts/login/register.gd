extends "res://scripts/ui/shell_page.gd"

@onready var _email_edit: LineEdit = $Center/VBox/EmailEdit
@onready var _mail_hint: Label = $Center/VBox/MailHint
@onready var _password_edit: LineEdit = $Center/VBox/PasswordRow/PasswordEdit
@onready var _confirm_edit: LineEdit = $Center/VBox/ConfirmRow/ConfirmEdit
@onready var _show_password: Button = $Center/VBox/PasswordRow/ShowPasswordButton
@onready var _show_confirm: Button = $Center/VBox/ConfirmRow/ShowConfirmButton
@onready var _guidance: Label = $Center/VBox/PasswordGuidance
@onready var _strength: Label = $Center/VBox/StrengthLabel
@onready var _terms: CheckBox = $Center/VBox/TermsCheck
@onready var _privacy: CheckBox = $Center/VBox/PrivacyCheck
@onready var _terms_link: LinkButton = $Center/VBox/TermsLink
@onready var _privacy_link: LinkButton = $Center/VBox/PrivacyLink
@onready var _email_error: Label = $Center/VBox/EmailError
@onready var _password_error: Label = $Center/VBox/PasswordError
@onready var _confirm_error: Label = $Center/VBox/ConfirmError
@onready var _legal_error: Label = $Center/VBox/LegalError
@onready var _global_error: Label = $Center/VBox/GlobalError
@onready var _register_button: Button = $Center/VBox/RegisterButton
@onready var _back_button: Button = $Center/VBox/BackButton


func _ready() -> void:
	super._ready()
	WindowManager.open(WindowManager.REGISTER)
	_password_edit.secret = true
	_confirm_edit.secret = true
	_terms.button_pressed = false
	_privacy.button_pressed = false
	_guidance.text = "Passwords must be 15–128 characters and must not be a common password."
	_mail_hint.visible = AccountService.uses_local_mail_capture()
	_mail_hint.text = "Local verification codes are captured in Mailpit at %s. They are not delivered to Gmail." % AccountService.LOCAL_MAILPIT_URL
	_register_button.pressed.connect(_on_register_pressed)
	_back_button.pressed.connect(_on_back_pressed)
	_show_password.pressed.connect(func() -> void: _toggle_secret(_password_edit, _show_password))
	_show_confirm.pressed.connect(func() -> void: _toggle_secret(_confirm_edit, _show_confirm))
	_terms_link.pressed.connect(_on_legal_placeholder.bind("Terms of Service"))
	_privacy_link.pressed.connect(_on_legal_placeholder.bind("Privacy Policy"))
	_password_edit.text_changed.connect(_on_password_changed)
	_confirm_edit.text_changed.connect(func(_value: String) -> void: _confirm_error.text = "")
	_email_edit.text_changed.connect(func(_value: String) -> void: _email_error.text = "")
	if not AccountService.pending_email.is_empty():
		_email_edit.text = AccountService.pending_email
	_email_edit.grab_focus()


func _on_password_changed(value: String) -> void:
	var evaluated := PasswordStrength.evaluate(value)
	_strength.text = String(evaluated.get("label", ""))
	_password_error.text = ""


func _toggle_secret(edit: LineEdit, button: Button) -> void:
	edit.secret = not edit.secret
	button.text = "Hide" if not edit.secret else "Show"


func _on_legal_placeholder(title: String) -> void:
	AppState.report_recoverable("legal_placeholder", "%s will be published at a later date." % title)


func _on_back_pressed() -> void:
	SceneRouter.transition_to(SceneRouter.SCENE_LOGIN)


func _on_register_pressed() -> void:
	_clear_errors()
	_register_button.disabled = true
	await GameService.request_register(
		_email_edit.text,
		_password_edit.text,
		_confirm_edit.text,
		_terms.button_pressed,
		_privacy.button_pressed
	)
	_register_button.disabled = false
	_apply_field_errors(AccountService.last_field_errors)
	_global_error.text = AccountService.last_message


func _apply_field_errors(fields: Dictionary) -> void:
	if fields.has("email"):
		_email_error.text = "Enter a valid email address."
	if fields.has("password"):
		_password_error.text = "Choose a stronger password."
	if fields.has("password_confirmation"):
		_confirm_error.text = "Password confirmation does not match."
	if fields.has("accepted_terms_version") or fields.has("accepted_privacy_version"):
		_legal_error.text = "Accept the current Terms of Service and Privacy Policy."


func _clear_errors() -> void:
	_email_error.text = ""
	_password_error.text = ""
	_confirm_error.text = ""
	_legal_error.text = ""
	_global_error.text = ""
