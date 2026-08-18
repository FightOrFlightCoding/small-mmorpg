class_name ChatPanel
extends CanvasLayer

## Zone chat presentation. User text is shown as plain Label text, never BBCode.

signal send_requested(text: String)

var _lines: PackedStringArray = PackedStringArray()

@onready var _history: Label = $Root/Panel/Margin/VBox/Scroll/History
@onready var _scroll: ScrollContainer = $Root/Panel/Margin/VBox/Scroll
@onready var _status: Label = $Root/Panel/Margin/VBox/Status
@onready var _input: LineEdit = $Root/Panel/Margin/VBox/Row/Input
@onready var _send: Button = $Root/Panel/Margin/VBox/Row/SendButton


func _ready() -> void:
	_send.pressed.connect(_emit_send)
	_input.text_submitted.connect(func(_text: String) -> void: _emit_send())
	_input.max_length = ZoneChat.MAX_CHARS
	_history.text = ""
	_status.text = ""


func has_input_focus() -> bool:
	return _input != null and _input.has_focus()


func history_text() -> String:
	return _history.text if _history != null else ""


func history_line_count() -> int:
	return _lines.size()


func status_text() -> String:
	return _status.text if _status != null else ""


func set_status(message: String) -> void:
	if _status != null:
		_status.text = message


func clear_history() -> void:
	_lines = PackedStringArray()
	_refresh_history()


func append_line(line: String) -> void:
	_lines.append(line)
	_lines = ZoneChat.cap_history(_lines)
	_refresh_history()
	_scroll_to_end()


func append_chat(sender: String, body: String, timestamp_raw: String) -> void:
	append_line(ZoneChat.format_line(ZoneChat.format_timestamp(timestamp_raw), sender, body))


func append_presence(username: String, joined: bool) -> void:
	append_line(ZoneChat.format_presence(ZoneChat.format_timestamp(""), username, joined))


func grab_chat_focus() -> void:
	if _input != null:
		_input.grab_focus()


func release_chat_focus() -> void:
	if _input != null and _input.has_focus():
		_input.release_focus()


func _unhandled_input(event: InputEvent) -> void:
	if not (event is InputEventKey):
		return
	var key := event as InputEventKey
	if not key.pressed or key.echo:
		return
	if key.keycode == KEY_ESCAPE and has_input_focus():
		release_chat_focus()
		get_viewport().set_input_as_handled()
		return
	if event.is_action_pressed("chat_focus") and not has_input_focus():
		grab_chat_focus()
		get_viewport().set_input_as_handled()
		return
	if (key.keycode == KEY_ENTER or key.keycode == KEY_KP_ENTER) and not has_input_focus():
		grab_chat_focus()
		get_viewport().set_input_as_handled()


func _emit_send() -> void:
	if _input == null:
		return
	var text := _input.text
	var reason := ZoneChat.reject_reason(text)
	if not reason.is_empty():
		if reason == "empty_message":
			set_status("Message is empty.")
		elif reason == "message_too_long":
			set_status("Message is too long.")
		else:
			set_status("Could not send chat.")
		return
	set_status("")
	_input.clear()
	send_requested.emit(ZoneChat.normalize_text(text))


func _refresh_history() -> void:
	if _history == null:
		return
	_history.text = "\n".join(_lines)


func _scroll_to_end() -> void:
	if _scroll == null:
		return
	await get_tree().process_frame
	_scroll.scroll_vertical = int(_scroll.get_v_scroll_bar().max_value)
