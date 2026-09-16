extends Node

## Mirrors server-authoritative character progression. The client never submits XP amounts.

signal progression_changed
signal request_started(request_id: String)
signal pending_changed
signal action_failed(code: String, message: String)
signal action_succeeded(request_id: String)
signal level_up_events(lines: PackedStringArray)

const REQUEST_TIMEOUT_SEC := 8.0

var class_id: String = ""
var class_display_name: String = ""
var level: int = 1
var current_xp: int = 0
var xp_to_next: int = 0
var lifetime_xp: int = 0
var at_max_level: bool = false
var base_attributes: Dictionary = {}
var allocated_attributes: Dictionary = {}
var derived: Dictionary = {}
var unspent_attribute_points: int = 0
var unspent_skill_points: int = 0
var unspent_free_stat_points: int = 0
var unspent_class_points: int = 0
var unspent_branch_points: int = 0
var free_stat_allocations: Dictionary = {}
var auto_assign_enabled: bool = false
var pending_branch_selection: bool = false
var branch_id: String = ""
var unlocked_ability_ids: Array = []
var purchased_class_node_ids: Array = []
var purchased_branch_node_ranks: Dictionary = {}
var hotbar_assignments: Array = []
var events: Array = []
var pending_allocations: Dictionary = {}
var last_rejection_code: String = ""
var last_rejection_message: String = ""
var last_level_up_lines: PackedStringArray = PackedStringArray()

var _canonical: Dictionary = {}
var _pending_request_id: String = ""
var _pending_kind: String = ""
var _submitted_pending: Dictionary = {}
var _character_id: String = ""
var _timeout: Timer
var _seen_event_fingerprint: String = ""


func _ready() -> void:
	_timeout = Timer.new()
	_timeout.one_shot = true
	_timeout.wait_time = REQUEST_TIMEOUT_SEC
	_timeout.timeout.connect(_on_request_timeout)
	add_child(_timeout)
	if not AppState.zone_state_updated.is_connected(_on_zone_state_updated):
		AppState.zone_state_updated.connect(_on_zone_state_updated)
	if not AppState.logged_out.is_connected(reset):
		AppState.logged_out.connect(reset)
	if not AppState.character_loaded.is_connected(_on_character_loaded):
		AppState.character_loaded.connect(_on_character_loaded)
	if not AppState.reconnecting_changed.is_connected(_on_reconnecting_changed):
		AppState.reconnecting_changed.connect(_on_reconnecting_changed)
	if not NetworkService.progression_state_received.is_connected(_on_progression_state):
		NetworkService.progression_state_received.connect(_on_progression_state)
	if not NetworkService.action_result_received.is_connected(_on_action_result):
		NetworkService.action_result_received.connect(_on_action_result)


func reset() -> void:
	class_id = ""
	class_display_name = ""
	level = 1
	current_xp = 0
	xp_to_next = 0
	lifetime_xp = 0
	at_max_level = false
	base_attributes = {}
	allocated_attributes = {}
	derived = {}
	unspent_attribute_points = 0
	unspent_skill_points = 0
	unspent_free_stat_points = 0
	unspent_class_points = 0
	unspent_branch_points = 0
	free_stat_allocations = {}
	auto_assign_enabled = false
	pending_branch_selection = false
	branch_id = ""
	unlocked_ability_ids = []
	purchased_class_node_ids = []
	purchased_branch_node_ranks = {}
	hotbar_assignments = []
	events = []
	pending_allocations = {}
	last_rejection_code = ""
	last_rejection_message = ""
	last_level_up_lines = PackedStringArray()
	_canonical = {}
	_pending_request_id = ""
	_pending_kind = ""
	_submitted_pending = {}
	_character_id = ""
	_seen_event_fingerprint = ""
	if _timeout != null:
		_timeout.stop()
	progression_changed.emit()
	pending_changed.emit()


func reset_for_tests() -> void:
	reset()


func apply_canonical(state: Dictionary) -> void:
	_canonical = state.duplicate(true)
	_clear_inflight()
	_apply_fields(state)
	_note_level_up_events()
	progression_changed.emit()


func request_allocate(attribute_id: String, amount: int = 1) -> String:
	if is_link_dead():
		return ""
	if attribute_id.is_empty() or amount < 1 or amount > unspent_stat_points():
		return ""
	var request_id := MatchProtocol.new_request_id()
	_begin_request(request_id, "allocate")
	_preview_allocate(attribute_id, amount)
	NetworkService.send_allocate_attributes(attribute_id, amount, request_id)
	request_started.emit(request_id)
	return request_id


