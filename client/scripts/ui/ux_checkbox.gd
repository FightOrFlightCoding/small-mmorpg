class_name UxCheckbox
extends CheckBox

## Project-owned checkbox with visible focus. Starts unchecked unless configured.


func _ready() -> void:
	focus_mode = Control.FOCUS_ALL
	if "accessibility_name" in self:
		set("accessibility_name", text)
