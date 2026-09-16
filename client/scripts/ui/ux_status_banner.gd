class_name UxStatusBanner
extends PanelContainer

## Status / maintenance / update banner. Presentation only.

enum Tone { INFO, SUCCESS, WARNING, ERROR }

var _label: Label


func _ready() -> void:
	if _label != null:
		return
	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", DesignTokens.SPACE_MD)
	margin.add_theme_constant_override("margin_right", DesignTokens.SPACE_MD)
	margin.add_theme_constant_override("margin_top", DesignTokens.SPACE_SM)
	margin.add_theme_constant_override("margin_bottom", DesignTokens.SPACE_SM)
	_label = Label.new()
	_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	margin.add_child(_label)
	add_child(margin)
	visible = false


func show_message(text_value: String, tone: Tone = Tone.INFO) -> void:
	if _label == null:
		_ready()
	_label.text = text_value
	visible = not text_value.is_empty()
	var bg := DesignTokens.BANNER_INFO
	match tone:
		Tone.SUCCESS:
			bg = DesignTokens.BANNER_SUCCESS
		Tone.WARNING:
			bg = DesignTokens.BANNER_WARN
		Tone.ERROR:
			bg = DesignTokens.BANNER_ERROR
		_:
			bg = DesignTokens.BANNER_INFO
	var box := StyleBoxFlat.new()
	box.bg_color = bg
	box.border_color = DesignTokens.FOCUS if tone == Tone.WARNING else DesignTokens.BORDER
	box.set_border_width_all(1)
	box.set_corner_radius_all(6)
	add_theme_stylebox_override("panel", box)
	if "accessibility_name" in self:
		set("accessibility_name", "Status: %s" % text_value)


func clear() -> void:
	show_message("", Tone.INFO)
