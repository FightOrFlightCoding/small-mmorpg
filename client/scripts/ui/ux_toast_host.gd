class_name UxToastHost
extends CanvasLayer

## Visual toast for NotificationService copy. Never grants items or gold.


func _ready() -> void:
	layer = 80
	WindowManager.connect_once(NotificationService.notice_pushed, _on_notice)


func _exit_tree() -> void:
	if NotificationService.notice_pushed.is_connected(_on_notice):
		NotificationService.notice_pushed.disconnect(_on_notice)


func _on_notice(message: String) -> void:
	if message.is_empty():
		return
	var panel := PanelContainer.new()
	panel.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	panel.offset_left = -420
	panel.offset_top = 16
	panel.offset_right = -16
	panel.offset_bottom = 72
	var label := Label.new()
	label.text = message
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", DesignTokens.SPACE_MD)
	margin.add_theme_constant_override("margin_right", DesignTokens.SPACE_MD)
	margin.add_theme_constant_override("margin_top", DesignTokens.SPACE_SM)
	margin.add_theme_constant_override("margin_bottom", DesignTokens.SPACE_SM)
	margin.add_child(label)
	panel.add_child(margin)
	add_child(panel)
	var timer := get_tree().create_timer(4.0)
	timer.timeout.connect(func() -> void:
		if is_instance_valid(panel):
			panel.queue_free()
	)
