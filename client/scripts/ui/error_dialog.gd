extends CanvasLayer

@onready var _title: Label = $Panel/VBox/Title
@onready var _message: Label = $Panel/VBox/Message
@onready var _dismiss: Button = $Panel/VBox/DismissButton

var _fatal: bool = false


func _ready() -> void:
	visible = false
	_dismiss.pressed.connect(_on_dismiss_pressed)


func show_error(title: String, message: String, fatal: bool) -> void:
	_fatal = fatal
	_title.text = title
	_message.text = message
	_dismiss.visible = not fatal
	visible = true
	if fatal:
		WindowManager.open(WindowManager.COMPATIBILITY)
	else:
		WindowManager.open(WindowManager.ERROR)


func hide_error() -> void:
	if _fatal:
		return
	visible = false
	WindowManager.close(WindowManager.ERROR)


func _on_dismiss_pressed() -> void:
	hide_error()
