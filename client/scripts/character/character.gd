extends "res://scripts/ui/shell_page.gd"

const SLOT_COUNT := 5
const NAME_HINT := "Name: 3–16 letters, digits, spaces, hyphen, or apostrophe. Unique regardless of capitalization."

@onready var _status: Label = $Root/VBox/Status
@onready var _slot_label: Label = $Root/VBox/SlotLabel
@onready var _server_status: Label = $Root/VBox/Header/ServerStatus
@onready var _version: Label = $Root/VBox/Header/VersionLabel
@onready var _logout_button: Button = $Root/VBox/Header/LogoutButton
@onready var _select_panel: VBoxContainer = $Root/VBox/SelectPanel
@onready var _slot_row: HBoxContainer = $Root/VBox/SelectPanel/SlotRow
@onready var _create_button: Button = $Root/VBox/SelectPanel/NavRow/CreateButton
@onready var _deleted_button: Button = $Root/VBox/SelectPanel/NavRow/DeletedButton
@onready var _settings_button: Button = $Root/VBox/SelectPanel/NavRow/SettingsButton
@onready var _create_panel: VBoxContainer = $Root/VBox/CreatePanel
@onready var _class_row: HBoxContainer = $Root/VBox/CreatePanel/ClassRow
@onready var _name_edit: LineEdit = $Root/VBox/CreatePanel/NameEdit
@onready var _name_avail: Label = $Root/VBox/CreatePanel/NameAvail
@onready var _submit_create: Button = $Root/VBox/CreatePanel/CreateActions/SubmitCreate
@onready var _back_create: Button = $Root/VBox/CreatePanel/CreateActions/BackCreate
@onready var _confirm_create: Button = $Root/VBox/CreatePanel/ConfirmCreate
@onready var _deleted_panel: VBoxContainer = $Root/VBox/DeletedPanel
@onready var _deleted_list: VBoxContainer = $Root/VBox/DeletedPanel/DeletedList
@onready var _back_deleted: Button = $Root/VBox/DeletedPanel/BackDeleted
@onready var _settings_panel: VBoxContainer = $Root/VBox/SettingsPanel
@onready var _logout_all_password: LineEdit = $Root/VBox/SettingsPanel/LogoutAllPassword
@onready var _logout_all_button: Button = $Root/VBox/SettingsPanel/LogoutAllButton
@onready var _change_password_button: Button = $Root/VBox/SettingsPanel/ChangePasswordButton
@onready var _change_email_button: Button = $Root/VBox/SettingsPanel/ChangeEmailButton
@onready var _back_settings: Button = $Root/VBox/SettingsPanel/BackSettings
@onready var _delete_panel: VBoxContainer = $Root/VBox/DeleteConfirmPanel
@onready var _delete_help: Label = $Root/VBox/DeleteConfirmPanel/DeleteHelp
@onready var _delete_name_edit: LineEdit = $Root/VBox/DeleteConfirmPanel/DeleteNameEdit
@onready var _confirm_delete: Button = $Root/VBox/DeleteConfirmPanel/ConfirmDelete
@onready var _cancel_delete: Button = $Root/VBox/DeleteConfirmPanel/CancelDelete

var _class_ids: PackedStringArray = PackedStringArray()
var _selected_class_id: String = ""
var _pending_delete: Dictionary = {}
var _create_ready: bool = false
var _name_timer: Timer
var _lease_timer: Timer
var _play_busy: bool = false
var _lease_list_refresh_busy: bool = false


