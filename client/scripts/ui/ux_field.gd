class_name UxField
extends VBoxContainer

## Labeled text/email/password/code field with inline validation. Presentation only.

enum Kind { TEXT, EMAIL, PASSWORD, CODE }

signal submitted(value: String)
signal value_changed(value: String)

var kind: Kind = Kind.TEXT
var _label: Label
var _row: HBoxContainer
var edit: LineEdit
var _toggle: Button
var _hint: Label
var _error: Label
var _show_secret: bool = false


func _ready() -> void:
	if edit != null:
		return
	add_theme_constant_override("separation", DesignTokens.SPACE_XS)
	_label = Label.new()
	_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_row = HBoxContainer.new()
	_row.add_theme_constant_override("separation", DesignTokens.SPACE_SM)
	edit = LineEdit.new()
	edit.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	edit.text_changed.connect(_on_text_changed)
	edit.text_submitted.connect(func(value: String) -> void: submitted.emit(value))
	_toggle = Button.new()
	_toggle.text = "Show"
	_toggle.visible = false
	_toggle.pressed.connect(_on_toggle)
	ShellTheme.style_secondary(_toggle)
	_row.add_child(edit)
	_row.add_child(_toggle)
	_hint = Label.new()
	_hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_hint.add_theme_font_size_override("font_size", DesignTokens.FONT_CAPTION)
	_hint.add_theme_color_override("font_color", DesignTokens.TEXT_MUTED)
	_error = Label.new()
	_error.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_error.add_theme_color_override("font_color", DesignTokens.ERROR)
	add_child(_label)
	add_child(_row)
	add_child(_hint)
	add_child(_error)
	configure(kind, _label.text if _label != null else "Field")


func configure(next_kind: Kind, title: String, placeholder: String = "") -> void:
	kind = next_kind
	if _label == null:
		_ready()
	_label.text = title
	edit.placeholder_text = placeholder if not placeholder.is_empty() else title
	_toggle.visible = kind == Kind.PASSWORD
	match kind:
		Kind.EMAIL:
			ShellTheme.style_field(edit, "email")
		Kind.PASSWORD:
			ShellTheme.style_field(edit, "password")
			edit.secret = not _show_secret
		Kind.CODE:
			ShellTheme.style_field(edit, "text")
			CodeFormatter.configure_edit(edit)
			if not edit.gui_input.is_connected(_on_code_gui_input):
				edit.gui_input.connect(_on_code_gui_input)
		_:
			ShellTheme.style_field(edit, "text")
	_set_accessible(title)


func set_hint(text_value: String) -> void:
	if _hint != null:
		_hint.text = text_value


func set_error(text_value: String) -> void:
	if _error != null:
		_error.text = text_value
	ShellTheme.mark_error(edit, not text_value.is_empty())


func get_value() -> String:
	if edit == null:
		return ""
	if kind == Kind.CODE:
		return CodeFormatter.normalize(edit.text)
	return edit.text


func _on_text_changed(value: String) -> void:
	if kind == Kind.CODE:
		CodeFormatter.apply_to_edit(edit)
		value_changed.emit(CodeFormatter.normalize(edit.text))
		return
	value_changed.emit(value)


func _on_toggle() -> void:
	_show_secret = not _show_secret
	edit.secret = not _show_secret
	_toggle.text = "Hide" if _show_secret else "Show"


func _on_code_gui_input(event: InputEvent) -> void:
	if CodeFormatter.handle_gui_paste(edit, event):
		value_changed.emit(CodeFormatter.normalize(edit.text))


func _set_accessible(title: String) -> void:
	if edit == null:
		return
	edit.tooltip_text = title
	if "accessibility_name" in edit:
		edit.set("accessibility_name", title)
