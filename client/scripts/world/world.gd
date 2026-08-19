extends Node2D

## Starter-zone presentation. Predicts local movement; remotes interpolate from a snapshot buffer.

@onready var _zone: ZoneView = $Zone
@onready var _entities: EntityRegistry = $EntityRegistry
@onready var _camera: Camera2D = $Camera2D
@onready var _hud: WorldHud = $WorldHud
@onready var _chat: ChatPanel = $ChatPanel
@onready var _error_dialog: CanvasLayer = $ErrorDialog
@onready var _loading_overlay: CanvasLayer = $LoadingOverlay
@onready var _overlay: NetDebugOverlay = $NetDebugOverlay
@onready var _dialogue: DialoguePresenter = $DialoguePresenter
@onready var _combat: CombatFeedback = $CombatFeedback

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
var _attack_requests: Dictionary = {}
var _pickup_requests: Dictionary = {}
var _equip_requests: Dictionary = {}
var _inventory_requests: Dictionary = {}
var _ability_requests: Dictionary = {}
var _ping_ms: int = 0
var _ping_ema_ms: float = 0.0
var _frame_ms: float = 0.0
var _ground_preview: Polygon2D
var _rendered_zone_id: String = ""
const FRIENDLY_SELECT_RADIUS_PX: float = 56.0


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
	if not AppState.reconnecting_changed.is_connected(_on_reconnecting_changed):
		AppState.reconnecting_changed.connect(_on_reconnecting_changed)
	_hud.resync_pressed.connect(_on_resync_pressed)
	_hud.logout_pressed.connect(_on_logout_pressed)
	if not _hud.respawn_pressed.is_connected(_on_respawn_pressed):
		_hud.respawn_pressed.connect(_on_respawn_pressed)
	if _loading_overlay != null and _loading_overlay.has_signal("cancel_pressed"):
		if not _loading_overlay.cancel_pressed.is_connected(_on_reconnect_cancel):
			_loading_overlay.cancel_pressed.connect(_on_reconnect_cancel)
	if _chat != null:
		_chat.send_requested.connect(_on_chat_send_requested)
	_connect_chat_signals()
	_connect_interaction_signals()
	_entities.follow_camera = _camera
	_bind_zone_presentation(_current_zone_id())
	if _overlay != null:
		_overlay.set_debug_build(OS.is_debug_build())
	_ensure_ground_preview()
	_sync_player_blockers()
	HudController.bind_hud(_hud)
	if _chat != null:
		HudController.bind_chat(_chat)
	_apply_zone_state()
	_last_state_msec = Time.get_ticks_msec()
	if AppState.has_fatal_error:
		_on_fatal_error(AppState.last_error_code, AppState.last_error_message)
	elif AppState.is_reconnecting:
		_show_reconnect_overlay()


func _process(delta: float) -> void:
	_frame_ms = delta * 1000.0
	var axis := Vector2.ZERO
	if not _input_blocked() and _local_alive():
		axis = MoveIntent.read_axes()
	if not NetworkService.match_id.is_empty():
		_sync_player_blockers()
		_entities.pose_local(_reconciler.advance(delta, axis), axis)
	_input_accum += delta
	var interval := 1.0 / MatchProtocol.INPUT_SEND_HZ
	if _input_accum >= interval:
		_input_accum = fmod(_input_accum, interval)
		_send_move_intent(axis)
	if not axis.is_zero_approx():
		var focused := get_viewport().gui_get_focus_owner()
		if focused != null and not (_chat != null and _chat.has_input_focus()):
			focused.release_focus()
	_buffer.advance(delta)
	_update_ground_preview()
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
	if AppState.reconnecting_changed.is_connected(_on_reconnecting_changed):
		AppState.reconnecting_changed.disconnect(_on_reconnecting_changed)
	_disconnect_chat_signals()
	_disconnect_interaction_signals()
	HudController.unbind()