func _ready() -> void:
	super._ready()
	_version.text = "Version %s" % AccountService.CLIENT_VERSION
	_logout_button.pressed.connect(_on_logout_pressed)
	_create_button.pressed.connect(_show_create)
	_deleted_button.pressed.connect(_show_deleted)
	_settings_button.pressed.connect(_show_settings)
	_submit_create.pressed.connect(_on_create_pressed)
	_back_create.pressed.connect(_show_select)
	_confirm_create.pressed.connect(_on_confirm_create)
	_back_deleted.pressed.connect(_show_select)
	_back_settings.pressed.connect(_show_select)
	_change_password_button.pressed.connect(func() -> void: SceneRouter.transition_to(SceneRouter.SCENE_CHANGE_PASSWORD))
	_change_email_button.pressed.connect(func() -> void: SceneRouter.transition_to(SceneRouter.SCENE_CHANGE_EMAIL))
	_logout_all_button.pressed.connect(_on_logout_all_pressed)
	_logout_all_password.secret = true
	_confirm_delete.pressed.connect(_on_confirm_delete)
	_cancel_delete.pressed.connect(_show_select)
	_name_edit.max_length = 16
	_name_edit.text_changed.connect(_on_name_changed)
	_name_timer = Timer.new()
	_name_timer.one_shot = true
	_name_timer.wait_time = 0.4
	_name_timer.timeout.connect(_check_name_availability)
	add_child(_name_timer)
	_lease_timer = Timer.new()
	_lease_timer.wait_time = 1.0
	_lease_timer.timeout.connect(_on_lease_tick)
	add_child(_lease_timer)
	_lease_timer.start()
	WindowManager.open(WindowManager.CHARACTER_LIST)
	_fill_classes()
	if not AppState.character_loaded.is_connected(_on_character_loaded):
		AppState.character_loaded.connect(_on_character_loaded)
	if not NetworkService.character_list_finished.is_connected(_on_list_finished):
		NetworkService.character_list_finished.connect(_on_list_finished)
	_refresh_server_status()
	if AppState.is_authenticated:
		_status.text = "Loading characters..."
		GameService.request_character_list()
	else:
		_status.text = "Sign-in is required."
	_show_select()


func _exit_tree() -> void:
	if AppState.character_loaded.is_connected(_on_character_loaded):
		AppState.character_loaded.disconnect(_on_character_loaded)
	if NetworkService.character_list_finished.is_connected(_on_list_finished):
		NetworkService.character_list_finished.disconnect(_on_list_finished)
	super._exit_tree()


func _fill_classes() -> void:
	_class_ids = PackedStringArray()
	var ids := ContentRegistry.ids_of_kind("class")
	var rows: Array = []
	for id in ids:
		if not String(id).begins_with("class."):
			continue
		var record: Dictionary = ContentRegistry.get_by_id(id)
		rows.append({"id": String(id), "order": int(record.get("selectOrder", 99)), "name": String(record.get("displayName", id))})
	rows.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		if int(a.get("order", 99)) == int(b.get("order", 99)):
			return String(a.get("id", "")) < String(b.get("id", ""))
		return int(a.get("order", 99)) < int(b.get("order", 99))
	)
	for row in rows:
		_class_ids.append(String((row as Dictionary).get("id", "")))
	_rebuild_class_cards()


func _rebuild_class_cards() -> void:
	for child in _class_row.get_children():
		child.queue_free()
	for id in _class_ids:
		var record: Dictionary = ContentRegistry.get_by_id(id)
		var card := _make_class_card(id, record)
		_class_row.add_child(card)
	if _selected_class_id.is_empty() and _class_ids.size() > 0:
		_selected_class_id = _class_ids[0]
	_refresh_class_selection()


func _make_class_card(class_id: String, record: Dictionary) -> Button:
	var card := Button.new()
	card.toggle_mode = true
	card.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	card.custom_minimum_size = Vector2(180, 220)
	var visual_id := String(record.get("placeholderIconAssetId", record.get("visualAssetSetId", "")))
	var visual: Dictionary = ContentRegistry.resolve_visual(visual_id)
	var color: Color = Color(0.3, 0.3, 0.35, 1)
	if visual.get("fallback_color") is Color:
		color = visual["fallback_color"]
	var box := VBoxContainer.new()
	box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var swatch := ColorRect.new()
	swatch.custom_minimum_size = Vector2(0, 48)
	swatch.color = color
	swatch.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var title := Label.new()
	title.text = String(record.get("displayName", class_id))
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var role := Label.new()
	role.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	role.text = _class_role_text(record)
	role.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var summary := Label.new()
	summary.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	summary.text = _class_start_summary(record)
	summary.mouse_filter = Control.MOUSE_FILTER_IGNORE
	box.add_child(swatch)
	box.add_child(title)
	box.add_child(role)
	box.add_child(summary)
	card.add_child(box)
	card.pressed.connect(func() -> void:
		_selected_class_id = class_id
		_refresh_class_selection()
	)
	card.set_meta("class_id", class_id)
	return card


func _class_role_text(record: Dictionary) -> String:
	var short := String(record.get("shortDescription", ""))
	if not short.is_empty():
		return short
	return String(record.get("roleSummaryKey", record.get("displayName", "")))


