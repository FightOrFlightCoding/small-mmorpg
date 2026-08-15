extends "res://scripts/ui/shell_page.gd"

@onready var _status: Label = $Center/VBox/Status
@onready var _resync_button: Button = $Center/VBox/ResyncButton
@onready var _logout_button: Button = $Center/VBox/LogoutButton


func _ready() -> void:
	super._ready()
	_resync_button.pressed.connect(_on_resync_pressed)
	_logout_button.pressed.connect(_on_logout_pressed)
	if not AppState.zone_state_updated.is_connected(_on_zone_state_updated):
		AppState.zone_state_updated.connect(_on_zone_state_updated)
	_render_status()


func _exit_tree() -> void:
	if AppState.zone_state_updated.is_connected(_on_zone_state_updated):
		AppState.zone_state_updated.disconnect(_on_zone_state_updated)
	super._exit_tree()


func _on_zone_state_updated() -> void:
	_render_status()


func _render_status() -> void:
	if not AppState.has_zone_state:
		_status.text = "Waiting for authoritative zone state."
		return
	var view: Dictionary = AppState.zone_view
	var players: Array = view.get("players", [])
	var names: PackedStringArray = PackedStringArray()
	for entry in players:
		if typeof(entry) == TYPE_DICTIONARY:
			names.append(String(entry.get("name", entry.get("userId", ""))))
	_status.text = "In %s as %s. Players: %s. Tick: %s. Movement is not available yet." % [
		String(view.get("zone_id", "zone.starter")),
		String(view.get("self_id", "")),
		", ".join(names),
		str(view.get("tick", 0)),
	]


func _on_resync_pressed() -> void:
	_resync_button.disabled = true
	await GameService.request_resync()
	_resync_button.disabled = false
	_render_status()


func _on_logout_pressed() -> void:
	GameService.request_logout()
