extends Node

## Rebindable InputMap actions. Persists locally. Never stores credentials.

signal bindings_changed

const SETTINGS_KEY := "input"

var settings_path: String = LocalSettingsStore.DEFAULT_PATH
var awaiting_rebind_action: String = ""
var last_conflict: String = ""

var _defaults: Dictionary = {}


func _ready() -> void:
	ensure_actions()
	load_from_disk()


func reset_for_tests() -> void:
	settings_path = "user://client_settings_input_test.json"
	LocalSettingsStore.clear(settings_path)
	awaiting_rebind_action = ""
	last_conflict = ""
	restore_defaults(false)


func ensure_actions() -> void:
	_ensure("hotbar_1", KEY_1)
	_ensure("hotbar_2", KEY_2)
	_ensure("hotbar_3", KEY_3)
	_ensure("hotbar_4", KEY_4)
	_ensure("hotbar_5", KEY_5)
	_ensure("hotbar_6", KEY_6)
	_ensure("hotbar_7", KEY_7)
	_ensure("hotbar_8", KEY_8)
	_ensure("inventory", KEY_I)
	_ensure("character_sheet", KEY_C)
	_ensure("quest_journal", KEY_J)
	_ensure("party_panel", KEY_P)
	_ensure("chat_focus", KEY_T)
	_ensure("open_settings", KEY_O)
	_ensure("target_select", KEY_TAB)
	_capture_defaults()


func bindable_actions() -> PackedStringArray:
	return PackedStringArray([
		"move_left",
		"move_right",
		"move_up",
		"move_down",
		"interact",
		"attack",
		"pickup",
		"target_select",
		"hotbar_1",
		"hotbar_2",
		"hotbar_3",
		"hotbar_4",
		"hotbar_5",
		"hotbar_6",
		"hotbar_7",
		"hotbar_8",
		"inventory",
		"character_sheet",
		"quest_journal",
		"party_panel",
		"chat_focus",
		"open_settings",
	])


func start_rebind(action: String) -> void:
	if not bindable_actions().has(action):
		return
	awaiting_rebind_action = action


func rebind(action: String, event: InputEvent) -> String:
	awaiting_rebind_action = ""
	if not bindable_actions().has(action) or event == null:
		return "invalid_action"
	if not (event is InputEventKey or event is InputEventMouseButton):
		return "invalid_event"
	var conflict := conflict_for(action, event)
	if not conflict.is_empty():
		last_conflict = conflict
		return "input_conflict"
	last_conflict = ""
	InputMap.action_erase_events(action)
	InputMap.action_add_event(action, event.duplicate())
	persist()
	bindings_changed.emit()
	return ""


func conflict_for(action: String, event: InputEvent) -> String:
	for other in bindable_actions():
		if other == action:
			continue
		if not InputMap.has_action(other):
			continue
		for existing in InputMap.action_get_events(other):
			if _same_event(existing, event):
				return other
	return ""


func restore_defaults(write: bool = true) -> void:
	ensure_actions()
	for action in bindable_actions():
		if not InputMap.has_action(action):
			continue
		InputMap.action_erase_events(action)
		var events: Variant = _defaults.get(action, [])
		if typeof(events) == TYPE_ARRAY:
			for event in events:
				if event is InputEvent:
					InputMap.action_add_event(action, (event as InputEvent).duplicate())
	if write:
		persist()
	bindings_changed.emit()


func persist() -> void:
	var data := LocalSettingsStore.load_settings(settings_path)
	data[SETTINGS_KEY] = _serialize()
	LocalSettingsStore.save_settings(data, settings_path)


func load_from_disk() -> void:
	var data := LocalSettingsStore.load_settings(settings_path)
	var stored: Variant = data.get(SETTINGS_KEY, {})
	if typeof(stored) != TYPE_DICTIONARY:
		return
	for action in (stored as Dictionary).keys():
		var name := String(action)
		if not bindable_actions().has(name) or not InputMap.has_action(name):
			continue
		InputMap.action_erase_events(name)
		var codes: Variant = (stored as Dictionary)[action]
		if typeof(codes) != TYPE_ARRAY:
			continue
		for code in codes:
			var event := InputEventKey.new()
			event.physical_keycode = int(code)
			InputMap.action_add_event(name, event)


func _unhandled_input(event: InputEvent) -> void:
	if awaiting_rebind_action.is_empty():
		return
	if event is InputEventKey and event.pressed and not event.echo:
		rebind(awaiting_rebind_action, event)
		get_viewport().set_input_as_handled()


func _ensure(action: String, keycode: int) -> void:
	if InputMap.has_action(action):
		return
	InputMap.add_action(action)
	var event := InputEventKey.new()
	event.physical_keycode = keycode
	InputMap.action_add_event(action, event)


func _capture_defaults() -> void:
	if not _defaults.is_empty():
		return
	for action in bindable_actions():
		if not InputMap.has_action(action):
			continue
		var copies: Array = []
		for event in InputMap.action_get_events(action):
			copies.append(event.duplicate())
		_defaults[action] = copies


func _serialize() -> Dictionary:
	var out := {}
	for action in bindable_actions():
		if not InputMap.has_action(action):
			continue
		var codes: Array = []
		for event in InputMap.action_get_events(action):
			if event is InputEventKey:
				codes.append(int((event as InputEventKey).physical_keycode))
		out[action] = codes
	return out


func _same_event(left: InputEvent, right: InputEvent) -> bool:
	if left is InputEventKey and right is InputEventKey:
		return (left as InputEventKey).physical_keycode == (right as InputEventKey).physical_keycode
	if left is InputEventMouseButton and right is InputEventMouseButton:
		return (left as InputEventMouseButton).button_index == (right as InputEventMouseButton).button_index
	return false
