extends Node

## Shows and hides HUD chrome. Never writes canonical game state.

var _hud: WorldHud
var _chat: ChatPanel
var _reconnect_windows: PackedStringArray = PackedStringArray()


func _ready() -> void:
	WindowManager.connect_once(WindowManager.window_opened, _on_window_opened)
	WindowManager.connect_once(WindowManager.window_closed, _on_window_closed)
	WindowManager.connect_once(AppState.reconnecting_changed, _on_reconnecting_changed)
	WindowManager.connect_once(NotificationService.notice_pushed, _on_notice)
	WindowManager.connect_once(VendorService.vendor_opened, _on_vendor_opened)
	WindowManager.connect_once(VendorService.vendor_closed, _on_vendor_closed)
	WindowManager.connect_once(InnService.inn_opened, _on_inn_opened)
	WindowManager.connect_once(InnService.inn_closed, _on_inn_closed)
	WindowManager.connect_once(CaveService.cave_opened, _on_cave_opened)
	WindowManager.connect_once(CaveService.cave_closed, _on_cave_closed)


func reset_for_tests() -> void:
	_hud = null
	_chat = null
	_reconnect_windows = PackedStringArray()


func bind_hud(hud: WorldHud) -> void:
	_hud = hud
	WindowManager.open(WindowManager.HUD)
	WindowManager.open(WindowManager.INVENTORY)
	WindowManager.open(WindowManager.EQUIPMENT)
	WindowManager.open(WindowManager.CHARACTER)
	WindowManager.open(WindowManager.ATTRIBUTES)
	WindowManager.open(WindowManager.SKILLS)
	WindowManager.open(WindowManager.QUEST_JOURNAL)
	WindowManager.open(WindowManager.PARTY)
	WindowManager.open(WindowManager.TRADE)
	WindowManager.open(WindowManager.CHAT)
	WindowManager.open(WindowManager.PARTY_CHAT)
	if hud != null and hud.has_method("ensure_settings_panel"):
		hud.ensure_settings_panel()
	sync_windows()


func bind_chat(chat: ChatPanel) -> void:
	_chat = chat
	WindowManager.open(WindowManager.CHAT)
	sync_windows()


func unbind() -> void:
	_hud = null
	_chat = null


func toggle_panel(window_id: String) -> void:
	WindowManager.toggle(window_id)
	sync_windows()


func sync_windows() -> void:
	if _hud == null or not is_instance_valid(_hud):
		return
	if _hud.has_method("set_panel_visible"):
		_hud.set_panel_visible(WindowManager.INVENTORY, WindowManager.is_open(WindowManager.INVENTORY))
		_hud.set_panel_visible(WindowManager.EQUIPMENT, WindowManager.is_open(WindowManager.INVENTORY))
		_hud.set_panel_visible(WindowManager.CHARACTER, WindowManager.is_open(WindowManager.CHARACTER))
		_hud.set_panel_visible(WindowManager.ATTRIBUTES, WindowManager.is_open(WindowManager.CHARACTER))
		_hud.set_panel_visible(WindowManager.SKILLS, WindowManager.is_open(WindowManager.CHARACTER))
		_hud.set_panel_visible(WindowManager.QUEST_JOURNAL, WindowManager.is_open(WindowManager.QUEST_JOURNAL))
		_hud.set_panel_visible(WindowManager.PARTY, WindowManager.is_open(WindowManager.PARTY))
		_hud.set_panel_visible(WindowManager.PARTY_CHAT, WindowManager.is_open(WindowManager.PARTY))
		_hud.set_panel_visible(WindowManager.TRADE, WindowManager.is_open(WindowManager.TRADE))
		_hud.set_panel_visible(WindowManager.SETTINGS, WindowManager.is_open(WindowManager.SETTINGS))
		_hud.set_panel_visible(WindowManager.VENDOR, WindowManager.is_open(WindowManager.VENDOR))
		_hud.set_panel_visible(WindowManager.INN, WindowManager.is_open(WindowManager.INN))
		_hud.set_panel_visible(WindowManager.CAVE, WindowManager.is_open(WindowManager.CAVE))
	if _chat != null and is_instance_valid(_chat):
		_chat.visible = WindowManager.is_open(WindowManager.CHAT)


func restore_after_reconnect() -> void:
	if not _reconnect_windows.is_empty():
		WindowManager.restore(_reconnect_windows)
	elif not UiStateService.saved_windows.is_empty():
		UiStateService.restore_windows()
	sync_windows()
	NotificationService.push("Reconnected.")


func restore_after_character_switch() -> void:
	UiStateService.handle_character_switch(String(AppState.character_view.get("character_id", "")))
	sync_windows()


func restore_after_zone_transfer() -> void:
	UiStateService.handle_zone_transfer(String(AppState.zone_view.get("zone_id", "")))
	sync_windows()


func _on_window_opened(_window_id: String) -> void:
	sync_windows()


func _on_window_closed(_window_id: String) -> void:
	sync_windows()


func _on_reconnecting_changed() -> void:
	if AppState.is_reconnecting:
		UiStateService.remember_windows()
		_reconnect_windows = WindowManager.snapshot()
		WindowManager.open(WindowManager.RECONNECT)
		WindowManager.open(WindowManager.LOADING)
	else:
		WindowManager.close(WindowManager.RECONNECT)
		WindowManager.close(WindowManager.LOADING)
		restore_after_reconnect()


func _on_notice(message: String) -> void:
	if _hud != null and is_instance_valid(_hud) and _hud.has_method("show_notice"):
		_hud.show_notice(message)


func _on_vendor_opened(_npc_id: String, _vendor_id: String) -> void:
	WindowManager.open(WindowManager.VENDOR)


func _on_vendor_closed() -> void:
	WindowManager.close(WindowManager.VENDOR)


func _on_inn_opened(_npc_id: String) -> void:
	WindowManager.open(WindowManager.INN)


func _on_inn_closed() -> void:
	WindowManager.close(WindowManager.INN)


func _on_cave_opened(_npc_id: String, _mode: String) -> void:
	WindowManager.open(WindowManager.CAVE)


func _on_cave_closed() -> void:
	WindowManager.close(WindowManager.CAVE)
