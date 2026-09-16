class_name LevelUpToast
extends PanelContainer

## Skippable level-up presentation. Never blocks movement or combat.

signal dismissed

var body_label: Label
var dismiss_button: Button
var _lines: PackedStringArray = PackedStringArray()


func _ready() -> void:
	visible = false
	mouse_filter = Control.MOUSE_FILTER_STOP
	focus_mode = Control.FOCUS_ALL
	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", DesignTokens.SPACE_MD)
	margin.add_theme_constant_override("margin_right", DesignTokens.SPACE_MD)
	margin.add_theme_constant_override("margin_top", DesignTokens.SPACE_SM)
	margin.add_theme_constant_override("margin_bottom", DesignTokens.SPACE_SM)
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", DesignTokens.SPACE_SM)
	var title := Label.new()
	title.text = "Level up"
	title.add_theme_font_size_override("font_size", DesignTokens.FONT_HEADING)
	body_label = Label.new()
	body_label.name = "Body"
	body_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	body_label.custom_minimum_size = Vector2(280, 0)
	dismiss_button = Button.new()
	dismiss_button.name = "Dismiss"
	dismiss_button.text = "Continue"
	ShellTheme.style_primary(dismiss_button)
	dismiss_button.pressed.connect(dismiss)
	box.add_child(title)
	box.add_child(body_label)
	box.add_child(dismiss_button)
	margin.add_child(box)
	add_child(margin)


func present(lines: PackedStringArray) -> void:
	if body_label == null:
		_ready()
	_lines = lines
	body_label.text = "\n".join(lines)
	visible = true
	dismiss_button.grab_focus()


func dismiss() -> void:
	if not visible:
		return
	visible = false
	dismissed.emit()


func presented_text() -> String:
	return "\n".join(_lines)


func _unhandled_input(event: InputEvent) -> void:
	if not visible:
		return
	if event.is_action_pressed("ui_cancel") or event.is_action_pressed("ui_accept"):
		dismiss()
		get_viewport().set_input_as_handled()
