extends Node

## Toast copy for shell and HUD. Never grants items or gold.

signal notice_pushed(message: String)

var lines: PackedStringArray = PackedStringArray()
var last_message: String = ""


func reset_for_tests() -> void:
	lines = PackedStringArray()
	last_message = ""


func push(message: String) -> void:
	if message.is_empty():
		return
	last_message = message
	lines.append(message)
	if lines.size() > 20:
		lines.remove_at(0)
	notice_pushed.emit(message)
