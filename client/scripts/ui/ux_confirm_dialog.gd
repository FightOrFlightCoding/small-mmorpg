class_name UxConfirmDialog
extends UxModal

## Confirmation dialog with focus trapped on Cancel by default.

signal confirmed
signal cancelled

var title_label: Label
var message_label: Label
var confirm_button: Button
var cancel_button: Button
var _destructive: bool = false


func _ready() -> void:
	super._ready()
	title_label = Label.new()
	title_label.add_theme_font_size_override("font_size", DesignTokens.FONT_HEADING)
	title_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	message_label = Label.new()
	message_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	var row := HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_END
	cancel_button = Button.new()
	cancel_button.text = "Cancel"
	ShellTheme.style_secondary(cancel_button)
	cancel_button.pressed.connect(_on_cancel)
	confirm_button = Button.new()
	confirm_button.text = "Confirm"
	ShellTheme.style_primary(confirm_button)
	confirm_button.pressed.connect(_on_confirm)
	row.add_child(cancel_button)
	row.add_child(confirm_button)
	body.add_child(title_label)
	body.add_child(message_label)
	body.add_child(row)


func configure(title: String, message: String, confirm_text: String, destructive: bool = false) -> void:
	if title_label == null:
		_ready()
	_destructive = destructive
	title_label.text = title
	message_label.text = message
	confirm_button.text = confirm_text
	if destructive:
		ShellTheme.style_destructive(confirm_button, true)
	else:
		ShellTheme.style_primary(confirm_button)
		confirm_button.focus_mode = Control.FOCUS_ALL


func present() -> void:
	super.present()
	cancel_button.grab_focus()


func _on_confirm() -> void:
	visible = false
	confirmed.emit()


func _on_cancel() -> void:
	hide_modal()
	cancelled.emit()


func _unhandled_input(event: InputEvent) -> void:
	if not visible:
		return
	if event.is_action_pressed("ui_cancel"):
		_on_cancel()
		get_viewport().set_input_as_handled()
		return
	if _destructive and event.is_action_pressed("ui_accept") and confirm_button.focus_mode == Control.FOCUS_CLICK:
		get_viewport().set_input_as_handled()
