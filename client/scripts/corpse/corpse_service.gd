extends Node

## Sends corpse open/claim/Loot All intentions. The match stays authoritative.

signal corpse_opened(corpse_id: String)
signal corpse_closed

var last_corpse_id: String = ""
var last_request_id: String = ""
var last_corpse: Dictionary = {}
var last_loot_all: Array = []
var last_notice: String = ""

var _window: CorpseWindow
var _closing: bool = false


func _ready() -> void:
	WindowManager.connect_once(NetworkService.corpse_state_received, _on_corpse_state)
	WindowManager.connect_once(NetworkService.corpse_removed_received, _on_corpse_removed)
	WindowManager.connect_once(NetworkService.action_result_received, _on_action_result)
	WindowManager.connect_once(AppState.logged_out, reset)
	WindowManager.connect_once(AppState.zone_state_updated, _on_zone_state_updated)
	WindowManager.connect_once(WindowManager.window_closed, _on_window_closed)


func reset() -> void:
	var was_open := is_open()
	last_corpse_id = ""
	last_request_id = ""
	last_corpse = {}
	last_loot_all = []
	last_notice = ""
	if _window != null:
		_window.close_window()
	if WindowManager.is_open(WindowManager.CORPSE):
		WindowManager.close(WindowManager.CORPSE)
	if was_open:
		_emit_closed()


func reset_for_tests() -> void:
	reset()


func is_open() -> bool:
	return _window != null and _window.is_open()


func nearest_corpse_id(player_pos: Vector2, corpses: Array, range_px: float = -1.0) -> String:
	var limit := range_px
	if limit < 0.0:
		limit = PickupIntent.pickup_range()
	var best_id := ""
	var best_d := limit
	for entry in corpses:
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		var row: Dictionary = entry
		var corpse_id := String(row.get("id", row.get("corpseId", "")))
		if corpse_id.is_empty():
			continue
		var pos := Vector2(float(row.get("x", 0.0)), float(row.get("y", 0.0)))
		var distance := player_pos.distance_to(pos)
		if distance <= best_d:
			best_id = corpse_id
			best_d = distance
	return best_id


func request_open(corpse_id: String) -> String:
	if corpse_id.is_empty():
		return ""
	last_corpse_id = corpse_id
	last_request_id = MatchProtocol.new_request_id()
	NetworkService.send_open_corpse(corpse_id, last_request_id)
	return last_request_id


func request_close(corpse_id: String = "") -> String:
	var id := corpse_id if not corpse_id.is_empty() else last_corpse_id
	if id.is_empty():
		_hide()
		return ""
	last_request_id = MatchProtocol.new_request_id()
	NetworkService.send_close_corpse(id, last_request_id)
	_hide()
	return last_request_id


func request_claim_item(entry_id: String, to_slot_index: int = -1) -> String:
	if last_corpse_id.is_empty() or entry_id.is_empty():
		return ""
	last_request_id = MatchProtocol.new_request_id()
	if _window != null and _window.is_open():
		_window.show_busy()
	NetworkService.send_claim_corpse_item(
		last_corpse_id,
		entry_id,
		last_request_id,
		InventoryService.expected_revision(),
		to_slot_index
	)
	if to_slot_index >= 0:
		InventoryService._begin_pending(last_request_id, "corpse_claim", [entry_id], [to_slot_index])
	return last_request_id


func request_claim_gold() -> String:
	if last_corpse_id.is_empty():
		return ""
	last_request_id = MatchProtocol.new_request_id()
	if _window != null and _window.is_open():
		_window.show_busy()
	NetworkService.send_claim_corpse_gold(last_corpse_id, last_request_id)
	return last_request_id


func request_loot_all(corpse_id: String = "") -> String:
	var id := corpse_id if not corpse_id.is_empty() else last_corpse_id
	if id.is_empty():
		return ""
	last_corpse_id = id
	last_request_id = MatchProtocol.new_request_id()
	if _window != null and _window.is_open():
		_window.show_busy()
	NetworkService.send_loot_all_corpse(id, last_request_id, InventoryService.expected_revision())
	return last_request_id


func begin_drag(slot: ItemSlotView) -> void:
	if slot == null or slot.is_empty():
		return
	if not entry_claimable(slot.instance):
		return
	DragDropService.begin({
		"kind": "corpse_item",
		"fromKind": "corpse",
		"fromSlot": slot.slot_index,
		"entryId": String(slot.instance.get("entryId", "")),
		"corpseId": last_corpse_id,
		"instanceId": String(slot.instance.get("entryId", "")),
		"itemId": ItemPresentation.item_id_of(slot.instance),
		"quantity": int(slot.instance.get("quantity", 1)),
		"split": false,
	})


func entry_claimable(instance: Dictionary) -> bool:
	var state := String(instance.get("state", ""))
	if state == "CLAIMED" or state == "EXPIRED" or state == "CLAIMING" or state == "ROLL_PENDING":
		return false
	if state == "AWARDED_PENDING_PICKUP" and not bool(instance.get("reservedToSelf", false)):
		return false
	if state == "PRIVATE_AVAILABLE" and not bool(last_corpse.get("eligible", false)):
		return false
	return not String(instance.get("entryId", "")).is_empty()