func _class_start_summary(record: Dictionary) -> String:
	var abilities: Variant = record.get("startingAbilities", [])
	var equipment: Variant = record.get("startingEquipment", [])
	var ability_count := 0
	if typeof(abilities) == TYPE_ARRAY:
		ability_count = (abilities as Array).size()
	var gear := "starter kit"
	if typeof(equipment) == TYPE_ARRAY and (equipment as Array).size() > 0:
		var first: Variant = (equipment as Array)[0]
		if typeof(first) == TYPE_DICTIONARY:
			gear = String((first as Dictionary).get("itemId", gear))
	return "Provisional loadout: %s, %s abilities." % [gear, str(ability_count)]


func _refresh_class_selection() -> void:
	for child in _class_row.get_children():
		if child is Button:
			var button := child as Button
			button.button_pressed = String(button.get_meta("class_id", "")) == _selected_class_id


func _on_list_finished(success: bool, _message: String) -> void:
	_lease_list_refresh_busy = false
	if not success:
		_status.text = "Could not load characters."
		return
	_refresh_list()
	if GameService.enter_world_after_bootstrap:
		await _debug_enter_first_character()


func _refresh_list() -> void:
	_slot_label.text = "Live slots %s / %s" % [str(AppState.live_count), str(AppState.slot_limit)]
	_create_button.disabled = AppState.live_count >= AppState.slot_limit
	_refresh_server_status()
	_rebuild_slots()
	_rebuild_deleted()
	if AppState.live_count == 0:
		_status.text = "Create a character to continue. Maximum %s live slots." % str(AppState.slot_limit)
		var proposed := DevIdentity.proposed_character_name(GameService.last_identity)
		if _name_edit.text.is_empty() and not proposed.is_empty():
			_name_edit.text = proposed
	else:
		_status.text = "Select a character to play, or create another if a slot is free."


func _rebuild_slots() -> void:
	for child in _slot_row.get_children():
		child.queue_free()
	var live: Array = []
	for entry in AppState.character_list:
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		var row: Dictionary = entry
		if _is_deleted(row):
			continue
		live.append(row)
	for i in SLOT_COUNT:
		var card := PanelContainer.new()
		card.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		card.custom_minimum_size = Vector2(140, 220)
		var box := VBoxContainer.new()
		box.add_theme_constant_override("separation", 4)
		if i < live.size():
			_fill_active_card(box, live[i] as Dictionary)
		else:
			var empty := Label.new()
			empty.text = "Empty slot"
			empty.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
			box.add_child(empty)
		card.add_child(box)
		_slot_row.add_child(card)


func _fill_active_card(box: VBoxContainer, row: Dictionary) -> void:
	var class_id := String(row.get("classId", ""))
	var class_record: Dictionary = ContentRegistry.get_by_id(class_id)
	var visual_id := String(class_record.get("placeholderIconAssetId", class_record.get("visualAssetSetId", "")))
	var visual: Dictionary = ContentRegistry.resolve_visual(visual_id)
	var swatch := ColorRect.new()
	swatch.custom_minimum_size = Vector2(0, 36)
	swatch.color = Color(0.25, 0.28, 0.32, 1)
	if visual.get("fallback_color") is Color:
		swatch.color = visual["fallback_color"]
	box.add_child(swatch)
	var name_label := Label.new()
	name_label.text = String(row.get("displayName", row.get("name", "?")))
	name_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	box.add_child(name_label)
	var class_label := Label.new()
	class_label.text = String(class_record.get("displayName", class_id))
	class_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	box.add_child(class_label)
	var level := Label.new()
	level.text = "Level %s" % str(int(row.get("level", 1)))
	level.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	box.add_child(level)
	var loc := Label.new()
	loc.text = _location_label(String(row.get("lastLocationNameKey", "")))
	loc.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	loc.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	box.add_child(loc)
	var played := Label.new()
	played.text = _played_label(int(row.get("lastPlayedAt", 0)))
	played.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	box.add_child(played)
	var presence := Label.new()
	presence.text = _presence_label(String(row.get("activePresenceState", "OFFLINE")))
	presence.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	box.add_child(presence)
	var play := Button.new()
	play.text = "Play"
	var reason := _play_reason(row)
	play.disabled = not reason.is_empty() or _play_busy
	if not reason.is_empty():
		play.tooltip_text = reason.replace("\n", " — ")
		var wait := Label.new()
		wait.text = reason
		wait.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		wait.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		box.add_child(wait)
	play.pressed.connect(func() -> void:
		_play_character(String(row.get("characterId", "")))
	)
	box.add_child(play)
	var delete_btn := Button.new()
	delete_btn.text = "Delete"
	delete_btn.pressed.connect(func() -> void:
		_open_delete(row)
	)
	box.add_child(delete_btn)


