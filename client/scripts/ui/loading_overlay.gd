extends CanvasLayer

signal cancel_pressed

@onready var _label: Label = $Panel/VBox/Message
@onready var _cancel: Button = $Panel/VBox/CancelButton


func _ready() -> void:
	visible = false
	if _cancel != null:
		_cancel.pressed.connect(func() -> void: cancel_pressed.emit())
		_cancel.visible = false


func show_loading(reason: String) -> void:
	if _label != null:
		if reason == "reconnect":
			_label.text = "Reconnecting…"
		elif reason == "logout":
			_label.text = "Leaving…"
		else:
			_label.text = "Loading (%s)" % reason
	if _cancel != null:
		_cancel.visible = reason == "reconnect"
	visible = true


func hide_loading() -> void:
	if _cancel != null:
		_cancel.visible = false
	visible = false
