class_name GroundDropDialog
extends ColorRect

## Quantity selector and uncommon+ confirmation for public ground drops.

signal confirmed(quantity: int)
signal cancelled

const PUBLIC_WARNING := "This item will be public and can be picked up by anyone."

var instance_id: String = ""
var hint_dx: float = 0.0
var hint_dy: float = 0.0
var requires_confirm: bool = false

var _spin: SpinBox
var _title: Label
var _warning: Label
var _confirm_check: CheckBox
var _drop_button: Button


func _ready() -> void:
	color = Color(0, 0, 0, 0.55)
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	visible = false
	z_index = 20
	var panel := PanelContainer.new()
	panel.name = "Panel"
	panel.set_anchors_preset(Control.PRESET_CENTER)
	panel.offset_left = -180
	panel.offset_top = -120
	panel.offset_right = 180
	panel.offset_bottom = 120
	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", DesignTokens.SPACE_MD)
	margin.add_theme_constant_override("margin_right", DesignTokens.SPACE_MD)
	margin.add_theme_constant_override("margin_top", DesignTokens.SPACE_MD)
	margin.add_theme_constant_override("margin_bottom", DesignTokens.SPACE_MD)
	var body := VBoxContainer.new()
	body.add_theme_constant_override("separation", DesignTokens.SPACE_SM)
	_title = Label.new()
	_title.text = "Drop Item"
	body.add_child(_title)
	var hint := Label.new()
	hint.text = "Quantity to drop"
	hint.add_theme_color_override("font_color", DesignTokens.TEXT_MUTED)
	body.add_child(hint)
	_spin = SpinBox.new()
	_spin.min_value = 1
	_spin.max_value = 1
	_spin.step = 1
	_spin.rounded = true
	body.add_child(_spin)
	_warning = Label.new()
	_warning.text = PUBLIC_WARNING
	_warning.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_warning.add_theme_color_override("font_color", DesignTokens.WARNING)
	body.add_child(_warning)
	_confirm_check = CheckBox.new()
	_confirm_check.text = "I understand this drop is public."
	_confirm_check.toggled.connect(_on_confirm_toggled)
	body.add_child(_confirm_check)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", DesignTokens.SPACE_SM)
	_drop_button = Button.new()
	_drop_button.text = "Drop"
	_drop_button.pressed.connect(_on_confirm)
	row.add_child(_drop_button)
	var cancel := Button.new()
	cancel.text = "Cancel"
	cancel.pressed.connect(close_dialog)
	row.add_child(cancel)
	body.add_child(row)
	margin.add_child(body)
	panel.add_child(margin)
	add_child(panel)


func open_for(
	p_instance_id: String,
	max_quantity: int,
	p_requires_confirm: bool,
	p_hint_dx: float = 0.0,
	p_hint_dy: float = 0.0,
) -> bool:
	if p_instance_id.is_empty() or max_quantity < 1:
		return false
	instance_id = p_instance_id
	hint_dx = p_hint_dx
	hint_dy = p_hint_dy
	requires_confirm = p_requires_confirm
	_spin.min_value = 1
	_spin.max_value = max_quantity
	_spin.value = max_quantity
	_title.text = "Drop Item (1–%s)" % str(max_quantity)
	_warning.visible = p_requires_confirm
	_confirm_check.visible = p_requires_confirm
	_confirm_check.button_pressed = false
	_drop_button.disabled = p_requires_confirm
	visible = true
	_spin.grab_focus()
	return true


func close_dialog() -> void:
	visible = false
	cancelled.emit()


func selected_quantity() -> int:
	return int(_spin.value)


func _on_confirm_toggled(pressed: bool) -> void:
	if _drop_button == null:
		return
	_drop_button.disabled = requires_confirm and not pressed


func _on_confirm() -> void:
	if requires_confirm and (_confirm_check == null or not _confirm_check.button_pressed):
		return
	var quantity := selected_quantity()
	visible = false
	confirmed.emit(quantity)


func _unhandled_input(event: InputEvent) -> void:
	if not visible:
		return
	if event.is_action_pressed("ui_cancel"):
		close_dialog()
		get_viewport().set_input_as_handled()
