extends Node

## Mirrors server-authoritative character progression. The client never submits XP amounts.

signal progression_changed
signal request_started(request_id: String)

var class_id: String = ""
var class_display_name: String = ""
var level: int = 1
var current_xp: int = 0
var xp_to_next: int = 0
var at_max_level: bool = false
var base_attributes: Dictionary = {}
var allocated_attributes: Dictionary = {}
var derived: Dictionary = {}
var unspent_attribute_points: int = 0
var unspent_skill_points: int = 0
var unlocked_ability_ids: Array = []

var _canonical: Dictionary = {}
var _pending_request_id: String = ""


func _ready() -> void:
	if not AppState.zone_state_updated.is_connected(_on_zone_state_updated):
		AppState.zone_state_updated.connect(_on_zone_state_updated)
	if not AppState.logged_out.is_connected(reset):
		AppState.logged_out.connect(reset)
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
	at_max_level = false
	base_attributes = {}
	allocated_attributes = {}
	derived = {}
	unspent_attribute_points = 0
	unspent_skill_points = 0
	unlocked_ability_ids = []
	_canonical = {}
	_pending_request_id = ""
	progression_changed.emit()


func reset_for_tests() -> void:
	reset()


func apply_canonical(state: Dictionary) -> void:
	_canonical = state.duplicate(true)
	_pending_request_id = ""
	_apply_fields(state)
	progression_changed.emit()


func request_allocate(attribute_id: String, amount: int = 1) -> String:
	if attribute_id.is_empty() or amount < 1 or amount > unspent_attribute_points:
		return ""
	var request_id := MatchProtocol.new_request_id()
	_pending_request_id = request_id
	_preview_allocate(attribute_id, amount)
	NetworkService.send_allocate_attributes(attribute_id, amount, request_id)
	request_started.emit(request_id)
	return request_id


func attribute_ids() -> PackedStringArray:
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


func _preview_allocate(attribute_id: String, amount: int) -> void:
	unspent_attribute_points = maxi(unspent_attribute_points - amount, 0)
	allocated_attributes[attribute_id] = int(allocated_attributes.get(attribute_id, 0)) + amount
	progression_changed.emit()


func _apply_fields(state: Dictionary) -> void:
	class_id = String(state.get("classId", ""))
	class_display_name = String(state.get("classDisplayName", class_id))
	level = int(state.get("level", 1))
	current_xp = int(state.get("currentXp", 0))
	xp_to_next = int(state.get("xpToNext", 0))
	at_max_level = bool(state.get("atMaxLevel", false))
	base_attributes = _copy_number_map(state.get("baseAttributes", {}))
	allocated_attributes = _copy_number_map(state.get("allocatedAttributes", {}))
	derived = _copy_number_map(state.get("derived", {}))
	unspent_attribute_points = int(state.get("unspentAttributePoints", 0))
	unspent_skill_points = int(state.get("unspentSkillPoints", 0))
	unlocked_ability_ids = []
	var unlocked: Variant = state.get("unlockedAbilityIds", [])
	if typeof(unlocked) == TYPE_ARRAY:
		for entry in unlocked:
			unlocked_ability_ids.append(String(entry))


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
		return
	if not _canonical.is_empty():
		apply_canonical(_canonical)


func _copy_number_map(value: Variant) -> Dictionary:
	var out := {}
	if typeof(value) != TYPE_DICTIONARY:
		return out
	var data: Dictionary = value
	for key in data.keys():
		out[String(key)] = int(data[key])
	return out