func _current_zone_id() -> String:
	if AppState.has_zone_state:
		var zone_id := String(AppState.zone_view.get("zone_id", "zone.starter"))
		if not zone_id.is_empty():
			return zone_id
	return "zone.starter"


func _bind_zone_presentation(zone_id: String) -> void:
	if zone_id.is_empty():
		zone_id = "zone.starter"
	if zone_id == _rendered_zone_id and _sim != null:
		return
	_rendered_zone_id = zone_id
	if _zone != null:
		_zone.render_zone(ContentRegistry.get_by_id(zone_id))
	_sim = MovementSim.from_content(zone_id)
	if _reconciler != null:
		_reconciler.sim = _sim
	else:
		_reconciler = MovementReconciler.new(_sim)


func _ensure_ground_preview() -> void:
	if _ground_preview != null:
		return
	_ground_preview = Polygon2D.new()
	_ground_preview.color = Color(0.48, 0.72, 1.0, 0.28)
	_ground_preview.visible = false
	add_child(_ground_preview)


func _update_ground_preview() -> void:
	if _ground_preview == null:
		return
	if not AbilityService.is_targeting():
		_ground_preview.visible = false
		return
	var definition := AbilityService.ability_definition(AbilityService.targeting_ability_id)
	var radius := float(definition.get("areaRadius", 40.0))
	if radius <= 0.0:
		radius = 24.0
	_ground_preview.polygon = _circle_points(radius, 24)
	_ground_preview.position = get_global_mouse_position()
	_ground_preview.visible = true


func _circle_points(radius: float, steps: int) -> PackedVector2Array:
	var points := PackedVector2Array()
	for i in range(steps):
		var angle := TAU * float(i) / float(steps)
		points.append(Vector2(cos(angle), sin(angle)) * radius)
	return points


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
	_bind_zone_presentation(String(state.get("zone_id", "zone.starter")))
	if AppState.zone_view_is_full:
		_adopt_ack_seq(int(state.get("ack_seq", 0)))
		_entities.apply_full_state(state)
		_reset_prediction(state)
		_buffer.clear()
		_buffer.push(int(state.get("tick", 0)), _remote_poses(state))
	else:
		_entities.apply_snapshot(state)
		var ack := int(state.get("ack_seq", 0))
		_adopt_ack_seq(ack)
		_sync_player_blockers()
		var result: Dictionary = _reconciler.reconcile(_local_server_pos(state), ack)
		_entities.pose_local(result["display"])
		_update_ping(ack)
		_buffer.push(int(state.get("tick", 0)), _remote_poses(state))
	_last_tick = int(state.get("tick", _last_tick))
	_hud.refresh(state, _entities.summaries(), false)
	_hud.refresh_journal(QuestService.journal_view())
	_hud.refresh_inventory()


