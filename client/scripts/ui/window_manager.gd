extends Node

## Tracks shell and HUD windows. Windows never mutate canonical game state.

signal window_opened(window_id: String)
signal window_closed(window_id: String)
signal focus_changed(window_id: String)

const LOGIN := "login"
const REGISTER := "register"
const CHARACTER_LIST := "character_list"
const CHARACTER_CREATE := "character_create"
const CLASS_SELECT := "class_select"
const LOADING := "loading"
const RECONNECT := "reconnect"
const HUD := "hud"
const SETTINGS := "settings"
const INVENTORY := "inventory"
const EQUIPMENT := "equipment"
const CHARACTER := "character"
const ATTRIBUTES := "attributes"
const SKILLS := "skills"
const QUEST_JOURNAL := "quest_journal"
const PARTY := "party"
const TRADE := "trade"
const CHAT := "chat"
const PARTY_CHAT := "party_chat"
const DIALOGUE := "dialogue"
const VENDOR := "vendor"
const INN := "inn"
const CAVE := "cave"
const DEATH := "death"
const ERROR := "error"
const COMPATIBILITY := "compatibility"

const EXCLUSIVE := ["settings", "vendor", "inn", "error", "compatibility"]

const CLOSEABLE := [
	"settings",
	"inventory",
	"equipment",
	"character",
	"attributes",
	"skills",
	"quest_journal",
	"party",
	"trade",
	"chat",
	"party_chat",
	"dialogue",
	"vendor",
	"inn",
	"cave",
]

var focused_id: String = ""
var _open: Dictionary = {}
var _stack: PackedStringArray = PackedStringArray()


func reset_for_tests() -> void:
	_open.clear()
	_stack = PackedStringArray()
	focused_id = ""


func is_open(window_id: String) -> bool:
	return bool(_open.get(window_id, false))


func open(window_id: String) -> void:
	if window_id.is_empty():
		return
	if EXCLUSIVE.has(window_id):
		_close_exclusive_except(window_id)
	if not is_open(window_id):
		_open[window_id] = true
		_stack.append(window_id)
		window_opened.emit(window_id)
	_raise(window_id)


func close(window_id: String) -> void:
	if not is_open(window_id):
		return
	_open[window_id] = false
	var next := PackedStringArray()
	for id in _stack:
		if id != window_id:
			next.append(id)
	_stack = next
	window_closed.emit(window_id)
	if focused_id == window_id:
		focused_id = _stack[_stack.size() - 1] if _stack.size() > 0 else ""
		focus_changed.emit(focused_id)


func toggle(window_id: String) -> void:
	if is_open(window_id):
		close(window_id)
	else:
		open(window_id)


func close_top() -> bool:
	var i := _stack.size() - 1
	while i >= 0:
		var window_id := _stack[i]
		if CLOSEABLE.has(window_id):
			close(window_id)
			return true
		i -= 1
	return false


func snapshot() -> PackedStringArray:
	var ids := PackedStringArray()
	for window_id in _stack:
		if is_open(window_id):
			ids.append(window_id)
	return ids


func restore(window_ids: PackedStringArray) -> void:
	var keep := PackedStringArray()
	for window_id in window_ids:
		if CLOSEABLE.has(window_id) or window_id == HUD or window_id == DEATH:
			keep.append(window_id)
	reset_for_tests()
	for window_id in keep:
		open(window_id)


func has_text_focus() -> bool:
	var tree := get_tree()
	if tree == null:
		return false
	var owner := tree.root.gui_get_focus_owner()
	return owner is LineEdit or owner is TextEdit


func connect_once(sig: Signal, callable: Callable) -> void:
	if not sig.is_connected(callable):
		sig.connect(callable)


func _raise(window_id: String) -> void:
	focused_id = window_id
	focus_changed.emit(window_id)


func _close_exclusive_except(keep_id: String) -> void:
	for window_id in EXCLUSIVE:
		if window_id != keep_id and is_open(window_id):
			close(window_id)
