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
@onready var _vbox: VBoxContainer = $Center/VBox

var _busy: bool = false
var _form_errors: UxFormErrors
var _banner: UxStatusBanner
var _spinner: UxSpinner


func _ready() -> void:
	super._ready()
	WindowManager.open(WindowManager.REGISTER)
	ShellTheme.style_field(_email_edit, "email")
	ShellTheme.style_field(_password_edit, "password")
	ShellTheme.style_field(_confirm_edit, "password")
	ShellTheme.style_primary(_register_button)
	ShellTheme.style_secondary(_back_button)
	ShellTheme.style_secondary(_show_password)
	ShellTheme.style_secondary(_show_confirm)
	_password_edit.secret = true
	_confirm_edit.secret = true
	_terms.button_pressed = false
	_privacy.button_pressed = false
	_guidance.text = "Passwords must be 15–128 characters and must not be a common password."
	_mail_hint.visible = true
	_mail_hint.text = "We send the verification code to this email. Check the inbox and junk folder."
	_register_button.pressed.connect(_on_register_pressed)
	_back_button.pressed.connect(_on_back_pressed)
	_show_password.pressed.connect(func() -> void: _toggle_secret(_password_edit, _show_password))
	_show_confirm.pressed.connect(func() -> void: _toggle_secret(_confirm_edit, _show_confirm))
	_terms_link.pressed.connect(_on_legal_placeholder.bind("Terms of Service"))
	_privacy_link.pressed.connect(_on_legal_placeholder.bind("Privacy Policy"))
	_password_edit.text_changed.connect(_on_password_changed)
	_confirm_edit.text_changed.connect(_on_confirm_changed)
	_email_edit.text_changed.connect(_on_email_changed)
	_email_edit.text_submitted.connect(func(_value: String) -> void: _password_edit.grab_focus())
	_password_edit.text_submitted.connect(func(_value: String) -> void: _confirm_edit.grab_focus())
	_confirm_edit.text_submitted.connect(func(_value: String) -> void: _on_register_pressed())
	_form_errors = UxFormErrors.new()
	_form_errors.name = "FormErrorSummary"
	_vbox.add_child(_form_errors)
	_vbox.move_child(_form_errors, _global_error.get_index())
	_banner = UxStatusBanner.new()
	_vbox.add_child(_banner)
	_vbox.move_child(_banner, 1)
	_spinner = UxSpinner.new()
	_spinner.visible = false
	_vbox.add_child(_spinner)
	_vbox.move_child(_spinner, _register_button.get_index())
	if not AccountService.last_email_provider_ok:
		_banner.show_message(AccountErrors.message_for("EMAIL_DELIVERY_DELAYED"), UxStatusBanner.Tone.WARNING)
	if not AccountService.pending_email.is_empty():
		_email_edit.text = AccountService.pending_email
		_on_email_changed(_email_edit.text)
	_email_edit.grab_focus()


func _on_email_changed(value: String) -> void:
	_email_error.text = ""
	var guided := EmailSyntax.guidance(value)
	if value.strip_edges().is_empty():
		_email_error.text = ""
		return
	if not bool(guided.get("ok", false)):
		_email_error.text = String(guided.get("label", ""))
	else:
		_email_error.text = String(guided.get("label", ""))
		_email_error.add_theme_color_override("font_color", DesignTokens.SUCCESS)


func _on_password_changed(value: String) -> void:
	var evaluated := PasswordStrength.evaluate(value)
	_strength.text = String(evaluated.get("label", ""))
	_password_error.text = ""
	if not bool(evaluated.get("ok", false)):
		_strength.add_theme_color_override("font_color", DesignTokens.WARNING)
	else:
		_strength.add_theme_color_override("font_color", DesignTokens.SUCCESS)
	_on_confirm_changed(_confirm_edit.text)


func _on_confirm_changed(value: String) -> void:
	_confirm_error.text = ""
	if value.is_empty():
		return
	if value != _password_edit.text:
		_confirm_error.text = AccountErrors.message_for("password_mismatch")