func request_allocate_batch(allocations: Array) -> String:
	if is_link_dead():
		return ""
	if allocations.is_empty():
		return ""
	var total := 0
	for entry in allocations:
		if typeof(entry) != TYPE_DICTIONARY:
			return ""
		var amount := int((entry as Dictionary).get("amount", 0))
		if amount < 1:
			return ""
		total += amount
	if total < 1 or total > unspent_stat_points():
		return ""
	var request_id := MatchProtocol.new_request_id()
	_begin_request(request_id, "allocate_batch")
	for entry in allocations:
		var row: Dictionary = entry
		_preview_allocate(String(row.get("statId", row.get("attributeId", ""))), int(row.get("amount", 0)))
	NetworkService.send_allocate_attributes_batch(allocations, request_id)
	request_started.emit(request_id)
	return request_id


func queue_pending_stat(stat_id: String, amount: int = 1) -> bool:
	if amount < 1 or stat_id.is_empty():
		return false
	if remaining_preview() < amount:
		return false
	pending_allocations[stat_id] = int(pending_allocations.get(stat_id, 0)) + amount
	pending_changed.emit()
	progression_changed.emit()
	return true


func clear_pending_allocations() -> void:
	if pending_allocations.is_empty():
		return
	pending_allocations = {}
	pending_changed.emit()
	progression_changed.emit()


func confirm_pending_allocations() -> String:
	if _is_busy() or is_link_dead():
		return ""
	var allocations := pending_as_batch()
	if allocations.is_empty():
		return ""
	_submitted_pending = pending_allocations.duplicate(true)
	var request_id := request_allocate_batch(allocations)
	if request_id.is_empty():
		pending_allocations = _submitted_pending.duplicate(true)
		_submitted_pending = {}
		pending_changed.emit()
		return ""
	pending_allocations = {}
	pending_changed.emit()
	return request_id


func pending_total() -> int:
	var total := 0
	for key in pending_allocations.keys():
		total += int(pending_allocations[key])
	return total


func remaining_preview() -> int:
	return maxi(unspent_stat_points() - pending_total(), 0)


func pending_as_batch() -> Array:
	var allocations: Array = []
	for stat_id in pending_allocations.keys():
		var amount := int(pending_allocations[stat_id])
		if amount < 1:
			continue
		allocations.append({"statId": String(stat_id), "amount": amount})
	return allocations


func preview_free_for(stat_id: String) -> int:
	return int(free_stat_allocations.get(stat_id, 0)) + int(pending_allocations.get(stat_id, 0))


func request_respec(npc_id: String) -> String:
	if is_link_dead():
		return ""
	if npc_id.is_empty():
		return ""
	var request_id := MatchProtocol.new_request_id()
	_begin_request(request_id, "respec")
	NetworkService.send_trainer_respec(npc_id, request_id)
	request_started.emit(request_id)
	return request_id


func request_select_branch(p_branch_id: String) -> String:
	if is_link_dead():
		return ""
	if p_branch_id.is_empty():
		return ""
	var request_id := MatchProtocol.new_request_id()
	_begin_request(request_id, "select_branch")
	NetworkService.send_select_branch(p_branch_id, request_id)
	request_started.emit(request_id)
	return request_id


func request_purchase_talent(tree_id: String, node_id: String, requested_rank: int = 1) -> String:
	if is_link_dead():
		return ""
	if tree_id.is_empty() or node_id.is_empty() or requested_rank < 1:
		return ""
	var request_id := MatchProtocol.new_request_id()
	_begin_request(request_id, "purchase_talent")
	NetworkService.send_purchase_talent(tree_id, node_id, requested_rank, request_id)
	request_started.emit(request_id)
	return request_id


func request_set_auto_assign(enabled: bool) -> String:
	if is_link_dead():
		return ""
	if enabled == auto_assign_enabled:
		return ""
	var request_id := MatchProtocol.new_request_id()
	_begin_request(request_id, "set_auto_assign")
	NetworkService.send_set_auto_assign(enabled, request_id)
	request_started.emit(request_id)
	return request_id