func _adopt_ack_seq(ack: int) -> void:
	_input_seq = MatchProtocol.next_input_seq(_input_seq, ack)


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
	_sync_player_blockers()
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
	if not AppState.has_zone_state or AppState.is_reconnecting:
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


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo and event.keycode == KEY_ESCAPE:
		if DragDropService.active:
			DragDropService.cancel()
		elif WindowManager.close_top():
			pass
		elif AbilityService.is_targeting():
			AbilityService.cancel_targeting()
		else:
			var cancel_id := AbilityService.request_cancel_cast()
			if not cancel_id.is_empty():
				_ability_requests[cancel_id] = true
		get_viewport().set_input_as_handled()
		return
	if WindowManager.has_text_focus() or _input_blocked():
		return
	if event.is_action_pressed("interact"):
		try_interact()
		get_viewport().set_input_as_handled()
	elif event.is_action_pressed("attack"):
		try_attack()
		get_viewport().set_input_as_handled()
	elif event.is_action_pressed("pickup"):
		try_pickup()
		get_viewport().set_input_as_handled()
	elif event.is_action_pressed("inventory"):
		HudController.toggle_panel(WindowManager.INVENTORY)
		get_viewport().set_input_as_handled()
	elif event.is_action_pressed("character_sheet"):
		HudController.toggle_panel(WindowManager.CHARACTER)
		get_viewport().set_input_as_handled()
	elif event.is_action_pressed("quest_journal"):
		HudController.toggle_panel(WindowManager.QUEST_JOURNAL)
		get_viewport().set_input_as_handled()
	elif event.is_action_pressed("party_panel"):
		HudController.toggle_panel(WindowManager.PARTY)
		get_viewport().set_input_as_handled()
	elif event.is_action_pressed("open_settings"):
		HudController.toggle_panel(WindowManager.SETTINGS)
		get_viewport().set_input_as_handled()
	elif event.is_action_pressed("chat_focus"):
		if _chat != null:
			_chat.grab_chat_focus()
		get_viewport().set_input_as_handled()
	elif event.is_action_pressed("target_select"):
		try_select_combat_target()
		get_viewport().set_input_as_handled()
	elif event is InputEventKey and event.pressed and not event.echo:
		for slot in range(8):
			if event.is_action_pressed("hotbar_%s" % str(slot + 1)):
				var request_id := AbilityService.try_hotbar(slot)
				if not request_id.is_empty():
					_ability_requests[request_id] = true
				get_viewport().set_input_as_handled()
				break
	elif event is InputEventMouseButton and event.pressed:
		if AbilityService.is_targeting():
			if event.button_index == MOUSE_BUTTON_LEFT:
				var request_id := AbilityService.confirm_ground_target(get_global_mouse_position())
				if not request_id.is_empty():
					_ability_requests[request_id] = true
			else:
				AbilityService.cancel_targeting()
			get_viewport().set_input_as_handled()
		elif event.button_index == MOUSE_BUTTON_LEFT:
			if try_select_friendly_player():
				get_viewport().set_input_as_handled()


func _input_blocked() -> bool:
	if AppState.is_reconnecting:
		return true
	if WindowManager.has_text_focus():
		return true
	if _chat != null and _chat.has_input_focus():
		return true
	if _hud != null and _hud.has_party_input_focus():
		return true
	if _dialogue != null and _dialogue.is_open():
		return true
	return false


func try_select_combat_target() -> void:
	if _input_blocked() or not _local_alive() or NetworkService.match_id.is_empty():
		return
	var enemy_id := AttackIntent.nearest_enemy_id(_reconciler.display, AppState.zone_view.get("enemies", []))
	if enemy_id.is_empty():
		return
	NetworkService.send_set_target(enemy_id, MatchProtocol.new_request_id(), "hostile")


func _local_alive() -> bool:
	if not AppState.has_zone_state:
		return true
	var self_id := String(AppState.zone_view.get("self_id", _entities.local_server_id))
	for entry in AppState.zone_view.get("players", []):
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		if String(entry.get("userId", "")) != self_id:
			continue
		return int(entry.get("health", 1)) > 0
	return true


func _sync_player_blockers() -> void:
	if _sim == null:
		return
	var rects: Array[Rect2] = []
	if AppState.has_zone_state:
		var self_id := String(AppState.zone_view.get("self_id", _entities.local_server_id))
		var half := _sim.half_extent
		var size := half * 2.0
		var poses: Dictionary = {}
		if _buffer.depth() > 0:
			poses = _buffer.sample(_buffer.render_tick())
		for entry in AppState.zone_view.get("players", []):
			if typeof(entry) != TYPE_DICTIONARY:
				continue
			var record: Dictionary = entry
			var user_id := String(record.get("userId", record.get("user_id", "")))
			if user_id.is_empty() or user_id == self_id:
				continue
			if int(record.get("health", 1)) <= 0:
				continue
			if record.has("alive") and not bool(record.get("alive", true)):
				continue
			var pos := Vector2(float(record.get("x", 0.0)), float(record.get("y", 0.0)))
			var pose_key := "player:%s" % user_id
			if poses.has(pose_key):
				pos = poses[pose_key]
			rects.append(Rect2(pos.x - half, pos.y - half, size, size))
	_sim.dynamic_collisions = rects


