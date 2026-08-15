extends Node2D

## Starter-zone presentation. Local avatars snap to server poses; remotes interpolate.

@onready var _zone: ZoneView = $Zone
@onready var _entities: EntityRegistry = $EntityRegistry
@onready var _camera: Camera2D = $Camera2D
@onready var _hud: WorldHud = $WorldHud
@onready var _error_dialog: CanvasLayer = $ErrorDialog
@onready var _loading_overlay: CanvasLayer = $LoadingOverlay

var _input_seq: int = 0
var _input_accum: float = 0.0
var _last_state_msec: int = 0
var _last_tick: int = 0
var _snapshot_timeout_reported: bool = false
var _snapshot_stale: bool = false


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
	_last_state_msec = Time.get_ticks_msec()
	if AppState.has_fatal_error:
		_on_fatal_error(AppState.last_error_code, AppState.last_error_message)


func _process(delta: float) -> void:
	_entities.advance_interpolation(delta)
	_input_accum += delta
	var interval := 1.0 / MatchProtocol.INPUT_SEND_HZ
	if _input_accum >= interval:
		_input_accum = 0.0
		_send_move_intent()
	_check_snapshot_timeout()


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
	_last_state_msec = Time.get_ticks_msec()
	_snapshot_timeout_reported = false
	_snapshot_stale = false
	var state: Dictionary = AppState.zone_view
	if AppState.zone_view_is_full:
		_entities.apply_full_state(state)
	else:
		var duration := 1.0 / MatchProtocol.SNAPSHOT_RATE_HZ
		var new_tick := int(state.get("tick", _last_tick))
		if _last_tick > 0 and new_tick > _last_tick:
			duration = float(new_tick - _last_tick) / MatchProtocol.SNAPSHOT_RATE_HZ
		_entities.apply_snapshot(state, duration)
	_last_tick = int(state.get("tick", _last_tick))
	_hud.refresh(state, _entities.summaries(), false)


func _on_zone_state_updated() -> void:
	_apply_zone_state()


func _send_move_intent() -> void:
	if NetworkService.match_id.is_empty():
		return
	_input_seq += 1
	var axis := MoveIntent.read_axes()
	NetworkService.send_input(_input_seq, axis.x, axis.y)


func _check_snapshot_timeout() -> void:
	if not AppState.has_zone_state:
		return
	var elapsed := float(Time.get_ticks_msec() - _last_state_msec) / 1000.0
	var stale := elapsed >= MatchProtocol.SNAPSHOT_TIMEOUT_SEC
	if stale == _snapshot_stale:
		return
	_snapshot_stale = stale
	_hud.refresh(AppState.zone_view, _entities.summaries(), stale)
	if stale and not _snapshot_timeout_reported:
		_snapshot_timeout_reported = true
		AppState.report_recoverable("snapshot_timeout", "No snapshot from the server. Check the connection.")


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