func request_auto_assign_unspent() -> String:
	if is_link_dead():
		return ""
	if unspent_stat_points() < 1:
		return ""
	clear_pending_allocations()
	var request_id := MatchProtocol.new_request_id()
	_begin_request(request_id, "auto_assign")
	NetworkService.send_auto_assign_unspent_points(request_id)
	request_started.emit(request_id)
	return request_id


func unspent_stat_points() -> int:
	if uses_canonical_class():
		return unspent_free_stat_points
	return unspent_attribute_points


func attribute_ids() -> PackedStringArray:
	if uses_canonical_class():
		var canonical := PackedStringArray()
		for stat_id in ProgressionCatalog.STAT_IDS:
			canonical.append(String(stat_id))
		return canonical
	var ids := PackedStringArray()
	for id in base_attributes.keys():
		ids.append(String(id))
	ids.sort()
	return ids


func derived_ids() -> PackedStringArray:
	var ids := PackedStringArray()
	for id in derived.keys():
		ids.append(String(id))
	ids.sort()
	return ids


func uses_canonical_class() -> bool:
	return class_id == "class.warrior" or class_id == "class.mage" or class_id == "class.marksman" or class_id == "class.mystic"


func uses_mana() -> bool:
	return ProgressionCatalog.uses_mana(class_id)


func is_busy() -> bool:
	return _is_busy()


func is_link_dead() -> bool:
	var reason := String(AppState.character_view.get("playBlockedReason", AppState.character_view.get("activePresenceState", "")))
	return reason == "link_dead" or reason == "LINK_DEAD"


func respec_summary() -> Dictionary:
	var cost := ProgressionCatalog.respec_gold_cost(level)
	return {
		"gold_cost": cost,
		"gold_have": WalletService.gold,
		"can_afford": WalletService.gold >= cost,
		"resets": "Free allocations, class-node purchases, branch ranks, branch choice, signature/capstone/buyable-active/branch-passive ownership, and invalid hotbar slots.",
		"remains": "Class, level, XP, automatic growth, the level-2 basic, equipment, and inventory remain.",
		"unspent_free": ProgressionCatalog.earned_free_points(level),
		"unspent_class": ProgressionCatalog.earned_class_points(level),
		"unspent_branch": ProgressionCatalog.earned_branch_points(level) if level >= 5 else 0,
		"reselect_branch": level >= 5,
	}


func node_lock(tree_id: String, node_id: String) -> Dictionary:
	return ProgressionCatalog.evaluate_node_lock(
		tree_id,
		node_id,
		class_id,
		branch_id,
		level,
		unspent_class_points,
		unspent_branch_points,
		purchased_class_node_ids,
		purchased_branch_node_ranks,
	)


func _preview_allocate(attribute_id: String, amount: int) -> void:
	if uses_canonical_class():
		unspent_free_stat_points = maxi(unspent_free_stat_points - amount, 0)
		unspent_attribute_points = unspent_free_stat_points
		free_stat_allocations[attribute_id] = int(free_stat_allocations.get(attribute_id, 0)) + amount
		allocated_attributes[attribute_id] = int(allocated_attributes.get(attribute_id, 0)) + amount
	else:
		unspent_attribute_points = maxi(unspent_attribute_points - amount, 0)
		allocated_attributes[attribute_id] = int(allocated_attributes.get(attribute_id, 0)) + amount
	progression_changed.emit()


func _apply_fields(state: Dictionary) -> void:
	class_id = String(state.get("classId", ""))
	class_display_name = String(state.get("classDisplayName", class_id))
	level = int(state.get("level", 1))
	current_xp = int(state.get("currentXp", 0))
	xp_to_next = int(state.get("xpToNext", 0))
	lifetime_xp = int(state.get("lifetimeXp", 0))
	at_max_level = bool(state.get("atMaxLevel", false))
	base_attributes = _copy_number_map(state.get("baseAttributes", {}))
	allocated_attributes = _copy_number_map(state.get("allocatedAttributes", {}))
	derived = _copy_number_map(state.get("derived", {}))
	unspent_attribute_points = int(state.get("unspentAttributePoints", 0))
	unspent_skill_points = int(state.get("unspentSkillPoints", 0))
	unspent_free_stat_points = int(state.get("unspentFreeStatPoints", 0))
	unspent_class_points = int(state.get("unspentClassPoints", 0))
	unspent_branch_points = int(state.get("unspentBranchPoints", 0))
	free_stat_allocations = _copy_number_map(state.get("freeStatAllocations", {}))
	auto_assign_enabled = bool(state.get("autoAssignEnabled", false))
	pending_branch_selection = bool(state.get("pendingBranchSelection", false))
	branch_id = String(state.get("branchId", ""))
	unlocked_ability_ids = _copy_string_list(state.get("unlockedAbilityIds", []))
	purchased_class_node_ids = _copy_string_list(state.get("purchasedClassNodeIds", []))
	purchased_branch_node_ranks = _copy_number_map(state.get("purchasedBranchNodeRanks", {}))
	hotbar_assignments = _copy_string_list(state.get("hotbarAssignments", []))
	events = []
	var incoming: Variant = state.get("events", [])
	if typeof(incoming) == TYPE_ARRAY:
		for entry in incoming:
			events.append(entry)


