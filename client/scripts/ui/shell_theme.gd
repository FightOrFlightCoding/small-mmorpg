class_name ShellTheme
extends RefCounted

## Builds the project-owned shell Theme. Does not grant gameplay authority.

static var _cached: Theme


static func shared() -> Theme:
	if _cached == null:
		_cached = make_theme()
	return _cached


static func apply(control: Control) -> void:
	if control == null:
		return
	control.theme = shared()


static func make_theme() -> Theme:
	var theme := Theme.new()
	theme.set_default_font_size(DesignTokens.FONT_BODY)
	theme.set_constant("separation", "VBoxContainer", DesignTokens.SPACE_MD)
	theme.set_constant("separation", "HBoxContainer", DesignTokens.SPACE_SM)
	theme.set_constant("margin_left", "MarginContainer", DesignTokens.MARGIN_PAGE)
	theme.set_constant("margin_top", "MarginContainer", DesignTokens.SPACE_LG)
	theme.set_constant("margin_right", "MarginContainer", DesignTokens.MARGIN_PAGE)
	theme.set_constant("margin_bottom", "MarginContainer", DesignTokens.SPACE_LG)
	theme.set_color("font_color", "Label", DesignTokens.TEXT)
	theme.set_color("font_shadow_color", "Label", Color(0, 0, 0, 0))
	theme.set_font_size("font_size", "Label", DesignTokens.FONT_BODY)
	_style_button(theme, "Button", DesignTokens.ACCENT, DesignTokens.ACCENT_HOVER, DesignTokens.ACCENT_PRESSED, DesignTokens.TEXT)
	_style_button(theme, "PrimaryButton", DesignTokens.ACCENT, DesignTokens.ACCENT_HOVER, DesignTokens.ACCENT_PRESSED, DesignTokens.TEXT)
	theme.set_type_variation("PrimaryButton", "Button")
	_style_button(theme, "SecondaryButton", DesignTokens.SECONDARY, DesignTokens.SECONDARY_HOVER, DesignTokens.SECONDARY_PRESSED, DesignTokens.TEXT)
	theme.set_type_variation("SecondaryButton", "Button")
	_style_button(theme, "DestructiveButton", DesignTokens.DESTRUCTIVE, DesignTokens.DESTRUCTIVE_HOVER, DesignTokens.DESTRUCTIVE_PRESSED, DesignTokens.TEXT)
	theme.set_type_variation("DestructiveButton", "Button")
	_style_line_edit(theme)
	_style_checkbox(theme)
	_style_panel(theme)
	return theme


static func style_primary(button: Button) -> void:
	if button == null:
		return
	button.theme_type_variation = "PrimaryButton"
	button.focus_mode = Control.FOCUS_ALL


static func style_secondary(button: Button) -> void:
	if button == null:
		return
	button.theme_type_variation = "SecondaryButton"
	button.focus_mode = Control.FOCUS_ALL


static func style_destructive(button: Button, click_only: bool = false) -> void:
	if button == null:
		return
	button.theme_type_variation = "DestructiveButton"
	button.focus_mode = Control.FOCUS_CLICK if click_only else Control.FOCUS_ALL


static func style_field(edit: LineEdit, kind: String = "text") -> void:
	if edit == null:
		return
	edit.focus_mode = Control.FOCUS_ALL
	edit.caret_blink = true
	edit.secret = kind == "password"
	if kind == "email":
		edit.virtual_keyboard_type = LineEdit.KEYBOARD_TYPE_EMAIL_ADDRESS
	elif kind == "password":
		edit.secret = true
		edit.virtual_keyboard_type = LineEdit.KEYBOARD_TYPE_PASSWORD
	edit.clip_contents = true
	_set_accessible(edit, kind.capitalize() + " field")


static func mark_error(edit: LineEdit, on: bool) -> void:
	if edit == null:
		return
	if on:
		edit.add_theme_color_override("font_color", DesignTokens.ERROR)
		edit.add_theme_constant_override("caret_width", 2)
	else:
		edit.remove_theme_color_override("font_color")
		edit.remove_theme_constant_override("caret_width")


