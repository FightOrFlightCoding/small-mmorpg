extends "res://scripts/ui/shell_page.gd"

@onready var _status: Label = $Center/VBox/Status
@onready var _slot_label: Label = $Center/VBox/SlotLabel
@onready var _list: ItemList = $Center/VBox/CharacterList
@onready var _name_edit: LineEdit = $Center/VBox/NameEdit
@onready var _class_option: OptionButton = $Center/VBox/ClassOption
@onready var _create_button: Button = $Center/VBox/CreateButton
@onready var _select_button: Button = $Center/VBox/SelectButton
@onready var _delete_button: Button = $Center/VBox/DeleteButton
@onready var _restore_button: Button = $Center/VBox/RestoreButton
@onready var _name_label: Label = $Center/VBox/NameValue
@onready var _stats_label: Label = $Center/VBox/StatsValue
@onready var _continue_button: Button = $Center/VBox/ContinueButton
@onready var _logout_button: Button = $Center/VBox/LogoutButton
@onready var _logout_all_password: LineEdit = $Center/VBox/LogoutAllPassword
@onready var _logout_all_button: Button = $Center/VBox/LogoutAllButton
@onready var _change_password_button: Button = $Center/VBox/ChangePasswordButton
@onready var _change_email_button: Button = $Center/VBox/ChangeEmailButton

var _pending_delete_id: String = ""
var _class_ids: PackedStringArray = PackedStringArray()


func _ready() -> void:
	super._ready()
	_continue_button.pressed.connect(_on_continue_pressed)
	_logout_button.pressed.connect(_on_logout_pressed)
	_logout_all_button.pressed.connect(_on_logout_all_pressed)
	_change_password_button.pressed.connect(func() -> void: SceneRouter.transition_to(SceneRouter.SCENE_CHANGE_PASSWORD))
	_change_email_button.pressed.connect(func() -> void: SceneRouter.transition_to(SceneRouter.SCENE_CHANGE_EMAIL))
	_logout_all_password.secret = true
	_create_button.pressed.connect(_on_create_pressed)
	_select_button.pressed.connect(_on_select_pressed)
	_delete_button.pressed.connect(_on_delete_pressed)
	_restore_button.pressed.connect(_on_restore_pressed)
	WindowManager.open(WindowManager.CHARACTER_LIST)
	WindowManager.open(WindowManager.CHARACTER_CREATE)
	WindowManager.open(WindowManager.CLASS_SELECT)
	_continue_button.disabled = true
	_name_edit.max_length = 16
	_fill_classes()
	if not AppState.character_loaded.is_connected(_on_character_loaded):
		AppState.character_loaded.connect(_on_character_loaded)
	if not NetworkService.character_list_finished.is_connected(_on_list_finished):
		NetworkService.character_list_finished.connect(_on_list_finished)
	_list.item_selected.connect(func(_index: int) -> void:
		_update_action_buttons()
	)
	if AppState.has_character:
		_show_character(AppState.character_view, AppState.character_created)
	if AppState.is_authenticated:
		_status.text = "Loading characters..."
		GameService.request_character_list()
	else:
		_status.text = "Sign-in is required."


func _exit_tree() -> void:
	if AppState.character_loaded.is_connected(_on_character_loaded):
		AppState.character_loaded.disconnect(_on_character_loaded)
	if NetworkService.character_list_finished.is_connected(_on_list_finished):
		NetworkService.character_list_finished.disconnect(_on_list_finished)
	super._exit_tree()


func _fill_classes() -> void:
	_class_option.clear()
	_class_ids = ContentRegistry.ids_of_kind("class")
	for id in _class_ids:
		var record: Dictionary = ContentRegistry.get_by_id(id)
		var label := String(record.get("displayName", id))
		_class_option.add_item(label)


func _on_list_finished(success: bool, _message: String) -> void:
	if not success:
		_status.text = "Could not load characters."
		return
	_refresh_list()
	if GameService.enter_world_after_bootstrap:
		await _debug_enter_first_character()


func _refresh_list() -> void:
	_list.clear()
	_slot_label.text = "Live slots %s / %s" % [str(AppState.live_count), str(AppState.slot_limit)]
	_create_button.disabled = AppState.live_count >= AppState.slot_limit
	for entry in AppState.character_list:
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		var row: Dictionary = entry
		var deleted := int(row.get("deletedAt", 0)) > 0
		var label := String(row.get("name", "?"))
		if deleted:
			label += " (deleted)"
		else:
			label += " — %s" % String(row.get("classId", ""))
		_list.add_item(label)
	if AppState.character_list.is_empty():
		_status.text = "Create a character to continue. Maximum %s live slots." % str(AppState.slot_limit)
		var proposed := DevIdentity.proposed_character_name(GameService.last_identity)
		if _name_edit.text.is_empty() and not proposed.is_empty():
			_name_edit.text = proposed
	else:
		_status.text = "Select a character, or create another if a slot is free."
	_update_action_buttons()


