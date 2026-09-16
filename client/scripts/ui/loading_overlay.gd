extends CanvasLayer

signal cancel_pressed

@onready var _label: Label = $Panel/VBox/Message
@onready var _cancel: Button = $Panel/VBox/CancelButton

var _timeout: Timer
var _spinner: UxSpinner
var _timeout_label: Label
const TIMEOUT_SEC := 12.0


func _ready() -> void:
	visible = false
	if _cancel != null:
		_cancel.pressed.connect(func() -> void: cancel_pressed.emit())
		_cancel.visible = false
	var host := $Panel/VBox
	_spinner = UxSpinner.new()
	_spinner.name = "Spinner"
	_spinner.visible = false
	host.add_child(_spinner)
	host.move_child(_spinner, 0)
	_timeout_label = Label.new()
	_timeout_label.name = "TimeoutLabel"
	_timeout_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_timeout_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_timeout_label.visible = false
	host.add_child(_timeout_label)
	_timeout = Timer.new()
	_timeout.one_shot = true
	_timeout.wait_time = TIMEOUT_SEC
	_timeout.timeout.connect(_on_timeout)
	add_child(_timeout)


func show_loading(reason: String) -> void:
	if _label != null:
		if reason == "reconnect":
			_label.text = "Connection lost"
		elif reason == "logout":
			_label.text = "Logging out"
		elif reason == "return":
			_label.text = "Returning to Character Select"
		elif reason == "zone":
			_label.text = "Entering world"
		elif reason == "transfer":
			_label.text = "Transferring…"
		elif reason == "server":
			_label.text = "Server unavailable"
		else:
			_label.text = "Loading (%s)" % reason
	if _cancel != null:
		_cancel.visible = reason == "reconnect"
	if _spinner != null:
		_spinner.set_active(true)
	if _timeout_label != null:
		_timeout_label.visible = false
		_timeout_label.text = ""
	if _timeout != null:
		_timeout.start()
	visible = true


func hide_loading() -> void:
	if _cancel != null:
		_cancel.visible = false
	if _spinner != null:
		_spinner.set_active(false)
	if _timeout != null:
		_timeout.stop()
	if _timeout_label != null:
		_timeout_label.visible = false
	visible = false


func _on_timeout() -> void:
	if not visible:
		return
	if _timeout_label != null:
		_timeout_label.visible = true
		_timeout_label.text = "This is taking longer than expected. You can wait or cancel and try again."
