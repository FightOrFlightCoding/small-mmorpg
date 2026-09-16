class_name UxClassCard
extends Button

## Class selection card. Identity uses glyph, shape, and name — not color alone.

signal class_chosen(class_id: String)

var class_id: String = ""


func configure(id: String) -> void:
	class_id = id
	set_meta("class_id", id)
	toggle_mode = true
	size_flags_horizontal = Control.SIZE_EXPAND_FILL
	size_flags_vertical = Control.SIZE_EXPAND_FILL
	custom_minimum_size = Vector2(188, 320)
	focus_mode = Control.FOCUS_ALL
	theme_type_variation = "SecondaryButton"
	for child in get_children():
		child.queue_free()
	var presentation := ClassPresentation.for_id(id)
	var box := VBoxContainer.new()
	box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	box.add_theme_constant_override("separation", DesignTokens.SPACE_SM)
	var glyph := Label.new()
	glyph.name = "Glyph"
	glyph.text = String(presentation.get("glyph", "?"))
	glyph.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	glyph.add_theme_font_size_override("font_size", DesignTokens.FONT_GLYPH)
	glyph.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var shape := Label.new()
	shape.name = "Shape"
	shape.text = String(presentation.get("shape", ""))
	shape.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	shape.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	shape.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var theme := Label.new()
	theme.name = "Theme"
	theme.text = String(presentation.get("theme", ""))
	theme.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	theme.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	theme.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var title := Label.new()
	title.name = "Title"
	title.text = String(presentation.get("display_name", id))
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", DesignTokens.FONT_HEADING)
	title.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var role := Label.new()
	role.name = "Role"
	role.text = String(presentation.get("role", ""))
	role.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	role.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	role.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var resource := Label.new()
	resource.name = "ResourceType"
	resource.text = "Resource: %s" % String(presentation.get("resource_type", ""))
	resource.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	resource.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	resource.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var summary := Label.new()
	summary.name = "Summary"
	summary.text = String(presentation.get("summary", ""))
	summary.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	summary.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	summary.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var cannot_change := Label.new()
	cannot_change.name = "CannotChange"
	cannot_change.text = String(presentation.get("cannot_change", ""))
	cannot_change.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	cannot_change.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	cannot_change.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var disclaimer := Label.new()
	disclaimer.name = "Disclaimer"
	disclaimer.text = String(presentation.get("disclaimer", ""))
	disclaimer.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	disclaimer.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	disclaimer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	box.add_child(glyph)
	box.add_child(shape)
	box.add_child(theme)
	box.add_child(title)
	box.add_child(role)
	box.add_child(resource)
	box.add_child(summary)
	box.add_child(cannot_change)
	box.add_child(disclaimer)
	add_child(box)
	if not pressed.is_connected(_on_pressed):
		pressed.connect(_on_pressed)
	tooltip_text = "%s. %s. Resource: %s. Shape: %s. Theme: %s. %s" % [
		String(presentation.get("display_name", "")),
		String(presentation.get("role", "")),
		String(presentation.get("resource_type", "")),
		String(presentation.get("shape", "")),
		String(presentation.get("theme", "")),
		String(presentation.get("cannot_change", "")),
	]
	if "accessibility_name" in self:
		set("accessibility_name", tooltip_text)


func _on_pressed() -> void:
	class_chosen.emit(class_id)
