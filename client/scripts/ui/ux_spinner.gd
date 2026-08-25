class_name UxSpinner
extends Control

## Indeterminate loading spinner. Pair with timeout copy; never spin forever.

var _angle: float = 0.0
var active: bool = false


func _ready() -> void:
	custom_minimum_size = Vector2(28, 28)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	if "accessibility_name" in self:
		set("accessibility_name", "Loading")


func set_active(on: bool) -> void:
	active = on
	visible = on
	set_process(on)


func _process(delta: float) -> void:
	if not active:
		return
	_angle += delta * 4.0
	queue_redraw()


func _draw() -> void:
	var center := size * 0.5
	var radius := minf(size.x, size.y) * 0.38
	draw_arc(center, radius, _angle, _angle + TAU * 0.72, 24, DesignTokens.ACCENT, 3.0, true)
