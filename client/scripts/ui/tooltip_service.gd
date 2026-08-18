extends Node

## Follows the cursor with clamped tooltip copy. Presentation only.

var _layer: CanvasLayer
var _label: Label
var _active: bool = false


func _ready() -> void:
	_layer = CanvasLayer.new()
	_layer.layer = 40
	_layer.visible = false
	add_child(_layer)
	var panel := PanelContainer.new()
	panel.name = "Tooltip"
	panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_layer.add_child(panel)
	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 8)
	margin.add_theme_constant_override("margin_top", 4)
	margin.add_theme_constant_override("margin_right", 8)
	margin.add_theme_constant_override("margin_bottom", 4)
	panel.add_child(margin)
	_label = Label.new()
	_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_label.custom_minimum_size = Vector2(80, 0)
	margin.add_child(_label)


func reset_for_tests() -> void:
	hide_tooltip()


func show_tooltip(text: String, at: Vector2 = Vector2.INF) -> void:
	if _label == null:
		return
	_label.text = text
	_active = not text.is_empty()
	_layer.visible = _active
	if _active:
		_place(at if at != Vector2.INF else _cursor())


func hide_tooltip() -> void:
	_active = false
	if _layer != null:
		_layer.visible = false


func is_visible() -> bool:
	return _active


func _process(_delta: float) -> void:
	if _active:
		_place(_cursor())


func _cursor() -> Vector2:
	var tree := get_tree()
	if tree == null:
		return Vector2.ZERO
	return tree.root.get_mouse_position()


func _place(at: Vector2) -> void:
	if _layer == null or _layer.get_child_count() == 0:
		return
	var panel := _layer.get_child(0) as Control
	if panel == null:
		return
	var viewport := get_viewport()
	var size := Vector2(1280, 720)
	if viewport != null:
		size = viewport.get_visible_rect().size
	panel.reset_size()
	var pos := at + Vector2(16, 16)
	var rect := panel.get_combined_minimum_size()
	pos.x = clampf(pos.x, 8.0, maxf(8.0, size.x - rect.x - 8.0))
	pos.y = clampf(pos.y, 8.0, maxf(8.0, size.y - rect.y - 8.0))
	panel.position = pos