func _toggle_secret(edit: LineEdit, button: Button) -> void:
	edit.secret = not edit.secret
	button.text = "Hide" if not edit.secret else "Show"


func _on_legal_placeholder(title: String) -> void:
	AppState.report_recoverable("legal_placeholder", "%s will be published at a later date." % title)


func _on_back_pressed() -> void:
	if _busy:
		return
	if not _email_edit.text.strip_edges().is_empty():
		AccountService.pending_email = _email_edit.text.strip_edges()
	SceneRouter.transition_to(SceneRouter.SCENE_LOGIN)


func _on_register_pressed() -> void:
	if _busy:
		return
	_clear_errors()
	var lines := PackedStringArray()
	var email_guide := EmailSyntax.guidance(_email_edit.text)
	if not bool(email_guide.get("ok", false)):
		_email_error.text = String(email_guide.get("label", ""))
		_email_error.remove_theme_color_override("font_color")
		lines.append(String(email_guide.get("label", "")))
	var strength := PasswordStrength.evaluate(_password_edit.text)
	if not bool(strength.get("ok", false)):
		_password_error.text = String(strength.get("label", ""))
		lines.append(String(strength.get("label", "")))
	if _password_edit.text != _confirm_edit.text:
		_confirm_error.text = AccountErrors.message_for("password_mismatch")
		lines.append(AccountErrors.message_for("password_mismatch"))
	if not _terms.button_pressed or not _privacy.button_pressed:
		_legal_error.text = AccountErrors.message_for("terms_required")
		lines.append(AccountErrors.message_for("terms_required"))
	if lines.size() > 0:
		_form_errors.set_errors(lines)
		return
	_set_busy(true)
	_global_error.text = "Creating account…"
	await GameService.request_register(
		_email_edit.text,
		_password_edit.text,
		_confirm_edit.text,
		_terms.button_pressed,
		_privacy.button_pressed
	)
	_set_busy(false)
	if SceneRouter.current_scene_id != SceneRouter.SCENE_VERIFY:
		_apply_field_errors(AccountService.last_field_errors)
		_global_error.text = AccountService.last_message
		if AccountErrors.canonicalize(AccountService.last_code) == "AUTH_EMAIL_IN_USE_OR_PENDING":
			_global_error.text = AccountErrors.message_for("AUTH_EMAIL_IN_USE_OR_PENDING")


func _apply_field_errors(fields: Dictionary) -> void:
	var lines := PackedStringArray()
	if fields.has("email"):
		_email_error.text = AccountErrors.message_for("AUTH_EMAIL_INVALID")
		_email_error.remove_theme_color_override("font_color")
		lines.append(AccountErrors.message_for("AUTH_EMAIL_INVALID"))
	if fields.has("password"):
		_password_error.text = AccountErrors.message_for("AUTH_PASSWORD_WEAK")
		lines.append(AccountErrors.message_for("AUTH_PASSWORD_WEAK"))
	if fields.has("password_confirmation"):
		_confirm_error.text = AccountErrors.message_for("password_mismatch")
		lines.append(AccountErrors.message_for("password_mismatch"))
	if fields.has("accepted_terms_version") or fields.has("accepted_privacy_version"):
		_legal_error.text = AccountErrors.message_for("terms_required")
		lines.append(AccountErrors.message_for("terms_required"))
	_form_errors.set_errors(lines)


func _clear_errors() -> void:
	_email_error.text = ""
	_email_error.remove_theme_color_override("font_color")
	_password_error.text = ""
	_confirm_error.text = ""
	_legal_error.text = ""
	_global_error.text = ""
	if _form_errors != null:
		_form_errors.clear()


func _set_busy(busy: bool) -> void:
	_busy = busy
	_register_button.disabled = busy
	_back_button.disabled = busy
	if _spinner != null:
		_spinner.set_active(busy)
	_register_button.text = "Creating…" if busy else "Register"