func try_select_friendly_player() -> bool:
	if _input_blocked() or not _local_alive() or NetworkService.match_id.is_empty():
		return false
	if _entities == null or not AppState.has_zone_state:
		return false
	var mouse := get_global_mouse_position()
	var self_id := String(AppState.zone_view.get("self_id", _entities.local_server_id))
	var best_id := ""
	var best_name := ""
	var best_distance := FRIENDLY_SELECT_RADIUS_PX
	for entry in AppState.zone_view.get("players", []):
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		var record: Dictionary = entry
		var user_id := String(record.get("userId", record.get("user_id", "")))
		if user_id.is_empty() or user_id == self_id:
			continue
		if record.has("alive") and not bool(record.get("alive", true)):
			continue
		if int(record.get("health", 1)) <= 0:
			continue
		var pos := Vector2(float(record.get("x", 0.0)), float(record.get("y", 0.0)))
		var node: Node2D = _entities.get_entity("player:%s" % user_id)
		if node != null:
			pos = node.global_position
		var distance := mouse.distance_to(pos)
		if distance > best_distance:
			continue
		best_distance = distance
		best_id = user_id
		best_name = String(record.get("name", user_id))
	if best_id.is_empty():
		return false
	NetworkService.send_set_target(best_id, MatchProtocol.new_request_id(), "friendly")
	if _hud != null:
		_hud.select_player_for_trade(best_id, best_name)
	return true


func try_interact() -> void:
	if _input_blocked() or not _local_alive() or NetworkService.match_id.is_empty():
		return
	var npc_id := InteractIntent.nearest_npc_id(_reconciler.display, AppState.zone_view.get("npcs", []))
	if npc_id.is_empty():
		return
	var request_id := MatchProtocol.new_request_id()
	if _dialogue != null:
		_dialogue.note_intent(npc_id, request_id)
	NetworkService.send_interact(npc_id, request_id)


func try_attack() -> void:
	if _input_blocked() or not _local_alive() or NetworkService.match_id.is_empty():
		return
	var enemy_id := AttackIntent.nearest_enemy_id(_reconciler.display, AppState.zone_view.get("enemies", []))
	if enemy_id.is_empty():
		return
	var request_id := MatchProtocol.new_request_id()
	_attack_requests[request_id] = true
	NetworkService.send_set_target(enemy_id, MatchProtocol.new_request_id(), "hostile")
	NetworkService.send_attack(enemy_id, request_id)


func try_pickup() -> void:
	if _input_blocked() or not _local_alive() or NetworkService.match_id.is_empty():
		return
	var loot_id := PickupIntent.nearest_loot_id(_reconciler.display, AppState.zone_view.get("loot", []))
	if loot_id.is_empty():
		return
	var request_id := InventoryService.request_pickup(loot_id)
	if not request_id.is_empty():
		_pickup_requests[request_id] = true