func _rebuild_deleted() -> void:
	for child in _deleted_list.get_children():
		child.queue_free()
	for entry in AppState.character_list:
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		var row: Dictionary = entry
		if not _is_deleted(row):
			continue
		var card := VBoxContainer.new()
		var title := Label.new()
		var class_id := String(row.get("classId", ""))
		var class_record: Dictionary = ContentRegistry.get_by_id(class_id)
		title.text = "%s — %s — Level %s" % [
			String(row.get("displayName", row.get("name", "?"))),
			String(class_record.get("displayName", class_id)),
			str(int(row.get("level", 1))),
		]
		var remain := Label.new()
		remain.text = _retention_label(int(row.get("softDeleteExpiresAt", 0)))
		var restore := Button.new()
		restore.text = "Restore"
		restore.disabled = AppState.live_count >= AppState.slot_limit
		if restore.disabled:
			restore.tooltip_text = "Restoration requires a free slot."
		var character_id := String(row.get("characterId", ""))
		restore.pressed.connect(func() -> void:
			GameService.request_character_restore(character_id)
		)
		card.add_child(title)
		card.add_child(remain)
		card.add_child(restore)
		_deleted_list.add_child(card)


func _is_deleted(row: Dictionary) -> bool:
	if String(row.get("status", "")) == "SOFT_DELETED":
		return true
	return int(row.get("deletedAt", 0)) > 0


func _play_reason(row: Dictionary) -> String:
	if _is_deleted(row):
		return "Character is deleted."
	if AppState.content_incompatible:
		return "Content is incompatible."
	if AppState.server_maintenance or bool(row.get("playBlockedReason", "") == "maintenance"):
		return "Server maintenance is active."
	var server_reason := String(row.get("playBlockedReason", ""))
	var remain := _remaining_seconds(int(row.get("playAvailableAt", 0)))
	if server_reason == "account_busy":
		if remain > 0:
			return "Waiting for previous character to leave\nAvailable in %s seconds" % str(remain)
		return "Waiting for previous character to leave"
	if server_reason == "link_dead":
		if remain > 0:
			return "Character still in world\nAvailable in %s seconds" % str(remain)
		return "Character still in world"
	if server_reason == "selection_pending":
		return "Selection is already pending."
	if server_reason == "deleted":
		return "Character is deleted."
	if not AppState.selection_ticket.is_empty():
		var selected_id := String(AppState.character_view.get("character_id", ""))
		if not selected_id.is_empty() and selected_id != String(row.get("characterId", "")):
			return "Selection is already pending."
	return ""


func _location_label(key: String) -> String:
	if key.is_empty():
		return "Last location unknown"
	if key.begins_with("location."):
		return "Last location: %s" % key.substr("location.".length())
	return "Last location: %s" % key


func _played_label(at_ms: int) -> String:
	if at_ms <= 0:
		return "Last played: never"
	return "Last played: %s" % Time.get_datetime_string_from_unix_time(int(at_ms / 1000.0), true)


func _presence_label(state: String) -> String:
	if state == "ONLINE":
		return "Online"
	if state == "LINK_DEAD" or state == "DISCONNECTING":
		return "Character still in world"
	if state == "ENTERING":
		return "Entering world"
	if state == "LEAVING":
		return "Returning to Character Select"
	if state == "DESPAWNING":
		return "Waiting for previous character to leave"
	return "Offline"


func _remaining_seconds(play_available_at: int) -> int:
	if play_available_at <= 0:
		return 0
	var remain := play_available_at - AppState.server_now_ms()
	if remain <= 0:
		return 0
	return int(ceil(remain / 1000.0))


func _on_lease_tick() -> void:
	var blocked := false
	var expired := false
	for entry in AppState.character_list:
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		var row: Dictionary = entry
		var reason := String(row.get("playBlockedReason", ""))
		var available_at := int(row.get("playAvailableAt", 0))
		if reason == "link_dead" or reason == "account_busy":
			blocked = true
			if available_at > 0 and AppState.server_now_ms() >= available_at:
				expired = true
	if blocked:
		_refresh_list()
	if expired and AppState.is_authenticated and not _lease_list_refresh_busy:
		_lease_list_refresh_busy = true
		GameService.request_character_list()


func _retention_label(expires_at: int) -> String:
	if expires_at <= 0:
		return "Time remaining before purge: unknown"
	var remaining := expires_at - int(Time.get_unix_time_from_system() * 1000.0)
	if remaining <= 0:
		return "Purge window elapsed."
	var hours := int(remaining / 3600000.0)
	return "Time remaining before purge: %s hours" % str(hours)


