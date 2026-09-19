extends Node

## Mirrors Need/Greed rolls and sends Need/Greed/Pass intentions. Never submits a roll number.

signal feed_line(message: String)
signal rolls_changed

var last_request_id: String = ""
var last_notice: String = ""
var rolls: Dictionary = {}

var _window: LootRollWindow


func _ready() -> void:
	WindowManager.connect_once(NetworkService.loot_roll_state_received, _on_loot_roll_state)
	WindowManager.connect_once(NetworkService.system_notice_received, _on_system_notice)
	WindowManager.connect_once(AppState.logged_out, reset)


func reset() -> void:
	last_request_id = ""
	last_notice = ""
	rolls.clear()
	if _window != null and is_instance_valid(_window):
		_window.close_window()
		remove_child(_window)
		_window.free()
	_window = null
	rolls_changed.emit()


func reset_for_tests() -> void:
	reset()


func open_count() -> int:
	var count := 0
	for key in rolls.keys():
		if String((rolls[key] as Dictionary).get("state", "")) == "OPEN":
			count += 1
	return count


func request_choice(roll_id: String, choice: String) -> String:
	if roll_id.is_empty() or choice.is_empty():
		return ""
	last_request_id = MatchProtocol.new_request_id()
	NetworkService.send_submit_loot_roll(roll_id, choice, last_request_id)
	return last_request_id


func _on_loot_roll_state(payload: Dictionary) -> void:
	var roll: Dictionary = payload.get("roll", {})
	if typeof(roll) != TYPE_DICTIONARY:
		return
	var roll_id := String(roll.get("rollId", ""))
	if roll_id.is_empty():
		return
	rolls[roll_id] = roll.duplicate(true)
	_ensure_window()
	_window.present_roll(roll)
	var state := String(roll.get("state", "OPEN"))
	if state != "OPEN":
		_emit_result(roll)
	rolls_changed.emit()


func _on_system_notice(code: String, message: String) -> void:
	if not (code.begins_with("loot_roll") or code == "inventory_full"):
		return
	last_notice = message
	NotificationService.push(message)
	feed_line.emit(message)


func _on_choice_requested(roll_id: String, choice: String) -> void:
	request_choice(roll_id, choice)


func _ensure_window() -> void:
	if _window != null and is_instance_valid(_window):
		return
	_window = LootRollWindow.new()
	_window.name = "LootRollWindow"
	add_child(_window)
	if not _window.choice_requested.is_connected(_on_choice_requested):
		_window.choice_requested.connect(_on_choice_requested)


func _emit_result(roll: Dictionary) -> void:
	var state := String(roll.get("state", ""))
	var item_id := String(roll.get("itemId", ""))
	var named := ItemPresentation.display_name({"itemId": item_id})
	var message := ""
	if state == "ALL_PASSED":
		message = "%s passed. It is now public." % named
	else:
		message = "%s won %s with %s (%s)." % [
			String(roll.get("winnerCharacterId", "")),
			named,
			String(roll.get("winningChoice", "")),
			str(int(roll.get("winningRoll", 0))),
		]
	if last_notice != message:
		last_notice = message
		NotificationService.push(message)
		feed_line.emit(message)