func _connect_interaction_signals() -> void:
	if not NetworkService.interaction_result_received.is_connected(_on_interaction_result):
		NetworkService.interaction_result_received.connect(_on_interaction_result)
	if not NetworkService.action_result_received.is_connected(_on_action_result):
		NetworkService.action_result_received.connect(_on_action_result)
	if not QuestService.quests_changed.is_connected(_on_quests_changed):
		QuestService.quests_changed.connect(_on_quests_changed)
	if not NetworkService.combat_event_received.is_connected(_on_combat_event):
		NetworkService.combat_event_received.connect(_on_combat_event)
	if not InventoryService.inventory_changed.is_connected(_on_inventory_changed):
		InventoryService.inventory_changed.connect(_on_inventory_changed)
	if not EquipmentService.equipment_changed.is_connected(_on_equipment_changed):
		EquipmentService.equipment_changed.connect(_on_equipment_changed)
	if not EquipmentService.request_started.is_connected(_on_equip_request_started):
		EquipmentService.request_started.connect(_on_equip_request_started)
	if not InventoryService.request_started.is_connected(_on_inventory_request_started):
		InventoryService.request_started.connect(_on_inventory_request_started)
	if not AbilityService.request_started.is_connected(_on_ability_request_started):
		AbilityService.request_started.connect(_on_ability_request_started)
	if not WalletService.wallet_changed.is_connected(_on_wallet_changed):
		WalletService.wallet_changed.connect(_on_wallet_changed)
	if not PartyService.party_changed.is_connected(_on_party_changed):
		PartyService.party_changed.connect(_on_party_changed)


func _disconnect_interaction_signals() -> void:
	if NetworkService.interaction_result_received.is_connected(_on_interaction_result):
		NetworkService.interaction_result_received.disconnect(_on_interaction_result)
	if NetworkService.action_result_received.is_connected(_on_action_result):
		NetworkService.action_result_received.disconnect(_on_action_result)
	if QuestService.quests_changed.is_connected(_on_quests_changed):
		QuestService.quests_changed.disconnect(_on_quests_changed)
	if NetworkService.combat_event_received.is_connected(_on_combat_event):
		NetworkService.combat_event_received.disconnect(_on_combat_event)
	if InventoryService.inventory_changed.is_connected(_on_inventory_changed):
		InventoryService.inventory_changed.disconnect(_on_inventory_changed)
	if EquipmentService.equipment_changed.is_connected(_on_equipment_changed):
		EquipmentService.equipment_changed.disconnect(_on_equipment_changed)
	if EquipmentService.request_started.is_connected(_on_equip_request_started):
		EquipmentService.request_started.disconnect(_on_equip_request_started)
	if InventoryService.request_started.is_connected(_on_inventory_request_started):
		InventoryService.request_started.disconnect(_on_inventory_request_started)
	if AbilityService.request_started.is_connected(_on_ability_request_started):
		AbilityService.request_started.disconnect(_on_ability_request_started)
	if WalletService.wallet_changed.is_connected(_on_wallet_changed):
		WalletService.wallet_changed.disconnect(_on_wallet_changed)
	if PartyService.party_changed.is_connected(_on_party_changed):
		PartyService.party_changed.disconnect(_on_party_changed)


func _on_interaction_result(payload: Dictionary) -> void:
	if not bool(payload.get("result_ok", false)):
		AppState.report_recoverable(String(payload.get("code", "interaction_failed")), _interaction_message(payload))
		if _dialogue != null:
			_dialogue.handle_interaction_result(payload)
		return
	if _dialogue != null:
		_dialogue.handle_interaction_result(payload)


