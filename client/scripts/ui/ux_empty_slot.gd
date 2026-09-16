class_name UxEmptySlot
extends PanelContainer

## Empty character slot card. Does not create characters.


func _ready() -> void:
	custom_minimum_size = Vector2(140, 220)
	size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var box := VBoxContainer.new()
	box.alignment = BoxContainer.ALIGNMENT_CENTER
	var glyph := Label.new()
	glyph.text = "+"
	glyph.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	glyph.add_theme_font_size_override("font_size", DesignTokens.FONT_GLYPH)
	var label := Label.new()
	label.text = "Empty slot"
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	box.add_child(glyph)
	box.add_child(label)
	add_child(box)
	if "accessibility_name" in self:
		set("accessibility_name", "Empty character slot")
