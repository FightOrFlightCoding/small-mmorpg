class_name UxModal
extends ColorRect

## Blocking modal shell. Parent fills content and handles actions.

signal dismissed

var panel: PanelContainer
var body: VBoxContainer


func _ready() -> void:
	color = Color(0, 0, 0, 0.55)
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	visible = false
	panel = PanelContainer.new()
	panel.set_anchors_preset(Control.PRESET_CENTER)
	panel.offset_left = -260
	panel.offset_top = -160
	panel.offset_right = 260
	panel.offset_bottom = 160
	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", DesignTokens.SPACE_LG)
	margin.add_theme_constant_override("margin_right", DesignTokens.SPACE_LG)
	margin.add_theme_constant_override("margin_top", DesignTokens.SPACE_LG)
	margin.add_theme_constant_override("margin_bottom", DesignTokens.SPACE_LG)
	body = VBoxContainer.new()
	body.add_theme_constant_override("separation", DesignTokens.SPACE_MD)
	margin.add_child(body)
	panel.add_child(margin)
	add_child(panel)


func present() -> void:
	visible = true
	var focus := _first_focusable()
	if focus != null:
		focus.grab_focus()


func hide_modal() -> void:
	visible = false
	dismissed.emit()


func _unhandled_input(event: InputEvent) -> void:
	if not visible:
		return
	if event.is_action_pressed("ui_cancel"):
		hide_modal()
		get_viewport().set_input_as_handled()


func _first_focusable() -> Control:
	if body == null:
		return null
	for child in body.get_children():
		if child is Control and (child as Control).focus_mode != Control.FOCUS_NONE and (child as Control).visible:
			return child as Control
	return null