func _update_action_buttons() -> void:
	var character_id := _selected_character_id()
	var deleted := _selected_deleted()
	_select_button.disabled = character_id.is_empty() or deleted
	_delete_button.disabled = character_id.is_empty() or deleted
	_restore_button.disabled = character_id.is_empty() or not deleted


func _debug_enter_first_character() -> void:
	var live_id := ""
	for entry in AppState.character_list:
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		var row: Dictionary = entry
		if int(row.get("deletedAt", 0)) > 0:
			continue
		live_id = String(row.get("characterId", ""))
		if not live_id.is_empty():
			break
	if live_id.is_empty():
		if _class_ids.is_empty():
			return
		var proposed := DevIdentity.proposed_character_name(GameService.last_identity)
		if proposed.is_empty():
			proposed = "Adventurer"
		await GameService.request_character_create(proposed, _class_ids[0])
		_refresh_list()
		for entry in AppState.character_list:
			if typeof(entry) != TYPE_DICTIONARY:
				continue
			var row: Dictionary = entry
			if int(row.get("deletedAt", 0)) > 0:
				continue
			live_id = String(row.get("characterId", ""))
			if not live_id.is_empty():
				break
	if live_id.is_empty():
		return
	GameService.enter_world_after_bootstrap = false
	await GameService.request_character_select(live_id)
	_on_continue_pressed()


func _on_character_loaded(created: bool) -> void:
	_show_character(AppState.character_view, created)
	_refresh_list()


func _show_character(view: Dictionary, created: bool) -> void:
	if created:
		_status.text = "Character created. Confirm selection to enter the zone."
	elif not AppState.selection_ticket.is_empty():
		_status.text = "Selected %s. Continue into the starter zone." % String(view.get("name", ""))
	else:
		_status.text = "Existing character loaded."
	_name_label.text = String(view.get("name", ""))
	var stats: Dictionary = view.get("base_stats", {})
	_stats_label.text = "Health %s  Attack %s  Speed %s" % [
		str(stats.get("maxHealth", "")),
		str(stats.get("attack", "")),
		str(stats.get("moveSpeed", "")),
	]
	_continue_button.disabled = AppState.selection_ticket.is_empty() and String(view.get("character_id", "")).is_empty()
	if GameService.enter_world_after_bootstrap and not String(view.get("character_id", "")).is_empty():
		GameService.enter_world_after_bootstrap = false
		await GameService.request_character_select(String(view.get("character_id", "")))
		_on_continue_pressed()


func _selected_character_id() -> String:
	var index := _list.get_selected_items()
	if index.is_empty():
		return String(AppState.character_view.get("character_id", ""))
	var row_index: int = index[0]
	if row_index < 0 or row_index >= AppState.character_list.size():
		return ""
	var row: Variant = AppState.character_list[row_index]
	if typeof(row) != TYPE_DICTIONARY:
		return ""
	return String((row as Dictionary).get("characterId", ""))


func _selected_deleted() -> bool:
	var index := _list.get_selected_items()
	if index.is_empty():
		return false
	var row: Variant = AppState.character_list[index[0]]
	if typeof(row) != TYPE_DICTIONARY:
		return false
	return int((row as Dictionary).get("deletedAt", 0)) > 0


func _on_create_pressed() -> void:
	if _class_option.selected < 0 or _class_option.selected >= _class_ids.size():
		AppState.report_recoverable("invalid_class", "Select a class.")
		return
	GameService.request_character_create(_name_edit.text, _class_ids[_class_option.selected])


func _on_select_pressed() -> void:
	var character_id := _selected_character_id()
	if character_id.is_empty():
		AppState.report_recoverable("character_missing", "Select a character first.")
		return
	if _selected_deleted():
		AppState.report_recoverable("character_deleted", "Restore this character before selecting it.")
		return
	GameService.request_character_select(character_id)


func _on_delete_pressed() -> void:
	var character_id := _selected_character_id()
	if character_id.is_empty():
		return
	if _pending_delete_id == character_id:
		_pending_delete_id = ""
		GameService.request_character_soft_delete(character_id)
		return
	_pending_delete_id = character_id
	_status.text = "Press Delete again to confirm soft-delete of this character."


func _on_restore_pressed() -> void:
	var character_id := _selected_character_id()
	if character_id.is_empty():
		return
	GameService.request_character_restore(character_id)


func _on_continue_pressed() -> void:
	_continue_button.disabled = true
	if AppState.selection_ticket.is_empty():
		var character_id := _selected_character_id()
		if character_id.is_empty():
			_continue_button.disabled = false
			return
		await GameService.request_character_select(character_id)
		if AppState.selection_ticket.is_empty():
			_continue_button.disabled = false
			return
	var entered := await GameService.enter_starter_zone()
	if not entered:
		_continue_button.disabled = false


func _on_logout_pressed() -> void:
	GameService.request_logout()


func _on_logout_all_pressed() -> void:
	GameService.request_logout_all(_logout_all_password.text)
