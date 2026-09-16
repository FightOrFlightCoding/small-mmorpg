class_name CodeFormatter
extends RefCounted

## Formats one verification/reset/deletion challenge code. Emails send
## grouped base32 `XXXX-XXXX-XXXX-XXXX`; grouping is presentation only.

const COMPACT_LENGTH := 16
const GROUP_SIZE := 4
const SEPARATOR := "-"
const PLACEHOLDER := "XXXX-XXXX-XXXX-XXXX"
const DISPLAY_LENGTH := 19


static func compact_chars(raw: String) -> String:
	var compact := ""
	for i in raw.length():
		var ch := raw.substr(i, 1).to_upper()
		if ch.is_empty():
			continue
		var code := ch.unicode_at(0)
		var is_digit := code >= 48 and code <= 57
		var is_letter := code >= 65 and code <= 90
		if is_digit or is_letter:
			compact += ch
	return compact


static func normalize(raw: String) -> String:
	var compact := compact_chars(raw)
	if compact.length() > COMPACT_LENGTH:
		return compact.substr(0, COMPACT_LENGTH)
	return compact


static func grouped(raw: String, group_size: int = GROUP_SIZE) -> String:
	var compact := normalize(raw)
	if compact.is_empty():
		return ""
	var size := group_size
	if size <= 0:
		size = GROUP_SIZE
	if compact.length() <= size:
		return compact
	var parts: PackedStringArray = PackedStringArray()
	var i := 0
	while i < compact.length():
		parts.append(compact.substr(i, size))
		i += size
	return SEPARATOR.join(parts)


static func apply_to_edit(edit: LineEdit) -> void:
	if edit == null:
		return
	_ensure_edit_limits(edit)
	var caret := edit.caret_column
	var compact_before := mini(compact_chars(edit.text.substr(0, caret)).length(), COMPACT_LENGTH)
	var formatted := grouped(edit.text)
	if edit.text != formatted:
		edit.text = formatted
	edit.caret_column = _caret_after_compact(formatted, compact_before)


static func handle_gui_paste(edit: LineEdit, event: InputEvent) -> bool:
	if edit == null or not _is_paste_event(event):
		return false
	edit.accept_event()
	var pasted := DisplayServer.clipboard_get().strip_edges()
	if pasted.is_empty():
		return true
	_ensure_edit_limits(edit)
	edit.text = grouped(pasted)
	edit.caret_column = edit.text.length()
	return true


static func configure_edit(edit: LineEdit) -> void:
	if edit == null:
		return
	edit.placeholder_text = PLACEHOLDER
	edit.secret = false
	_ensure_edit_limits(edit)


static func _ensure_edit_limits(edit: LineEdit) -> void:
	if edit.max_length != DISPLAY_LENGTH:
		edit.max_length = DISPLAY_LENGTH


static func _is_paste_event(event: InputEvent) -> bool:
	if event == null or not event.is_pressed() or event.is_echo():
		return false
	if event.is_action("ui_paste", true):
		return true
	if event is InputEventKey:
		var key := event as InputEventKey
		if key.keycode == KEY_V and (key.ctrl_pressed or key.meta_pressed):
			return true
		if key.keycode == KEY_INSERT and key.shift_pressed:
			return true
	return false


static func _caret_after_compact(formatted: String, compact_count: int) -> int:
	if compact_count <= 0:
		return 0
	var seen := 0
	for i in formatted.length():
		var ch := formatted.substr(i, 1)
		if ch == SEPARATOR or ch == " " or ch == "_":
			continue
		seen += 1
		if seen >= compact_count:
			return i + 1
	return formatted.length()