static func _style_button(theme: Theme, type_name: String, normal_bg: Color, hover_bg: Color, pressed_bg: Color, font_color: Color) -> void:
	theme.set_stylebox("normal", type_name, _box(normal_bg, DesignTokens.BORDER, 6))
	theme.set_stylebox("hover", type_name, _box(hover_bg, DesignTokens.FOCUS, 6))
	theme.set_stylebox("pressed", type_name, _box(pressed_bg, DesignTokens.FOCUS, 6))
	theme.set_stylebox("disabled", type_name, _box(DesignTokens.DISABLED_BG, DesignTokens.BORDER, 6))
	theme.set_stylebox("focus", type_name, _box(hover_bg, DesignTokens.FOCUS, 6, DesignTokens.FOCUS_WIDTH + 1))
	theme.set_color("font_color", type_name, font_color)
	theme.set_color("font_hover_color", type_name, font_color)
	theme.set_color("font_pressed_color", type_name, font_color)
	theme.set_color("font_disabled_color", type_name, DesignTokens.DISABLED_TEXT)
	theme.set_color("font_focus_color", type_name, font_color)
	theme.set_constant("h_separation", type_name, DesignTokens.SPACE_SM)
	theme.set_font_size("font_size", type_name, DesignTokens.FONT_BODY)


static func _style_line_edit(theme: Theme) -> void:
	theme.set_stylebox("normal", "LineEdit", _box(DesignTokens.SURFACE, DesignTokens.BORDER, 4))
	theme.set_stylebox("focus", "LineEdit", _box(DesignTokens.SURFACE_RAISED, DesignTokens.FOCUS, 4, DesignTokens.FOCUS_WIDTH + 1))
	theme.set_stylebox("read_only", "LineEdit", _box(DesignTokens.DISABLED_BG, DesignTokens.BORDER, 4))
	theme.set_color("font_color", "LineEdit", DesignTokens.TEXT)
	theme.set_color("font_uneditable_color", "LineEdit", DesignTokens.DISABLED_TEXT)
	theme.set_color("font_placeholder_color", "LineEdit", DesignTokens.TEXT_MUTED)
	theme.set_color("caret_color", "LineEdit", DesignTokens.FOCUS)
	theme.set_color("selection_color", "LineEdit", Color(DesignTokens.ACCENT.r, DesignTokens.ACCENT.g, DesignTokens.ACCENT.b, 0.35))
	theme.set_font_size("font_size", "LineEdit", DesignTokens.FONT_BODY)


static func _style_checkbox(theme: Theme) -> void:
	theme.set_color("font_color", "CheckBox", DesignTokens.TEXT)
	theme.set_color("font_hover_color", "CheckBox", DesignTokens.TEXT)
	theme.set_color("font_pressed_color", "CheckBox", DesignTokens.TEXT)
	theme.set_color("font_disabled_color", "CheckBox", DesignTokens.DISABLED_TEXT)
	theme.set_color("font_focus_color", "CheckBox", DesignTokens.FOCUS)
	theme.set_font_size("font_size", "CheckBox", DesignTokens.FONT_BODY)


static func _style_panel(theme: Theme) -> void:
	theme.set_stylebox("panel", "PanelContainer", _box(DesignTokens.SURFACE, DesignTokens.BORDER, 8))
	theme.set_stylebox("panel", "Panel", _box(DesignTokens.SURFACE, DesignTokens.BORDER, 8))


static func _box(bg: Color, border: Color, radius: int = 4, border_width: int = 1) -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = bg
	box.border_color = border
	box.set_border_width_all(border_width)
	box.set_corner_radius_all(radius)
	box.content_margin_left = DesignTokens.SPACE_MD
	box.content_margin_right = DesignTokens.SPACE_MD
	box.content_margin_top = DesignTokens.SPACE_SM
	box.content_margin_bottom = DesignTokens.SPACE_SM
	return box


static func _set_accessible(control: Control, name: String) -> void:
	if control == null or name.is_empty():
		return
	control.tooltip_text = name
	if "accessibility_name" in control:
		control.set("accessibility_name", name)