func _note_level_up_events() -> void:
	var fingerprint := JSON.stringify(events)
	if events.is_empty() or fingerprint == _seen_event_fingerprint:
		return
	_seen_event_fingerprint = fingerprint
	var lines := ProgressionCatalog.event_lines(events, level)
	if lines.is_empty():
		return
	last_level_up_lines = lines
	level_up_events.emit(lines)


func _on_zone_state_updated() -> void:
	if not AppState.zone_view_is_full:
		return
	var payload: Variant = AppState.zone_view.get("progression", {})
	if typeof(payload) != TYPE_DICTIONARY:
		return
	if (payload as Dictionary).is_empty():
		return
	apply_canonical(payload)


func _on_progression_state(payload: Dictionary) -> void:
	var inner: Variant = payload.get("progression", payload)
	if typeof(inner) != TYPE_DICTIONARY:
		return
	apply_canonical(inner)


func _on_action_result(payload: Dictionary) -> void:
	if _pending_request_id.is_empty():
		return
	if String(payload.get("request_id", "")) != _pending_request_id:
		return
	if bool(payload.get("result_ok", false)):
		var request_id := _pending_request_id
		_submitted_pending = {}
		last_rejection_code = ""
		last_rejection_message = ""
		_clear_inflight()
		action_succeeded.emit(request_id)
		return
	var code := String(payload.get("code", "rejected"))
	_fail_request(code, ProgressionCatalog.action_error_text(code))


func _on_request_timeout() -> void:
	if _pending_request_id.is_empty():
		return
	_fail_request("request_timeout", ProgressionCatalog.action_error_text("request_timeout"))


func _fail_request(code: String, message: String) -> void:
	last_rejection_code = code
	last_rejection_message = message
	if not _submitted_pending.is_empty():
		pending_allocations = _submitted_pending.duplicate(true)
		_submitted_pending = {}
		pending_changed.emit()
	_clear_inflight()
	if not _canonical.is_empty():
		_apply_fields(_canonical)
		progression_changed.emit()
	AppState.report_recoverable(code, message)
	action_failed.emit(code, message)


func _begin_request(request_id: String, kind: String) -> void:
	_pending_request_id = request_id
	_pending_kind = kind
	last_rejection_code = ""
	last_rejection_message = ""
	if _timeout != null:
		_timeout.start(REQUEST_TIMEOUT_SEC)


func _clear_inflight() -> void:
	_pending_request_id = ""
	_pending_kind = ""
	if _timeout != null:
		_timeout.stop()


func _is_busy() -> bool:
	return not _pending_request_id.is_empty()


func _on_character_loaded(_created: bool) -> void:
	var next_id := String(AppState.character_view.get("character_id", ""))
	if next_id.is_empty() or next_id == _character_id:
		_character_id = next_id
		return
	reset()
	_character_id = next_id


func _on_reconnecting_changed() -> void:
	if AppState.is_reconnecting:
		clear_pending_allocations()
		_submitted_pending = {}
		_clear_inflight()
		if not _canonical.is_empty():
			_apply_fields(_canonical)
			progression_changed.emit()


func _copy_number_map(value: Variant) -> Dictionary:
	var out := {}
	if typeof(value) != TYPE_DICTIONARY:
		return out
	var data: Dictionary = value
	for key in data.keys():
		out[String(key)] = float(data[key])
	return out


func _copy_string_list(value: Variant) -> Array:
	var list: Array = []
	if typeof(value) != TYPE_ARRAY:
		return list
	for entry in value:
		list.append(String(entry))
	return list
