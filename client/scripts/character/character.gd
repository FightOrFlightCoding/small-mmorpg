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
@onready var _settings_email: Label = $Root/VBox/SettingsPanel/EmailLabel
@onready var _settings_status: Label = $Root/VBox/SettingsPanel/StatusLabel
@onready var _settings_created: Label = $Root/VBox/SettingsPanel/CreatedLabel
@onready var _settings_mode: Label = $Root/VBox/SettingsPanel/RegistrationModeLabel
@onready var _settings_recovery: Label = $Root/VBox/SettingsPanel/SupportRecoveryLabel
@onready var _settings_userid: Label = $Root/VBox/SettingsPanel/UserIdLabel
@onready var _settings_dev: CheckButton = $Root/VBox/SettingsPanel/DevDetailsToggle
@onready var _settings_message: Label = $Root/VBox/SettingsPanel/SettingsStatus
@onready var _logout_all_password: LineEdit = $Root/VBox/SettingsPanel/LogoutAllPassword
@onready var _logout_all_button: Button = $Root/VBox/SettingsPanel/LogoutAllButton
@onready var _change_password_button: Button = $Root/VBox/SettingsPanel/ChangePasswordButton
@onready var _change_email_button: Button = $Root/VBox/SettingsPanel/ChangeEmailButton
@onready var _export_button: Button = $Root/VBox/SettingsPanel/ExportButton
@onready var _delete_account_button: Button = $Root/VBox/SettingsPanel/DeleteAccountButton
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
var _class_summary: Label
var _delete_summary: Label


func _ready() -> void:
	super._ready()
	_version.visible = OS.is_debug_build()
	_version.text = "Client %s" % AccountService.CLIENT_VERSION
	ShellTheme.style_secondary(_logout_button)
	ShellTheme.style_primary(_create_button)
	ShellTheme.style_secondary(_deleted_button)
	ShellTheme.style_secondary(_settings_button)
	ShellTheme.style_primary(_submit_create)
	ShellTheme.style_secondary(_back_create)
	ShellTheme.style_primary(_confirm_create)
	ShellTheme.style_destructive(_confirm_delete, true)
	ShellTheme.style_secondary(_cancel_delete)
	ShellTheme.style_field(_name_edit, "text")
	ShellTheme.style_field(_delete_name_edit, "text")
	ShellTheme.style_destructive(_delete_account_button)
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
	_export_button.pressed.connect(_on_export_pressed)
	_delete_account_button.pressed.connect(func() -> void: SceneRouter.transition_to(SceneRouter.SCENE_ACCOUNT_DELETE))
	_settings_dev.toggled.connect(_on_dev_details_toggled)
	_logout_all_button.pressed.connect(_on_logout_all_pressed)
	_logout_all_password.secret = true
	_confirm_delete.pressed.connect(_on_confirm_delete)
	_cancel_delete.pressed.connect(_show_select)
	_name_edit.max_length = 16
	_name_edit.text_changed.connect(_on_name_changed)
	_install_create_summary()
	_install_settings_danger()
	_install_delete_summary()
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


func _install_create_summary() -> void:
	_class_summary = Label.new()
	_class_summary.name = "ClassSummary"
	_class_summary.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_create_panel.add_child(_class_summary)
	_create_panel.move_child(_class_summary, _name_edit.get_index())


func _install_settings_danger() -> void:
	var support := Label.new()
	support.name = "SupportInfo"
	support.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	support.text = "Support can look up a recovery ID. They will never ask for your password."
	_settings_panel.add_child(support)
	_settings_panel.move_child(support, _export_button.get_index() + 1)
	var danger := Label.new()
	danger.name = "DestructiveHelp"
	danger.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	danger.add_theme_color_override("font_color", DesignTokens.ERROR)
	danger.text = "Danger zone — permanent account deletion cannot be undone. This is separate from ordinary settings."
	_settings_panel.add_child(danger)
	_settings_panel.move_child(danger, _delete_account_button.get_index())


func _install_delete_summary() -> void:
	_delete_summary = Label.new()
	_delete_summary.name = "DeleteSummary"
	_delete_summary.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_delete_panel.add_child(_delete_summary)
	_delete_panel.move_child(_delete_summary, _delete_help.get_index())


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("ui_cancel"):
		if _delete_panel.visible or _create_panel.visible or _deleted_panel.visible or _settings_panel.visible:
			_show_select()
			get_viewport().set_input_as_handled()
			return
	super._unhandled_input(event)


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
		if record.get("rosterSelectable", true) == false:
			continue
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


func _make_class_card(class_id: String, _record: Dictionary) -> Button:
	var card := UxClassCard.new()
	card.configure(class_id)
	card.class_chosen.connect(func(id: String) -> void:
		_selected_class_id = id
		_refresh_class_selection()
	)
	return card


func _class_role_text(record: Dictionary) -> String:
	return String(ClassPresentation.for_id(String(record.get("id", ""))).get("role", ""))


func _class_start_summary(record: Dictionary) -> String:
	return ClassPresentation.selected_summary(String(record.get("id", "")))


