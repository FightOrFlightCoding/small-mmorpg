extends Node

## Local presentation scale and per-character HUD restore. Never canonical game data.

signal ui_state_changed

var last_character_id: String = ""
var last_zone_id: String = ""
var ui_scale: float = 1.0
var text_size: int = 16
var saved_windows: PackedStringArray = PackedStringArray()


func _ready() -> void:
	WindowManager.connect_once(AppState.character_loaded, _on_character_loaded)
	WindowManager.connect_once(AppState.logged_out, _on_logged_out)
	WindowManager.connect_once(AppState.zone_state_updated, _on_zone_state_updated)


func reset_for_tests() -> void:
	last_character_id = ""
	last_zone_id = ""
	ui_scale = 1.0
	text_size = 16
	saved_windows = PackedStringArray()
	_apply_scale(1.0)


func handle_character_switch(character_id: String) -> void:
	if character_id.is_empty() or character_id == last_character_id:
		last_character_id = character_id
		return
	last_character_id = character_id
	DragDropService.cancel()
	TooltipService.hide_tooltip()
	WindowManager.close(WindowManager.VENDOR)
	WindowManager.close(WindowManager.INN)
	WindowManager.close(WindowManager.DIALOGUE)
	WindowManager.close(WindowManager.TRADE)
	WindowManager.close(WindowManager.SETTINGS)
	HudController.sync_windows()
	ui_state_changed.emit()


func handle_zone_transfer(zone_id: String) -> void:
	if zone_id.is_empty():
		return
	if zone_id == last_zone_id:
		return
	last_zone_id = zone_id
	DragDropService.cancel()
	TooltipService.hide_tooltip()
	WindowManager.close(WindowManager.VENDOR)
	WindowManager.close(WindowManager.INN)
	WindowManager.close(WindowManager.DIALOGUE)
	WindowManager.close(WindowManager.TRADE)
	HudController.sync_windows()
	ui_state_changed.emit()


func remember_windows() -> void:
	saved_windows = WindowManager.snapshot()


func restore_windows() -> void:
	if saved_windows.is_empty():
		return
	WindowManager.restore(saved_windows)
	HudController.sync_windows()
	ui_state_changed.emit()


func set_ui_scale(scale: float) -> void:
	ui_scale = clampf(scale, 0.75, 1.5)
	_apply_scale(ui_scale)
	AudioSettingsService.persist()


func set_text_size(size: int) -> void:
	text_size = clampi(size, 12, 22)
	_apply_scale(ui_scale)
	AudioSettingsService.persist()


func _apply_scale(scale: float) -> void:
	var tree := get_tree()
	if tree == null or tree.root == null:
		return
	if DisplayServer.get_name() == "headless":
		return
	tree.root.content_scale_factor = scale


func _on_character_loaded(_created: bool) -> void:
	handle_character_switch(String(AppState.character_view.get("character_id", "")))


func _on_logged_out() -> void:
	last_character_id = ""
	last_zone_id = ""
	saved_windows = PackedStringArray()
	WindowManager.reset_for_tests()
	DragDropService.cancel()
	TooltipService.hide_tooltip()
	HudController.unbind()
	ui_state_changed.emit()


func _on_zone_state_updated() -> void:
	handle_zone_transfer(String(AppState.zone_view.get("zone_id", "")))
