extends Node

## Mirrors server quest state. Dialogue Manager must not mutate this directly.

signal quests_changed

var _quests: Dictionary = {}


func _ready() -> void:
	if not AppState.zone_state_updated.is_connected(_on_zone_state_updated):
		AppState.zone_state_updated.connect(_on_zone_state_updated)
	if not AppState.logged_out.is_connected(reset):
		AppState.logged_out.connect(reset)
	if not NetworkService.quest_state_received.is_connected(_on_quest_state):
		NetworkService.quest_state_received.connect(_on_quest_state)


func reset() -> void:
	_quests.clear()
	quests_changed.emit()


func reset_for_tests() -> void:
	reset()


func apply_quests(quests: Array) -> void:
	_quests.clear()
	for entry in quests:
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		var quest: Dictionary = (entry as Dictionary).duplicate(true)
		var quest_id := String(quest.get("questId", ""))
		if quest_id.is_empty():
			continue
		_quests[quest_id] = quest
	quests_changed.emit()


func request_accept(quest_id: String) -> void:
	if quest_id.is_empty():
		return
	NetworkService.send_quest_accept(quest_id)


func is_accepted(quest_id: String) -> bool:
	if not _quests.has(quest_id):
		return false
	return String((_quests[quest_id] as Dictionary).get("status", "")) == "accepted"


func is_completed(quest_id: String) -> bool:
	if not _quests.has(quest_id):
		return false
	return String((_quests[quest_id] as Dictionary).get("status", "")) == "completed"


func is_ready(quest_id: String) -> bool:
	if not is_accepted(quest_id):
		return false
	var quest: Dictionary = _quests[quest_id]
	var objectives: Array = quest.get("objectives", [])
	if objectives.is_empty():
		return false
	for entry in objectives:
		if typeof(entry) != TYPE_DICTIONARY:
			return false
		if int(entry.get("current", 0)) < int(entry.get("required", 1)):
			return false
	return true


func has_quest(quest_id: String) -> bool:
	return _quests.has(quest_id)


func get_quest(quest_id: String) -> Dictionary:
	if not _quests.has(quest_id):
		return {}
	return (_quests[quest_id] as Dictionary).duplicate(true)


func journal_view() -> Dictionary:
	if _quests.is_empty():
		return {"empty": true}
	var ids: Array = _quests.keys()
	ids.sort()
	var quest: Dictionary = _quests[ids[0]]
	var quest_id := String(quest.get("questId", ids[0]))
	var content_quest: Dictionary = ContentRegistry.get_by_id(quest_id)
	var title := String(quest.get("displayName", ""))
	if title.is_empty():
		title = String(content_quest.get("displayName", quest_id))
	var objectives: Array = quest.get("objectives", [])
	var objective: Dictionary = {}
	if not objectives.is_empty() and typeof(objectives[0]) == TYPE_DICTIONARY:
		objective = objectives[0]
	var item_id := String(objective.get("itemId", ""))
	var item: Dictionary = ContentRegistry.get_by_id(item_id)
	var item_name := String(item.get("displayName", item_id))
	var objective_text := "Unknown objective"
	if not item_name.is_empty():
		objective_text = "Acquire %s" % item_name
	var turn_in_id := String(quest.get("turnInNpcId", ""))
	var npc: Dictionary = ContentRegistry.get_by_id(turn_in_id)
	var turn_in_name := String(npc.get("displayName", turn_in_id))
	return {
		"empty": false,
		"title": title,
		"state": _journal_state(quest_id),
		"objective": objective_text,
		"current": int(objective.get("current", 0)),
		"required": int(objective.get("required", 0)),
		"turn_in_npc": turn_in_name,
	}


func _journal_state(quest_id: String) -> String:
	if is_completed(quest_id):
		return "Completed"
	if is_ready(quest_id):
		return "Ready to turn in"
	if is_accepted(quest_id):
		return "In progress"
	return String(get_quest(quest_id).get("status", "Unknown"))


func _on_zone_state_updated() -> void:
	if not AppState.zone_view_is_full:
		return
	var quests: Variant = AppState.zone_view.get("quests", [])
	if typeof(quests) == TYPE_ARRAY:
		apply_quests(quests)


func _on_quest_state(payload: Dictionary) -> void:
	var quests: Variant = payload.get("quests", [])
	if typeof(quests) == TYPE_ARRAY:
		apply_quests(quests)