func _refresh_server_status() -> void:
	if AppState.server_maintenance:
		_server_status.text = "Server: maintenance"
	elif AppState.content_incompatible:
		_server_status.text = "Server: incompatible"
	else:
		_server_status.text = "Server: ready"


func _show_select() -> void:
	_select_panel.visible = true
	_create_panel.visible = false
	_deleted_panel.visible = false
	_settings_panel.visible = false
	_delete_panel.visible = false
	WindowManager.open(WindowManager.CHARACTER_LIST)
	_create_ready = false
	_confirm_create.visible = false


func _show_create() -> void:
	_select_panel.visible = false
	_create_panel.visible = true
	_deleted_panel.visible = false
	_settings_panel.visible = false
	_delete_panel.visible = false
	WindowManager.open(WindowManager.CHARACTER_CREATE)
	WindowManager.open(WindowManager.CLASS_SELECT)
	_create_ready = false
	_confirm_create.visible = false
	_name_avail.text = "Availability is advisory. Creation reserves the name."


func _show_deleted() -> void:
	_select_panel.visible = false
	_create_panel.visible = false
	_deleted_panel.visible = true
	_settings_panel.visible = false
	_delete_panel.visible = false
	WindowManager.open(WindowManager.RECENTLY_DELETED)


func _show_settings() -> void:
	_select_panel.visible = false
	_create_panel.visible = false
	_deleted_panel.visible = false
	_settings_panel.visible = true
	_delete_panel.visible = false
	WindowManager.open(WindowManager.ACCOUNT_SETTINGS)


func _open_delete(row: Dictionary) -> void:
	_pending_delete = row.duplicate(true)
	_delete_help.text = "Type %s exactly to move this character to Recently Deleted." % String(row.get("displayName", row.get("name", "")))
	_delete_name_edit.text = ""
	_select_panel.visible = false
	_create_panel.visible = false
	_deleted_panel.visible = false
	_settings_panel.visible = false
	_delete_panel.visible = true


func _on_confirm_delete() -> void:
	var character_id := String(_pending_delete.get("characterId", ""))
	if character_id.is_empty():
		return
	GameService.request_character_soft_delete(character_id, _delete_name_edit.text)
	_show_select()


func _on_name_changed(_value: String) -> void:
	_name_timer.start()


func _check_name_availability() -> void:
	var typed := _name_edit.text.strip_edges()
	if typed.length() < 3:
		_name_avail.text = NAME_HINT
		return
	var result: Dictionary = await NetworkService.check_character_name(typed)
	if not bool(result.get("ok", false)):
		_name_avail.text = "Could not check availability. Creation still reserves the name."
		return
	if bool(result.get("available", false)):
		_name_avail.text = "Looks available. Creation is the authoritative reservation."
	else:
		_name_avail.text = "That name may already be taken. Creation is the authoritative reservation."


func _on_create_pressed() -> void:
	if _selected_class_id.is_empty():
		AppState.report_recoverable("invalid_class", "Select a class.")
		return
	if _name_edit.text.strip_edges().length() < 3:
		AppState.report_recoverable("invalid_name", "Enter a character name.")
		return
	_create_ready = true
	_confirm_create.visible = true
	_confirm_create.text = "Confirm create %s as %s" % [_name_edit.text.strip_edges(), _selected_class_id]


func _on_confirm_create() -> void:
	if not _create_ready:
		return
	GameService.request_character_create(_name_edit.text, _selected_class_id)
	_show_select()


func _play_character(character_id: String) -> void:
	if character_id.is_empty() or _play_busy:
		return
	_play_busy = true
	await GameService.request_character_select(character_id)
	if AppState.selection_ticket.is_empty():
		_play_busy = false
		return
	var entered := await GameService.enter_starter_zone()
	_play_busy = false
	if not entered:
		_status.text = "Could not enter the world."


func _debug_enter_first_character() -> void:
	var live_id := ""
	for entry in AppState.character_list:
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		var row: Dictionary = entry
		if _is_deleted(row):
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
			if _is_deleted(row):
				continue
			live_id = String(row.get("characterId", ""))
			if not live_id.is_empty():
				break
	if live_id.is_empty():
		return
	GameService.enter_world_after_bootstrap = false
	await _play_character(live_id)


func _on_character_loaded(_created: bool) -> void:
	_refresh_list()


func _on_logout_pressed() -> void:
	GameService.request_logout()


func _on_logout_all_pressed() -> void:
	GameService.request_logout_all(_logout_all_password.text)