func _on_action_result(payload: Dictionary) -> void:
	var request_id := String(payload.get("request_id", ""))
	if _attack_requests.has(request_id):
		_attack_requests.erase(request_id)
		if bool(payload.get("result_ok", false)):
			return
		AppState.report_recoverable(String(payload.get("code", "attack_failed")), _combat_message(String(payload.get("code", ""))))
		return
	if _pickup_requests.has(request_id):
		_pickup_requests.erase(request_id)
		if bool(payload.get("result_ok", false)):
			return
		AppState.report_recoverable(String(payload.get("code", "pickup_failed")), _pickup_message(String(payload.get("code", ""))))
		return
	if _equip_requests.has(request_id):
		_equip_requests.erase(request_id)
		if bool(payload.get("result_ok", false)):
			return
		AppState.report_recoverable(String(payload.get("code", "equip_failed")), _equip_message(String(payload.get("code", ""))))
		return
	if _inventory_requests.has(request_id):
		_inventory_requests.erase(request_id)
		if bool(payload.get("result_ok", false)):
			return
		AppState.report_recoverable(String(payload.get("code", "inventory_failed")), _inventory_message(String(payload.get("code", ""))))
		return
	if _ability_requests.has(request_id) or AbilityService.owns_request(request_id):
		_ability_requests.erase(request_id)
		return
	if bool(payload.get("result_ok", false)):
		return
	var code := String(payload.get("code", "action_failed"))
	if code == "not_implemented":
		return
	if TradeService.took_action_result(request_id) or not String(payload.get("trade_id", "")).is_empty():
		return
	if code == "not_party_member" or code == "not_cave_owner" or code == "already_transferring" or code == "cave_expired" or code == "cave_already_associated" or code == "invalid_origin" or code == "instance_not_ready" or code == "content_mismatch":
		AppState.report_recoverable(code, _cave_message(code))
		return
	if code == "pvp_disabled" or code == "invalid_target" or code == "target_dead" or code == "player_dead" or code == "not_dead" or code == "invalid_relation":
		AppState.report_recoverable(code, _combat_message(code))
		return
	AppState.report_recoverable(code, _quest_message(code))


func _on_quests_changed() -> void:
	if _hud != null:
		_hud.refresh_journal(QuestService.journal_view())


func _on_inventory_changed() -> void:
	if _hud != null:
		_hud.refresh_inventory()


func _on_equipment_changed() -> void:
	if _hud != null:
		_hud.refresh_equipment()


func _on_wallet_changed() -> void:
	if _hud != null:
		_hud.refresh_wallet()


func _on_party_changed() -> void:
	if _hud != null:
		_hud.refresh_party()


func _on_equip_request_started(request_id: String) -> void:
	if not request_id.is_empty():
		_equip_requests[request_id] = true


func _on_inventory_request_started(request_id: String) -> void:
	if not request_id.is_empty():
		_inventory_requests[request_id] = true


func _on_ability_request_started(request_id: String) -> void:
	if not request_id.is_empty():
		_ability_requests[request_id] = true


func _on_combat_event(payload: Dictionary) -> void:
	for entry in payload.get("events", []):
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		var event: Dictionary = entry
		var event_type := String(event.get("type", ""))
		if event_type == "hit" and _combat != null:
			var pos := Vector2(float(event.get("x", 0.0)), float(event.get("y", 0.0)))
			_combat.show_hit(pos, int(event.get("damage", 0)), String(event.get("targetKind", "")) == "player")
		if event_type == "heal" and _combat != null:
			var heal_pos := Vector2(float(event.get("x", 0.0)), float(event.get("y", 0.0)))
			_combat.show_heal(heal_pos, int(event.get("healing", 0)))
		if event_type == "respawn" and String(event.get("targetKind", "")) == "player":
			if String(event.get("targetId", "")) == String(AppState.zone_view.get("self_id", "")):
				_reconciler.reset(Vector2(float(event.get("x", 0.0)), float(event.get("y", 0.0))))
				_entities.pose_local(_reconciler.display)
		if event_type == "message":
			var notice := String(event.get("message", ""))
			if not notice.is_empty() and _hud != null:
				_hud.show_notice(notice)


func _combat_message(code: String) -> String:
	if code == "invalid_target":
		return "That target is not here."
	if code == "target_dead":
		return "That target is already defeated."
	if code == "out_of_range":
		return "Too far from that target."
	if code == "on_cooldown":
		return "That attack is not ready."
	if code == "player_dead":
		return "You cannot act while defeated."
	if code == "pvp_disabled":
		return "You cannot attack other players."
	if code == "not_dead":
		return "You are already alive."
	if code == "invalid_relation":
		return "That target cannot be selected that way."
	return "The server rejected that combat action."


