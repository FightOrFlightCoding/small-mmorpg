extends Node

## Mirrors server-authoritative abilities, hotbar, casts, and cooldowns. The client never submits timings or magnitudes.

signal abilities_changed
signal targeting_changed
signal request_started(request_id: String)

const HOTBAR_SIZE := 8

var unlocked_ability_ids: Array = []
var hotbar: Array = []
var ability_ranks: Dictionary = {}
var resources: Dictionary = {}
var cooldowns: Dictionary = {}
var global_cooldown_remaining: int = 0
var active_cast: Dictionary = {}
var effects: Array = []
var targeting_ability_id: String = ""
var last_rejection_code: String = ""
var last_rejection_message: String = ""

var _pending_request_id: String = ""
var _pending_ids: Dictionary = {}


func _ready() -> void:
	_reset_hotbar()
	if not AppState.zone_state_updated.is_connected(_on_zone_state_updated):
		AppState.zone_state_updated.connect(_on_zone_state_updated)
	if not AppState.logged_out.is_connected(reset):
		AppState.logged_out.connect(reset)
	if not NetworkService.ability_state_received.is_connected(_on_ability_state):
		NetworkService.ability_state_received.connect(_on_ability_state)
	if not NetworkService.action_result_received.is_connected(_on_action_result):
		NetworkService.action_result_received.connect(_on_action_result)


func reset() -> void:
	unlocked_ability_ids = []
	_reset_hotbar()
	ability_ranks = {}
	resources = {}
	cooldowns = {}
	global_cooldown_remaining = 0
	active_cast = {}
	effects = []
	targeting_ability_id = ""
	last_rejection_code = ""
	last_rejection_message = ""
	_pending_request_id = ""
	_pending_ids = {}
	abilities_changed.emit()
	targeting_changed.emit()


func reset_for_tests() -> void:
	reset()


func owns_request(request_id: String) -> bool:
	return _pending_ids.has(request_id)


func is_targeting() -> bool:
	return not targeting_ability_id.is_empty()


func cancel_targeting() -> void:
	if targeting_ability_id.is_empty():
		return
	targeting_ability_id = ""
	targeting_changed.emit()


func try_hotbar(slot_index: int) -> String:
	if slot_index < 0 or slot_index >= HOTBAR_SIZE:
		return ""
	if slot_index >= hotbar.size():
		return ""
	var ability_id := String(hotbar[slot_index])
	if ability_id.is_empty():
		return ""
	return try_use(ability_id)


func try_use(ability_id: String) -> String:
	if ability_id.is_empty() or NetworkService.match_id.is_empty():
		return ""
	var definition := ability_definition(ability_id)
	if definition.is_empty():
		return ""
	var mode := String(definition.get("targetMode", "entity"))
	if mode == "ground_point":
		targeting_ability_id = ability_id
		targeting_changed.emit()
		return ""
	if mode == "self":
		return _send_use(ability_id, "", Vector2.INF)
	var target_id := _entity_target_id(definition)
	if target_id.is_empty():
		_reject("invalid_target", "No valid target.")
		return ""
	return _send_use(ability_id, target_id, Vector2.INF)


func confirm_ground_target(point: Vector2) -> String:
	if targeting_ability_id.is_empty():
		return ""
	var ability_id := targeting_ability_id
	targeting_ability_id = ""
	targeting_changed.emit()
	return _send_use(ability_id, "", point)


func request_cancel_cast() -> String:
	if NetworkService.match_id.is_empty():
		return ""
	if active_cast.is_empty():
		cancel_targeting()
		return ""
	var request_id := MatchProtocol.new_request_id()
	_note_pending(request_id)
	NetworkService.send_cancel_cast(request_id)
	request_started.emit(request_id)
	return request_id


func request_assign_hotbar(slot_index: int, ability_id: String) -> String:
	if NetworkService.match_id.is_empty():
		return ""
	var request_id := MatchProtocol.new_request_id()
	_note_pending(request_id)
	NetworkService.send_assign_hotbar(slot_index, ability_id, request_id)
	request_started.emit(request_id)
	return request_id


