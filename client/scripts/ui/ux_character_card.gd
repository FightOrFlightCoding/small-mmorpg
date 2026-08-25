class_name UxCharacterCard
extends PanelContainer

## Live character card. Play and Delete emit signals; the parent calls GameService.

signal play_pressed(character_id: String)
signal delete_pressed(character_id: String)

var character_id: String = ""
var play_button: Button
var delete_button: Button
var _box: VBoxContainer
var _name: Label
var _class: Label
var _glyph: Label
var _level: Label
var _location: Label
var _played: Label
var _presence: Label
var _reason: Label
var _countdown: UxCountdownBadge


func _ready() -> void:
	if _box != null:
		return
	custom_minimum_size = Vector2(140, 220)
	size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_box = VBoxContainer.new()
	_box.add_theme_constant_override("separation", DesignTokens.SPACE_XS)
	_glyph = Label.new()
	_glyph.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_glyph.add_theme_font_size_override("font_size", DesignTokens.FONT_GLYPH)
	_name = Label.new()
	_name.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_name.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_class = Label.new()
	_class.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_class.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_level = Label.new()
	_level.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_location = Label.new()
	_location.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_location.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_played = Label.new()
	_played.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_played.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_presence = Label.new()
	_presence.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_reason = Label.new()
	_reason.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_reason.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_countdown = UxCountdownBadge.new()
	_countdown.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	play_button = Button.new()
	play_button.text = "Play"
	ShellTheme.style_primary(play_button)
	play_button.pressed.connect(func() -> void: play_pressed.emit(character_id))
	delete_button = Button.new()
	delete_button.text = "Delete"
	ShellTheme.style_destructive(delete_button)
	delete_button.pressed.connect(func() -> void: delete_pressed.emit(character_id))
	_box.add_child(_glyph)
	_box.add_child(_name)
	_box.add_child(_class)
	_box.add_child(_level)
	_box.add_child(_location)
	_box.add_child(_played)
	_box.add_child(_presence)
	_box.add_child(_reason)
	_box.add_child(_countdown)
	_box.add_child(play_button)
	_box.add_child(delete_button)
	add_child(_box)


func bind(row: Dictionary, play_reason: String, play_busy: bool, remain_seconds: int = 0) -> void:
	if _box == null:
		_ready()
	character_id = String(row.get("characterId", ""))
	var class_id := String(row.get("classId", ""))
	var presentation := ClassPresentation.for_id(class_id)
	_glyph.text = String(presentation.get("glyph", "?"))
	_name.text = String(row.get("displayName", row.get("name", "?")))
	_class.text = String(presentation.get("display_name", class_id))
	_level.text = "Level %s" % str(int(row.get("level", 1)))
	play_button.disabled = not play_reason.is_empty() or play_busy
	play_button.tooltip_text = play_reason.replace("\n", " — ") if not play_reason.is_empty() else "Play %s" % _name.text
	_reason.text = play_reason
	_reason.visible = not play_reason.is_empty()
	if remain_seconds > 0:
		_countdown.set_seconds(remain_seconds)
	else:
		_countdown.set_seconds(0)
	if "accessibility_name" in self:
		set("accessibility_name", "%s, %s, level %s" % [_name.text, _class.text, str(int(row.get("level", 1)))])


func set_location(text_value: String) -> void:
	if _location != null:
		_location.text = text_value


func set_played(text_value: String) -> void:
	if _played != null:
		_played.text = text_value


func set_presence(text_value: String) -> void:
	if _presence != null:
		_presence.text = text_value
