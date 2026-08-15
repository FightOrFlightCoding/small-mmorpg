extends Node2D

## Starter-zone presentation. Predicts local movement; remotes interpolate from a snapshot buffer.

@onready var _zone: ZoneView = $Zone
@onready var _entities: EntityRegistry = $EntityRegistry
@onready var _camera: Camera2D = $Camera2D
@onready var _hud: WorldHud = $WorldHud
@onready var _error_dialog: CanvasLayer = $ErrorDialog
@onready var _loading_overlay: CanvasLayer = $LoadingOverlay
@onready var _overlay: NetDebugOverlay = $NetDebugOverlay

var _input_seq: int = 0
var _input_accum: float = 0.0
var _last_state_msec: int = 0
var _last_tick: int = 0
var _snapshot_timeout_reported: bool = false
var _snapshot_stale: bool = false
var _sim: MovementSim
var _reconciler: MovementReconciler
var _buffer: SnapshotBuffer = SnapshotBuffer.new()
var _sent_at: Dictionary = {}
var _ping_ms: int = 0
var _ping_ema_ms: float = 0.0
var _frame_ms: float = 0.0


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
	_sim = MovementSim.from_content()
	_reconciler = MovementReconciler.new(_sim)
	if _overlay != null:
		_overlay.set_debug_build(OS.is_debug_build())
	_render_zone_geometry()
	_apply_zone_state()
	_last_state_msec = Time.get_ticks_msec()
	if AppState.has_fatal_error:
		_on_fatal_error(AppState.last_error_code, AppState.last_error_message)


func _process(delta: float) -> void:
	_frame_ms = delta * 1000.0
	var axis := MoveIntent.read_axes()
	if not NetworkService.match_id.is_empty():
		_entities.pose_local(_reconciler.advance(delta, axis))
	_input_accum += delta
	var interval := 1.0 / MatchProtocol.INPUT_SEND_HZ
	while _input_accum >= interval:
		_input_accum -= interval
		_send_move_intent(axis)
	_buffer.advance(delta)
	if not _snapshot_stale:
		_entities.apply_remote_poses(_buffer.sample(_buffer.render_tick()))
	_check_snapshot_timeout()
	_refresh_overlay()


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
	if _snapshot_stale:
		_buffer.frozen = false
	_snapshot_stale = false
	var state: Dictionary = AppState.zone_view
	if AppState.zone_view_is_full:
		_entities.apply_full_state(state)
		_reset_prediction(state)
		_buffer.clear()
		_buffer.push(int(state.get("tick", 0)), _remote_poses(state))
	else:
		_entities.apply_snapshot(state)
		var ack := int(state.get("ack_seq", 0))
		var result: Dictionary = _reconciler.reconcile(_local_server_pos(state), ack)
		_entities.pose_local(result["display"])
		_update_ping(ack)
		_buffer.push(int(state.get("tick", 0)), _remote_poses(state))
	_last_tick = int(state.get("tick", _last_tick))
	_hud.refresh(state, _entities.summaries(), false)


func _reset_prediction(state: Dictionary) -> void:
	_reconciler.reset(_local_server_pos(state))
	_sent_at.clear()


func _local_server_pos(state: Dictionary) -> Vector2:
	var self_id := String(state.get("self_id", _entities.local_server_id))
	for entry in state.get("players", []):
		if typeof(entry) == TYPE_DICTIONARY and String(entry.get("userId", "")) == self_id:
			return Vector2(float(entry.get("x", 0.0)), float(entry.get("y", 0.0)))
	return _reconciler.display


func _remote_poses(state: Dictionary) -> Dictionary:
	var poses: Dictionary = {}
	var self_id := String(state.get("self_id", _entities.local_server_id))
	_collect_poses(poses, "player", state.get("players", []), self_id)
	_collect_poses(poses, "npc", state.get("npcs", []), "")
	_collect_poses(poses, "enemy", state.get("enemies", []), "")
	_collect_poses(poses, "loot", state.get("loot", []), "")
	return poses


func _collect_poses(poses: Dictionary, kind: String, records: Variant, skip_id: String) -> void:
	if typeof(records) != TYPE_ARRAY:
		return
	for entry in records:
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		var record: Dictionary = entry
		var server_id := ""
		if kind == "player":
			server_id = String(record.get("userId", record.get("user_id", "")))
		elif kind == "npc":
			server_id = String(record.get("id", record.get("npcId", "")))
		elif kind == "enemy":
			server_id = String(record.get("id", ""))
			if server_id.is_empty():
				server_id = String(record.get("enemyId", ""))
		else:
			server_id = String(record.get("id", ""))
		if server_id.is_empty() or server_id == skip_id:
			continue
		poses["%s:%s" % [kind, server_id]] = Vector2(float(record.get("x", 0.0)), float(record.get("y", 0.0)))


func _on_zone_state_updated() -> void:
	_apply_zone_state()


func _send_move_intent(axis: Vector2) -> void:
	if NetworkService.match_id.is_empty():
		return
	_input_seq += 1
	_reconciler.predict(_input_seq, axis)
	_sent_at[_input_seq] = Time.get_ticks_msec()
	NetworkService.send_input(_input_seq, axis.x, axis.y)


func _update_ping(ack_seq: int) -> void:
	if _sent_at.has(ack_seq):
		_ping_ms = maxi(0, Time.get_ticks_msec() - int(_sent_at[ack_seq]))
		if _ping_ema_ms <= 0.0:
			_ping_ema_ms = float(_ping_ms)
		else:
			_ping_ema_ms = _ping_ema_ms * 0.7 + float(_ping_ms) * 0.3
	var stale: Array = []
	for seq in _sent_at.keys():
		if int(seq) <= ack_seq:
			stale.append(seq)
	for seq in stale:
		_sent_at.erase(seq)


func _check_snapshot_timeout() -> void:
	if not AppState.has_zone_state:
		return
	var elapsed := float(Time.get_ticks_msec() - _last_state_msec) / 1000.0
	var stale := elapsed >= MatchProtocol.SNAPSHOT_TIMEOUT_SEC
	if stale == _snapshot_stale:
		return
	_snapshot_stale = stale
	_buffer.frozen = stale
	_hud.refresh(AppState.zone_view, _entities.summaries(), stale)
	if stale and not _snapshot_timeout_reported:
		_snapshot_timeout_reported = true
		AppState.report_recoverable("snapshot_timeout", "Connection degraded. Remote movement is frozen.")


func _refresh_overlay() -> void:
	if _overlay == null or not _overlay.visible:
		return
	var hash := ContentRegistry.get_content_hash()
	_overlay.fps = Engine.get_frames_per_second()
	_overlay.frame_ms = _frame_ms
	_overlay.ping_ms = int(round(_ping_ema_ms)) if _ping_ema_ms > 0.0 else _ping_ms
	_overlay.server_tick = _last_tick
	_overlay.last_sent_seq = _input_seq
	_overlay.last_ack_seq = _reconciler.last_ack_seq
	_overlay.prediction_error = _reconciler.last_error
	_overlay.snapshot_depth = _buffer.depth()
	_overlay.protocol_version = MatchProtocol.VERSION
	_overlay.content_hash_prefix = hash.substr(0, 8) if hash.length() >= 8 else hash
	_overlay.refresh()


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
