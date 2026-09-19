class_name SplitStackDialog
extends ColorRect

## Quantity selector for stack splits. Range is 1 .. source quantity - 1.

signal confirmed(quantity: int)
signal cancelled

var instance_id: String = ""
var dest_slot: int = -1

var _spin: SpinBox
var _title: Label


func _ready() -> void:
	color = Color(0, 0, 0, 0.55)
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	visible = false
	z_index = 20
	var panel := PanelContainer.new()
	panel.name = "Panel"
	panel.set_anchors_preset(Control.PRESET_CENTER)
	panel.offset_left = -140
	panel.offset_top = -90
	panel.offset_right = 140
	panel.offset_bottom = 90
	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", DesignTokens.SPACE_MD)
	margin.add_theme_constant_override("margin_right", DesignTokens.SPACE_MD)
	margin.add_theme_constant_override("margin_top", DesignTokens.SPACE_MD)
	margin.add_theme_constant_override("margin_bottom", DesignTokens.SPACE_MD)
	var body := VBoxContainer.new()
	body.add_theme_constant_override("separation", DesignTokens.SPACE_SM)
	_title = Label.new()
	_title.text = "Split Stack"
	body.add_child(_title)
	var hint := Label.new()
	hint.text = "Quantity to split off"
	hint.add_theme_color_override("font_color", DesignTokens.TEXT_MUTED)
	body.add_child(hint)
	_spin = SpinBox.new()
	_spin.min_value = 1
	_spin.max_value = 1
	_spin.step = 1
	_spin.rounded = true
	body.add_child(_spin)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", DesignTokens.SPACE_SM)
	var confirm := Button.new()
	confirm.text = "Split"
	confirm.pressed.connect(_on_confirm)
	row.add_child(confirm)
	var cancel := Button.new()
	cancel.text = "Cancel"
	cancel.pressed.connect(close_dialog)
	row.add_child(cancel)
	body.add_child(row)
	margin.add_child(body)
	panel.add_child(margin)
	add_child(panel)


func open_for(p_instance_id: String, max_quantity: int, p_dest_slot: int = -1) -> bool:
	if p_instance_id.is_empty() or max_quantity < 1:
		return false
	instance_id = p_instance_id
	dest_slot = p_dest_slot
	_spin.min_value = 1
	_spin.max_value = max_quantity
	_spin.value = 1
	_title.text = "Split Stack (1–%s)" % str(max_quantity)
	visible = true
	_spin.grab_focus()
	return true


func close_dialog() -> void:
	visible = false
	cancelled.emit()


func selected_quantity() -> int:
	return int(_spin.value)


func _on_confirm() -> void:
	var quantity := selected_quantity()
	visible = false
	confirmed.emit(quantity)


func _unhandled_input(event: InputEvent) -> void:
	if not visible:
		return
	if event.is_action_pressed("ui_cancel"):
		close_dialog()
		get_viewport().set_input_as_handled()