func request_unlock(ability_id: String) -> String:
	if ability_id.is_empty() or NetworkService.match_id.is_empty():
		return ""
	var request_id := MatchProtocol.new_request_id()
	_note_pending(request_id)
	NetworkService.send_unlock_ability(ability_id, request_id)
	request_started.emit(request_id)
	return request_id


func ability_definition(ability_id: String) -> Dictionary:
	return ContentRegistry.get_by_id(ability_id)


func catalog_ability_ids() -> PackedStringArray:
	return ContentRegistry.ids_of_kind("ability")


func resource_cost_text(ability_id: String) -> String:
	var definition := ability_definition(ability_id)
	if definition.is_empty():
		return ""
	var costs: Variant = definition.get("resourceCosts", [])
	if typeof(costs) != TYPE_ARRAY or (costs as Array).is_empty():
		return "No cost"
	var parts: PackedStringArray = PackedStringArray()
	for entry in costs:
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		var cost: Dictionary = entry
		var resource_id := String(cost.get("resourceId", ""))
		var amount := int(cost.get("amount", 0))
		var have := int(resources.get(resource_id, 0))
		parts.append("%s %s/%s" % [resource_id, str(have), str(amount)])
	return "  ".join(parts)


func cooldown_remaining(ability_id: String) -> int:
	return int(cooldowns.get(ability_id, 0))


func can_afford(ability_id: String) -> bool:
	var definition := ability_definition(ability_id)
	if definition.is_empty():
		return false
	var costs: Variant = definition.get("resourceCosts", [])
	if typeof(costs) != TYPE_ARRAY:
		return true
	for entry in costs:
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		var cost: Dictionary = entry
		var resource_id := String(cost.get("resourceId", ""))
		var amount := int(cost.get("amount", 0))
		if int(resources.get(resource_id, 0)) < amount:
			return false
	return true


func apply_canonical(state: Dictionary) -> void:
	unlocked_ability_ids = _copy_string_list(state.get("unlockedAbilityIds", []))
	hotbar = _copy_string_list(state.get("hotbar", []))
	if hotbar.size() < HOTBAR_SIZE:
		while hotbar.size() < HOTBAR_SIZE:
			hotbar.append("")
	ability_ranks = _copy_number_map(state.get("abilityRanks", {}))
	resources = _copy_number_map(state.get("resources", {}))
	cooldowns = _copy_number_map(state.get("cooldowns", {}))
	global_cooldown_remaining = int(state.get("globalCooldownRemaining", 0))
	var cast: Variant = state.get("activeCast", {})
	if typeof(cast) == TYPE_DICTIONARY:
		active_cast = (cast as Dictionary).duplicate(true)
	else:
		active_cast = {}
	effects = _copy_array(state.get("effects", []))
	abilities_changed.emit()


func _send_use(ability_id: String, target_id: String, point: Vector2) -> String:
	var extra: Dictionary = {"abilityId": ability_id}
	if not target_id.is_empty():
		extra["targetId"] = target_id
	if point != Vector2.INF:
		extra["targetX"] = point.x
		extra["targetY"] = point.y
	var request_id := MatchProtocol.new_request_id()
	extra["requestId"] = request_id
	_note_pending(request_id)
	NetworkService.send_use_ability(extra)
	request_started.emit(request_id)
	return request_id


func _entity_target_id(definition: Dictionary) -> String:
	var relation := String(definition.get("relationFilter", "hostile"))
	if relation == "self":
		return String(AppState.zone_view.get("self_id", ""))
	if relation == "hostile":
		return AttackIntent.nearest_enemy_id(_local_pose(), AppState.zone_view.get("enemies", []))
	if relation == "friendly":
		return String(AppState.zone_view.get("self_id", ""))
	return AttackIntent.nearest_enemy_id(_local_pose(), AppState.zone_view.get("enemies", []))


