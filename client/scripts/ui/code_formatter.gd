class_name CodeFormatter
extends RefCounted

## Formats one verification/reset code field. Paste is accepted; grouping is presentation only.


static func normalize(raw: String) -> String:
	var compact := ""
	for i in raw.length():
		var ch := raw.substr(i, 1)
		if ch == " " or ch == "-" or ch == "_":
			continue
		compact += ch.to_upper()
	return compact.strip_edges()


static func grouped(raw: String, group_size: int = 3) -> String:
	var compact := normalize(raw)
	if compact.is_empty():
		return ""
	if group_size <= 0 or compact.length() <= group_size:
		return compact
	var parts: PackedStringArray = PackedStringArray()
	var i := 0
	while i < compact.length():
		parts.append(compact.substr(i, group_size))
		i += group_size
	return " ".join(parts)


static func apply_to_edit(edit: LineEdit) -> void:
	if edit == null:
		return
	var caret := edit.caret_column
	var formatted := grouped(edit.text)
	if edit.text == formatted:
		return
	edit.text = formatted
	edit.caret_column = mini(caret, formatted.length())