func _interaction_message(payload: Dictionary) -> String:
	var code := String(payload.get("code", ""))
	if code == "out_of_range":
		return "Too far from that NPC."
	if code == "invalid_target":
		return "That NPC is not here."
	if code == "player_dead":
		return "You cannot talk while defeated."
	return "The server rejected that interaction."


func _pickup_message(code: String) -> String:
	if code == "out_of_range":
		return "Too far from that item."
	if code == "invalid_target":
		return "That loot is gone."
	if code == "inventory_full":
		return "Your inventory is full."
	if code == "player_dead":
		return "You cannot loot while defeated."
	if code == "invalid_id":
		return "That item is not valid."
	if code == "unique_restricted":
		return "You already have a unique item of that type."
	return "The server rejected that pickup."


func _equip_message(code: String) -> String:
	if code == "not_equippable":
		return "That item cannot be equipped."
	if code == "unowned":
		return "You do not own that item."
	if code == "invalid_slot":
		return "That item cannot go in that slot."
	if code == "invalid_id":
		return "That item is not valid."
	if code == "player_dead":
		return "You cannot change equipment while defeated."
	if code == "item_locked":
		return "That item is locked."
	if code == "class_restricted":
		return "Your class cannot use that item or slot."
	if code == "level_restricted":
		return "Your level is too low for that item."
	if code == "invalid_category":
		return "That item cannot go in that slot."
	if code == "unique_restricted":
		return "You already have a unique item of that type."
	return "The server rejected that equipment action."


func _inventory_message(code: String) -> String:
	if code == "not_destroyable":
		return "That item cannot be destroyed."
	if code == "item_locked":
		return "That item is locked."
	if code == "item_equipped":
		return "Unequip that item before destroying it."
	if code == "inventory_full":
		return "Your inventory is full."
	if code == "player_dead":
		return "You cannot do that while defeated."
	if code == "invalid_id":
		return "That item is not valid."
	if code == "invalid_slot":
		return "That inventory slot is not valid."
	return "The server rejected that inventory action."


func _cave_message(code: String) -> String:
	if code == "not_party_member":
		return "Only party members can enter that cave."
	if code == "not_cave_owner":
		return "That cave belongs to someone else."
	if code == "already_transferring":
		return "A transfer is already in progress."
	if code == "cave_expired":
		return "That cave is no longer available."
	if code == "cave_already_associated":
		return "You already have an active cave."
	if code == "invalid_origin":
		return "Use the cave entrance or exit."
	if code == "instance_not_ready":
		return "The cave is still opening. Try again."
	if code == "content_mismatch":
		return "Your client does not match that cave."
	return "You cannot enter that cave."


func _quest_message(code: String) -> String:
	if code == "out_of_range":
		return "Too far from the elder."
	if code == "invalid_id":
		return "That quest is not available."
	if code == "incomplete_objective":
		return "The quest is not ready to turn in."
	if code == "missing_item":
		return "You do not have the required item."
	if code == "already_completed":
		return "That quest is already complete."
	if code == "persist_failed":
		return "The reward could not be saved. Try again."
	if code == "player_dead":
		return "You cannot do that while defeated."
	if code == "inventory_full":
		return "Your inventory is full."
	return "The server rejected that quest action."


func _connect_chat_signals() -> void:
	if not NetworkService.chat_message_received.is_connected(_on_chat_message):
		NetworkService.chat_message_received.connect(_on_chat_message)
	if not NetworkService.chat_presence_received.is_connected(_on_chat_presence):
		NetworkService.chat_presence_received.connect(_on_chat_presence)
	if not NetworkService.chat_error.is_connected(_on_chat_error):
		NetworkService.chat_error.connect(_on_chat_error)
	if _chat != null and AppState.last_error_code.begins_with("chat_"):
		_chat.set_status(AppState.last_error_message)