func _on_corpse_state(payload: Dictionary) -> void:
	var corpse: Dictionary = payload.get("corpse", {})
	if typeof(corpse) != TYPE_DICTIONARY:
		return
	var corpse_id := String(corpse.get("corpseId", ""))
	if corpse_id.is_empty():
		return
	last_corpse_id = corpse_id
	last_corpse = corpse.duplicate(true)
	_ensure_window()
	_window.present(last_corpse)
	WindowManager.open(WindowManager.INVENTORY)
	WindowManager.open(WindowManager.CORPSE)
	corpse_opened.emit(corpse_id)


func _on_corpse_removed(payload: Dictionary) -> void:
	var corpse_id := String(payload.get("corpse_id", payload.get("corpseId", "")))
	if corpse_id.is_empty() or corpse_id != last_corpse_id:
		return
	_hide()


func _on_action_result(payload: Dictionary) -> void:
	var request_id := String(payload.get("request_id", payload.get("requestId", "")))
	if request_id.is_empty() or request_id != last_request_id:
		return
	var loot_all: Variant = payload.get("loot_all", [])
	if typeof(loot_all) == TYPE_ARRAY and not (loot_all as Array).is_empty():
		last_loot_all = (loot_all as Array).duplicate(true)
		if _window != null and _window.is_open():
			_window.show_status(_loot_all_summary(last_loot_all), not bool(payload.get("result_ok", false)))
		return
	if bool(payload.get("result_ok", payload.get("ok", false))):
		if _window != null and _window.is_open():
			_window.show_status("")
		return
	var code := String(payload.get("code", "action_failed"))
	var message := _error_message(code)
	last_notice = message
	if _window != null and _window.is_open():
		_window.show_status(message, true)
	else:
		AppState.report_recoverable(code, message)


func _on_zone_state_updated() -> void:
	if last_corpse_id.is_empty() or not is_open():
		return
	if not AppState.zone_view_is_full:
		return
	var corpses: Variant = AppState.zone_view.get("corpses", [])
	if typeof(corpses) != TYPE_ARRAY:
		return
	for entry in corpses:
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		if String(entry.get("id", entry.get("corpseId", ""))) == last_corpse_id:
			return
	_hide()


func _on_window_closed(window_id: String) -> void:
	if window_id != WindowManager.CORPSE:
		return
	if _closing:
		return
	if _window != null and _window.is_open():
		request_close()


func _on_loot_all() -> void:
	request_loot_all()


func _on_gold() -> void:
	request_claim_gold()


func _on_close() -> void:
	request_close()


func _on_entry_pressed(slot: ItemSlotView) -> void:
	begin_drag(slot)


func _on_entry_right_clicked(slot: ItemSlotView) -> void:
	ItemContextRouter.handle_slot(slot)


func _ensure_window() -> void:
	if _window != null and is_instance_valid(_window):
		return
	_window = CorpseWindow.new()
	_window.name = "CorpseWindow"
	add_child(_window)
	if not _window.loot_all_requested.is_connected(_on_loot_all):
		_window.loot_all_requested.connect(_on_loot_all)
	if not _window.gold_requested.is_connected(_on_gold):
		_window.gold_requested.connect(_on_gold)
	if not _window.close_requested.is_connected(_on_close):
		_window.close_requested.connect(_on_close)
	if not _window.entry_pressed.is_connected(_on_entry_pressed):
		_window.entry_pressed.connect(_on_entry_pressed)
	if not _window.entry_right_clicked.is_connected(_on_entry_right_clicked):
		_window.entry_right_clicked.connect(_on_entry_right_clicked)


func _hide() -> void:
	if _closing:
		return
	_closing = true
	if _window != null:
		_window.close_window()
	if WindowManager.is_open(WindowManager.CORPSE):
		WindowManager.close(WindowManager.CORPSE)
	last_corpse = {}
	_emit_closed()
	_closing = false


func _emit_closed() -> void:
	corpse_closed.emit()


func _loot_all_summary(results: Array) -> String:
	var claimed := 0
	var left := 0
	var rolling := 0
	var lines: PackedStringArray = PackedStringArray()
	for entry in results:
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		var row: Dictionary = entry
		var code := String(row.get("code", ""))
		if bool(row.get("claimed", false)):
			claimed += 1
			continue
		if code == "roll_pending":
			rolling += 1
			continue
		left += 1
		lines.append(_error_message(code))
	var summary := "Looted %s." % str(claimed)
	if rolling > 0:
		summary += " %s waiting on Need/Greed." % str(rolling)
	if left > 0:
		summary += " %s left behind." % str(left)
		if lines.size() > 0:
			summary += " %s" % lines[0]
	return summary


func _error_message(code: String) -> String:
	match code:
		"not_eligible":
			return "You cannot loot that yet."
		"loot_item_no_longer_available":
			return "That loot is gone."
		"inventory_full":
			return "Your bag is full."
		"invalid_slot", "stack_incompatible":
			return "That bag slot cannot receive this item."
		"out_of_range":
			return "You are too far away."
		"player_dead":
			return "You cannot loot while defeated."
		"invalid_target":
			return "That corpse is gone."
		"roll_pending":
			return "Need/Greed is still pending."
		"inventory_stale":
			return "Inventory changed. Refreshing."
		"stack_full":
			return "That stack is already full."
		_:
			return "The corpse rejected that request."
