class_name UxFormErrors
extends VBoxContainer

## Form-level error summary. Color is not the only error signal.

var _title: Label
var _list: Label


func _ready() -> void:
	if _title != null:
		return
	add_theme_constant_override("separation", DesignTokens.SPACE_XS)
	_title = Label.new()
	_title.text = "Fix the following:"
	_title.visible = false
	_title.add_theme_color_override("font_color", DesignTokens.ERROR)
	_list = Label.new()
	_list.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_list.visible = false
	add_child(_title)
	add_child(_list)


func set_errors(lines: PackedStringArray) -> void:
	if _title == null:
		_ready()
	var cleaned: PackedStringArray = PackedStringArray()
	for line in lines:
		if not String(line).strip_edges().is_empty():
			cleaned.append("• %s" % String(line).strip_edges())
	_title.visible = cleaned.size() > 0
	_list.visible = cleaned.size() > 0
	_list.text = "\n".join(cleaned)
	if "accessibility_name" in self:
		set("accessibility_name", "Form errors")


func clear() -> void:
	set_errors(PackedStringArray())
