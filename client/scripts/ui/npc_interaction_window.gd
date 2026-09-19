class_name NpcInteractionWindow
extends CanvasLayer

## Server-driven NPC dialogue window. Presentation only.

signal option_chosen(option_id: String)
signal service_chosen(service_id: String)
signal close_requested
signal loading_timed_out

const SERVICE_LABELS := {
	"quest_offer": "Accept quest",
	"quest_turn_in": "Turn in quest",
	"vendor": "Browse goods",
	"inn": "Inn services",
	"healer": "Request healing",
	"cave_entrance": "Enter cave",
	"cave_exit": "Leave instance",
	"respec": "Respec",
}

var npc_id: String = ""
var session_id: String = ""
var current_node_id: String = ""

var _root: PanelContainer
var _name_label: Label
var _body: Label
var _status: Label
var _options: VBoxContainer
var _services: VBoxContainer
var _close: Button
var _loading: bool = false
var _loading_started_msec: int = 0
const LOADING_TIMEOUT_MSEC := 2000


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	set_process(true)
	layer = 20
	_build()
	visible = false


func _process(_delta: float) -> void:
	if not _loading or not visible:
		return
	if Time.get_ticks_msec() - _loading_started_msec < LOADING_TIMEOUT_MSEC:
		return
	var named := ""
	if _name_label != null:
		named = _name_label.text
	show_error(named, "The server did not answer.")
	loading_timed_out.emit()


func is_open() -> bool:
	return visible


func show_loading(npc_name: String) -> void:
	_loading = true
	_loading_started_msec = Time.get_ticks_msec()
	_name_label.text = npc_name
	_body.text = ""
	_status.text = "Waiting for the server…"
	_status.modulate = DesignTokens.TEXT_MUTED
	_clear_buttons()
	_close.disabled = false
	visible = true


func show_error(npc_name: String, message: String) -> void:
	_loading = false
	_name_label.text = npc_name
	_body.text = ""
	_status.text = message
	_status.modulate = DesignTokens.ERROR
	_clear_buttons()
	_close.disabled = false
	visible = true


func present(payload: Dictionary) -> void:
	# Leave waiting copy before building buttons. A later throw must not keep
	# "Waiting for the server…" on screen.
	_loading = false
	npc_id = String(payload.get("npc_id", npc_id))
	session_id = String(payload.get("interaction_session_id", session_id))
	current_node_id = String(payload.get("current_node_id", ""))
	_name_label.text = String(payload.get("npc_name", npc_id))
	_body.text = String(payload.get("text", ""))
	_status.text = ""
	_status.modulate = DesignTokens.TEXT
	_clear_buttons()
	var options: Variant = payload.get("options", [])
	if typeof(options) == TYPE_ARRAY:
		for entry in options:
			if typeof(entry) != TYPE_DICTIONARY:
				continue
			var option: Dictionary = entry
			var option_id := String(option.get("id", ""))
			if option_id.is_empty():
				continue
			var button := _make_button(String(option.get("text", option_id)), false)
			button.pressed.connect(_on_option.bind(option_id))
			_options.add_child(button)
	var services: Variant = payload.get("services", [])
	if typeof(services) == TYPE_ARRAY:
		for service_id in services:
			var id := String(service_id)
			if id.is_empty() or id == "dialogue":
				continue
			var label := String(SERVICE_LABELS.get(id, id))
			var button := _make_button(label, true)
			button.pressed.connect(_on_service.bind(id))
			_services.add_child(button)
	visible = true


func close_window() -> void:
	visible = false
	_loading = false
	npc_id = ""
	session_id = ""
	current_node_id = ""
	_clear_buttons()


func is_loading() -> bool:
	return _loading


func _build() -> void:
	_root = PanelContainer.new()
	_root.name = "Panel"
	_root.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	_root.offset_left = -240.0
	_root.offset_top = -280.0
	_root.offset_right = 240.0
	_root.offset_bottom = -24.0
	var style := StyleBoxFlat.new()
	style.bg_color = DesignTokens.SURFACE
	style.border_color = DesignTokens.BORDER
	style.set_border_width_all(1)
	style.set_corner_radius_all(6)
	style.content_margin_left = DesignTokens.SPACE_LG
	style.content_margin_right = DesignTokens.SPACE_LG
	style.content_margin_top = DesignTokens.SPACE_MD
	style.content_margin_bottom = DesignTokens.SPACE_MD
	_root.add_theme_stylebox_override("panel", style)
	add_child(_root)

	var vbox := VBoxContainer.new()
	vbox.add_theme_constant_override("separation", DesignTokens.SPACE_SM)
	_root.add_child(vbox)

	_name_label = Label.new()
	_name_label.add_theme_font_size_override("font_size", DesignTokens.FONT_HEADING)
	_name_label.add_theme_color_override("font_color", DesignTokens.TEXT)
	vbox.add_child(_name_label)

	_body = Label.new()
	_body.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_body.add_theme_font_size_override("font_size", DesignTokens.FONT_BODY)
	_body.add_theme_color_override("font_color", DesignTokens.TEXT)
	vbox.add_child(_body)

	_status = Label.new()
	_status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_status.add_theme_font_size_override("font_size", DesignTokens.FONT_CAPTION)
	vbox.add_child(_status)

	_options = VBoxContainer.new()
	_options.add_theme_constant_override("separation", DesignTokens.SPACE_XS)
	vbox.add_child(_options)

	_services = VBoxContainer.new()
	_services.add_theme_constant_override("separation", DesignTokens.SPACE_XS)
	vbox.add_child(_services)

	_close = _make_button("Close", false)
	_close.pressed.connect(_on_close)
	vbox.add_child(_close)


func _make_button(text: String, secondary: bool) -> Button:
	var button := Button.new()
	button.text = text
	button.custom_minimum_size = Vector2(0, 28)
	if secondary:
		ShellTheme.style_secondary(button)
	else:
		ShellTheme.style_primary(button)
	return button


func _clear_buttons() -> void:
	_free_children(_options)
	_free_children(_services)


func _free_children(parent: Node) -> void:
	if parent == null:
		return
	var children: Array = parent.get_children()
	for child in children:
		parent.remove_child(child)
		child.free()


func _on_option(option_id: String) -> void:
	if _loading:
		return
	option_chosen.emit(option_id)


func _on_service(service_id: String) -> void:
	if _loading:
		return
	service_chosen.emit(service_id)


func _on_close() -> void:
	close_requested.emit()