func _refresh_class_selection() -> void:
	for child in _class_row.get_children():
		if child is Button:
			var button := child as Button
			button.button_pressed = String(button.get_meta("class_id", "")) == _selected_class_id
	if _class_summary != null:
		_class_summary.text = ClassPresentation.selected_summary(_selected_class_id)


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
		if i < live.size():
			var card := UxCharacterCard.new()
			var row: Dictionary = live[i]
			var reason := _play_reason(row)
			var remain := _remaining_seconds(int(row.get("playAvailableAt", 0)))
			card.bind(row, reason, _play_busy, remain)
			card.set_location(_location_label(String(row.get("lastLocationNameKey", ""))))
			card.set_played(_played_label(int(row.get("lastPlayedAt", 0))))
			card.set_presence(_presence_label(String(row.get("activePresenceState", "OFFLINE"))))
			card.play_pressed.connect(_play_character)
			var captured: Dictionary = row
			card.delete_pressed.connect(func(_character_id: String) -> void:
				_open_delete(captured)
			)
			_slot_row.add_child(card)
		else:
			var empty := UxEmptySlot.new()
			_slot_row.add_child(empty)


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
		title.text = "%s — %s — Level %s%s" % [
			String(row.get("displayName", row.get("name", "?"))),
			String(class_record.get("displayName", class_id)),
			str(int(row.get("level", 1))),
			_branch_suffix(row),
		]
		var remain := Label.new()
		remain.text = _retention_label(int(row.get("softDeleteExpiresAt", 0)))
		var restore := Button.new()
		restore.text = "Restore"
		restore.disabled = AppState.live_count >= AppState.slot_limit
		if restore.disabled:
			restore.tooltip_text = "Restoration requires a free slot."
			var full := Label.new()
			full.text = AccountErrors.message_for("CHARACTER_SLOTS_FULL")
			full.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
			card.add_child(full)
		var character_id := String(row.get("characterId", ""))
		restore.pressed.connect(func() -> void:
			GameService.request_character_restore(character_id)
		)
		card.add_child(title)
		card.add_child(remain)
		card.add_child(restore)
		_deleted_list.add_child(card)


func _branch_suffix(row: Dictionary) -> String:
	var branch_id := String(row.get("branchId", ""))
	if branch_id.is_empty():
		return ""
	var branch_record: Dictionary = ContentRegistry.get_by_id(branch_id)
	return " — %s" % String(branch_record.get("displayName", branch_id))


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
	UxServerStatus.from_app_state(_server_status)


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
	_settings_userid.visible = _settings_dev.button_pressed
	await _load_account_settings()


func _load_account_settings() -> void:
	var result := await GameService.fetch_account_status()
	if not bool(result.get("ok", false)):
		_settings_message.text = AccountService.last_message
		return
	_settings_email.text = "Email: %s" % String(result.get("verified_email", "—"))
	_settings_status.text = "Status: %s" % String(result.get("account_status", "—"))
	var created_at := int(result.get("created_at", 0))
	if created_at > 0:
		_settings_created.text = "Created: %s" % Time.get_datetime_string_from_unix_time(int(created_at / 1000), true)
	else:
		_settings_created.text = "Created: —"
	_settings_mode.text = "Registration: %s" % String(result.get("registration_mode", "—"))
	_settings_recovery.text = "Support Recovery ID: %s" % String(result.get("support_recovery_id", "—"))
	_settings_userid.text = "User id: %s" % String(result.get("user_id", "—"))
	_settings_message.text = ""


func _on_dev_details_toggled(pressed: bool) -> void:
	_settings_userid.visible = pressed


func _on_export_pressed() -> void:
	_export_button.disabled = true
	var result := await GameService.export_account_data()
	if bool(result.get("ok", false)):
		_settings_message.text = "Saved to %s" % String(result.get("path", "user://account_export.json"))
	else:
		_settings_message.text = AccountService.last_message
	_export_button.disabled = false

func _open_delete(row: Dictionary) -> void:
	_pending_delete = row.duplicate(true)
	var class_id := String(row.get("classId", ""))
	var presentation := ClassPresentation.for_id(class_id)
	var name := String(row.get("displayName", row.get("name", "")))
	if _delete_summary != null:
		_delete_summary.text = "%s — %s — Level %s" % [name, String(presentation.get("display_name", class_id)), str(int(row.get("level", 1)))]
	_delete_help.text = "Type %s exactly to confirm. The live slot is freed immediately. The character stays in Recently Deleted for seven days and can be restored while a slot is free. After that window the character is purged." % name
	_delete_name_edit.text = ""
	_confirm_delete.text = "Delete character"
	_select_panel.visible = false
	_create_panel.visible = false
	_deleted_panel.visible = false
	_settings_panel.visible = false
	_delete_panel.visible = true
	_delete_name_edit.grab_focus()


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
	elif String(result.get("reason", "")) == "name_held_deleted":
		_name_avail.text = AccountErrors.message_for("CHARACTER_NAME_HELD_DELETED")
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
	var presentation := ClassPresentation.for_id(_selected_class_id)
	_confirm_create.text = "Confirm create %s as %s" % [_name_edit.text.strip_edges(), String(presentation.get("display_name", _selected_class_id))]


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