func _local_pose() -> Vector2:
	var self_id := String(AppState.zone_view.get("self_id", ""))
	for entry in AppState.zone_view.get("players", []):
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		if String(entry.get("userId", "")) == self_id:
			return Vector2(float(entry.get("x", 0.0)), float(entry.get("y", 0.0)))
	return Vector2.ZERO


func _on_zone_state_updated() -> void:
	if AppState.zone_view_is_full:
		var payload: Variant = AppState.zone_view.get("abilities", {})
		if typeof(payload) == TYPE_DICTIONARY and not (payload as Dictionary).is_empty():
			apply_canonical(payload)
	_merge_public_player()


func _merge_public_player() -> void:
	var self_id := String(AppState.zone_view.get("self_id", ""))
	for entry in AppState.zone_view.get("players", []):
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		if String(entry.get("userId", "")) != self_id:
			continue
		var player: Dictionary = entry
		if typeof(player.get("resources", null)) == TYPE_DICTIONARY:
			resources = _copy_number_map(player["resources"])
		if typeof(player.get("effects", null)) == TYPE_ARRAY:
			effects = _copy_array(player["effects"])
		var cast: Variant = player.get("activeCast", {})
		if typeof(cast) == TYPE_DICTIONARY:
			active_cast = (cast as Dictionary).duplicate(true)
		else:
			active_cast = {}
		abilities_changed.emit()
		return


func _on_ability_state(payload: Dictionary) -> void:
	var inner: Variant = payload.get("abilities", payload)
	if typeof(inner) != TYPE_DICTIONARY:
		return
	apply_canonical(inner)


func _on_action_result(payload: Dictionary) -> void:
	var request_id := String(payload.get("request_id", ""))
	if request_id.is_empty() or not _pending_ids.has(request_id):
		return
	_pending_ids.erase(request_id)
	if bool(payload.get("result_ok", false)):
		last_rejection_code = ""
		last_rejection_message = ""
		return
	_reject(String(payload.get("code", "ability_failed")), _message_for(String(payload.get("code", "ability_failed"))))


func _reject(code: String, message: String) -> void:
	last_rejection_code = code
	last_rejection_message = message
	AppState.report_recoverable(code, message)
	abilities_changed.emit()


func _message_for(code: String) -> String:
	match code:
		"ability_locked":
			return "That ability is locked."
		"out_of_range":
			return "Target is out of range."
		"invalid_relation", "pvp_disabled":
			return "That target is not allowed."
		"insufficient_resource":
			return "Not enough resource."
		"on_cooldown":
			return "That ability is not ready."
		"on_global_cooldown":
			return "You are on global cooldown."
		"player_dead":
			return "You cannot act while defeated."
		"control_restricted":
			return "You cannot act while stunned."
		"already_casting":
			return "You are already casting."
		"invalid_target":
			return "Invalid target."
		"line_of_sight":
			return "No line of sight."
		"insufficient_points":
			return "Not enough skill points."
		_:
			return "The ability request was rejected (%s)." % code


func _note_pending(request_id: String) -> void:
	_pending_request_id = request_id
	_pending_ids[request_id] = true


func _reset_hotbar() -> void:
	hotbar = []
	for _i in range(HOTBAR_SIZE):
		hotbar.append("")


func _copy_string_list(value: Variant) -> Array:
	var list: Array = []
	if typeof(value) != TYPE_ARRAY:
		return list
	for entry in value:
		list.append(String(entry))
	return list


func _copy_number_map(value: Variant) -> Dictionary:
	var out := {}
	if typeof(value) != TYPE_DICTIONARY:
		return out
	var data: Dictionary = value
	for key in data.keys():
		out[String(key)] = int(data[key])
	return out


func _copy_array(value: Variant) -> Array:
	if typeof(value) != TYPE_ARRAY:
		return []
	return (value as Array).duplicate(true)