func _disconnect_chat_signals() -> void:
	if NetworkService.chat_message_received.is_connected(_on_chat_message):
		NetworkService.chat_message_received.disconnect(_on_chat_message)
	if NetworkService.chat_presence_received.is_connected(_on_chat_presence):
		NetworkService.chat_presence_received.disconnect(_on_chat_presence)
	if NetworkService.chat_error.is_connected(_on_chat_error):
		NetworkService.chat_error.disconnect(_on_chat_error)


func _on_chat_send_requested(text: String) -> void:
	await NetworkService.send_zone_chat(text)


func _on_chat_message(payload: Dictionary) -> void:
	if _chat == null:
		return
	if String(payload.get("channel_id", "")) != NetworkService.zone_chat_id:
		return
	var sender := ZoneChat.sender_name(
		String(payload.get("sender_id", "")),
		String(payload.get("username", "")),
		AppState.zone_view
	)
	_chat.append_chat(sender, ZoneChat.parse_content(String(payload.get("content", ""))), String(payload.get("create_time", "")))


func _on_chat_presence(payload: Dictionary) -> void:
	if _chat == null:
		return
	if String(payload.get("channel_id", "")) != NetworkService.zone_chat_id:
		return
	for entry in payload.get("joins", []):
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		var named := ZoneChat.sender_name(String(entry.get("user_id", "")), String(entry.get("username", "")), AppState.zone_view)
		if named == AppState.username or String(entry.get("user_id", "")) == AppState.user_id:
			continue
		_chat.append_presence(named, true)
	for entry in payload.get("leaves", []):
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		var named := ZoneChat.sender_name(String(entry.get("user_id", "")), String(entry.get("username", "")), AppState.zone_view)
		_chat.append_presence(named, false)


func _on_chat_error(code: String, message: String) -> void:
	if _chat != null:
		_chat.set_status(message if not message.is_empty() else code)


func _on_resync_pressed() -> void:
	await GameService.request_resync()
	_apply_zone_state()


func _on_logout_pressed() -> void:
	if AppState.is_reconnecting:
		GameService.cancel_reconnect()
		return
	GameService.request_logout()


func _on_respawn_pressed() -> void:
	if NetworkService.match_id.is_empty():
		return
	NetworkService.send_release_respawn(MatchProtocol.new_request_id())


func _on_reconnect_cancel() -> void:
	GameService.cancel_reconnect()


func _on_reconnecting_changed() -> void:
	if _hud != null:
		_hud.refresh(AppState.zone_view, _entities.summaries(), _snapshot_stale)
	if AppState.is_reconnecting:
		_show_reconnect_overlay()
	elif not AppState.is_loading:
		_hide_loading_overlay()


func _on_recoverable_error(code: String, message: String) -> void:
	if AppState.is_reconnecting and code == "snapshot_timeout":
		return
	if _error_dialog != null and _error_dialog.has_method("show_error"):
		_error_dialog.call("show_error", "Something went wrong", "%s\n%s" % [code, message], false)


func _on_fatal_error(code: String, message: String) -> void:
	_hide_loading_overlay()
	if _error_dialog != null and _error_dialog.has_method("show_error"):
		_error_dialog.call("show_error", "Cannot start", "%s\n%s" % [code, message], true)


func _on_loading_started(reason: String) -> void:
	if AppState.is_reconnecting:
		_show_reconnect_overlay()
		return
	if _loading_overlay != null and _loading_overlay.has_method("show_loading"):
		_loading_overlay.call("show_loading", reason)


func _on_loading_completed(_reason: String) -> void:
	if AppState.has_fatal_error:
		return
	if AppState.is_reconnecting:
		_show_reconnect_overlay()
		return
	_hide_loading_overlay()


func _show_reconnect_overlay() -> void:
	if _loading_overlay != null and _loading_overlay.has_method("show_loading"):
		_loading_overlay.call("show_loading", "reconnect")


func _hide_loading_overlay() -> void:
	if _loading_overlay != null and _loading_overlay.has_method("hide_loading"):
		_loading_overlay.call("hide_loading")
