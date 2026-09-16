class_name UxCountdownBadge
extends Label

## Server-authoritative remaining-time badge. Does not invent timers.


func set_seconds(seconds: int, prefix: String = "Available in") -> void:
	if seconds <= 0:
		text = ""
		visible = false
		return
	text = "%s %s seconds" % [prefix, str(seconds)]
	visible = true
	add_theme_color_override("font_color", DesignTokens.WARNING)
	if "accessibility_name" in self:
		set("accessibility_name", text)
