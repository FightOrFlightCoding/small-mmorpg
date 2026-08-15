extends "res://scripts/ui/shell_page.gd"

@onready var _status: Label = $Center/VBox/Status
@onready var _name_label: Label = $Center/VBox/NameValue
@onready var _stats_label: Label = $Center/VBox/StatsValue
@onready var _continue_button: Button = $Center/VBox/ContinueButton
@onready var _logout_button: Button = $Center/VBox/LogoutButton


func _ready() -> void:
	super._ready()
	_continue_button.pressed.connect(_on_continue_pressed)
	_logout_button.pressed.connect(_on_logout_pressed)
	_continue_button.disabled = true
	if not AppState.character_loaded.is_connected(_on_character_loaded):
		AppState.character_loaded.connect(_on_character_loaded)
	if AppState.has_character:
		_show_character(AppState.character_view, AppState.character_created)
	elif AppState.is_authenticated:
		_status.text = "Loading character..."
		GameService.request_character_bootstrap()
	else:
		_status.text = "Sign-in is required."


func _exit_tree() -> void:
	if AppState.character_loaded.is_connected(_on_character_loaded):
		AppState.character_loaded.disconnect(_on_character_loaded)
	super._exit_tree()


func _on_character_loaded(created: bool) -> void:
	_show_character(AppState.character_view, created)


func _show_character(view: Dictionary, created: bool) -> void:
	if created:
		_status.text = "Character created."
	else:
		_status.text = "Existing character loaded."
	_name_label.text = String(view.get("name", ""))
	var stats: Dictionary = view.get("base_stats", {})
	_stats_label.text = "Health %s  Attack %s  Speed %s" % [
		str(stats.get("maxHealth", "")),
		str(stats.get("attack", "")),
		str(stats.get("moveSpeed", "")),
	]
	_continue_button.disabled = false
	if GameService.enter_world_after_bootstrap:
		GameService.enter_world_after_bootstrap = false
		_on_continue_pressed()


func _on_continue_pressed() -> void:
	_continue_button.disabled = true
	var entered := await GameService.enter_starter_zone()
	if not entered:
		_continue_button.disabled = false


func _on_logout_pressed() -> void:
	GameService.request_logout()
