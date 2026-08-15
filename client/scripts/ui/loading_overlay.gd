extends CanvasLayer

@onready var _label: Label = $Panel/VBox/Message


func _ready() -> void:
	visible = false


func show_loading(reason: String) -> void:
	if _label != null:
		_label.text = "Loading (%s)" % reason
	visible = true


func hide_loading() -> void:
	visible = false
