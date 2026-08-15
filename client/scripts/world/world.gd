extends Node2D

## Starter-zone presentation. Renders content-driven geometry and authoritative entities. No movement.

@onready var _zone: ZoneView = $Zone
@onready var _entities: EntityRegistry = $EntityRegistry
@onready var _camera: Camera2D = $Camera2D
@onready var _hud: WorldHud = $WorldHud
@onready var _error_dialog: CanvasLayer = $ErrorDialog
@onready var _loading_overlay: CanvasLayer = $LoadingOverlay


func _ready() -> void:
	if not AppState.recoverable_error.is_connected(_on_recoverable_error):
		AppState.recoverable_error.connect(_on_recoverable_error)
	if not AppState.fatal_compatibility_error.is_connected(_on_fatal_error):
		AppState.fatal_compatibility_error.connect(_on_fatal_error)
	if not AppState.loading_started.is_connected(_on_loading_started):
		AppState.loading_started.connect(_on_loading_started)
	if not AppState.loading_completed.is_connected(_on_loading_completed):
		AppState.loading_completed.connect(_on_loading_completed)
	if not AppState.zone_state_updated.is_connected(_on_zone_state_updated):
		AppState.zone_state_updated.connect(_on_zone_state_updated)
	_hud.resync_pressed.connect(_on_resync_pressed)
	_hud.logout_pressed.connect(_on_logout_pressed)
	_entities.follow_camera = _camera
	_render_zone_geometry()
	_apply_zone_state()
	if AppState.has_fatal_error:
		_on_fatal_error(AppState.last_error_code, AppState.last_error_message)


func _exit_tree() -> void:
	if AppState.recoverable_error.is_connected(_on_recoverable_error):
		AppState.recoverable_error.disconnect(_on_recoverable_error)
	if AppState.fatal_compatibility_error.is_connected(_on_fatal_error):
		AppState.fatal_compatibility_error.disconnect(_on_fatal_error)
	if AppState.loading_started.is_connected(_on_loading_started):
		AppState.loading_started.disconnect(_on_loading_started)
	if AppState.loading_completed.is_connected(_on_loading_completed):
		AppState.loading_completed.disconnect(_on_loading_completed)
	if AppState.zone_state_updated.is_connected(_on_zone_state_updated):
		AppState.zone_state_updated.disconnect(_on_zone_state_updated)


func _render_zone_geometry() -> void:
	var zone_id := "zone.starter"
	if AppState.has_zone_state:
		zone_id = String(AppState.zone_view.get("zone_id", zone_id))
	_zone.render_zone(ContentRegistry.get_by_id(zone_id))


func _apply_zone_state() -> void:
	if not AppState.has_zone_state:
		_hud.refresh({}, PackedStringArray())
		return
	_entities.apply_full_state(AppState.zone_view)
	_hud.refresh(AppState.zone_view, _entities.summaries())


func _on_zone_state_updated() -> void:
	_apply_zone_state()


func _on_resync_pressed() -> void:
	await GameService.request_resync()
	_apply_zone_state()


func _on_logout_pressed() -> void:
	GameService.request_logout()


func _on_recoverable_error(code: String, message: String) -> void:
	if _error_dialog != null and _error_dialog.has_method("show_error"):
		_error_dialog.call("show_error", "Something went wrong", "%s\n%s" % [code, message], false)


func _on_fatal_error(code: String, message: String) -> void:
	if _loading_overlay != null and _loading_overlay.has_method("hide_loading"):
		_loading_overlay.call("hide_loading")
	if _error_dialog != null and _error_dialog.has_method("show_error"):
		_error_dialog.call("show_error", "Cannot start", "%s\n%s" % [code, message], true)


func _on_loading_started(reason: String) -> void:
	if _loading_overlay != null and _loading_overlay.has_method("show_loading"):
		_loading_overlay.call("show_loading", reason)


func _on_loading_completed(_reason: String) -> void:
	if AppState.has_fatal_error:
		return
	if _loading_overlay != null and _loading_overlay.has_method("hide_loading"):
		_loading_overlay.call("hide_loading")
