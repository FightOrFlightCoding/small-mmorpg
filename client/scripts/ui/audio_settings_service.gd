extends Node

## Local audio and display presentation. Never stores credentials.

signal settings_changed

const SETTINGS_KEY := "presentation"

var settings_path: String = LocalSettingsStore.DEFAULT_PATH
var master_volume: float = 1.0
var music_volume: float = 0.8
var effects_volume: float = 0.9
var muted: bool = false
var window_mode: String = "windowed"
var resolution: Vector2i = Vector2i(1280, 720)


func _ready() -> void:
	_ensure_buses()
	load_from_disk()
	apply()


func reset_for_tests() -> void:
	settings_path = "user://client_settings_audio_test.json"
	LocalSettingsStore.clear(settings_path)
	master_volume = 1.0
	music_volume = 0.8
	effects_volume = 0.9
	muted = false
	window_mode = "windowed"
	resolution = Vector2i(1280, 720)
	UiStateService.ui_scale = 1.0
	UiStateService.text_size = 16
	apply()


func set_master_volume(value: float) -> void:
	master_volume = clampf(value, 0.0, 1.0)
	apply()
	persist()


func set_music_volume(value: float) -> void:
	music_volume = clampf(value, 0.0, 1.0)
	apply()
	persist()


func set_effects_volume(value: float) -> void:
	effects_volume = clampf(value, 0.0, 1.0)
	apply()
	persist()


func set_muted(value: bool) -> void:
	muted = value
	apply()
	persist()


func set_window_mode(mode: String) -> void:
	if mode != "windowed" and mode != "fullscreen":
		return
	window_mode = mode
	apply()
	persist()


func set_resolution(size: Vector2i) -> void:
	if size.x < 800 or size.y < 600:
		return
	resolution = size
	apply()
	persist()


func restore_defaults() -> void:
	master_volume = 1.0
	music_volume = 0.8
	effects_volume = 0.9
	muted = false
	window_mode = "windowed"
	resolution = Vector2i(1280, 720)
	UiStateService.ui_scale = 1.0
	UiStateService.text_size = 16
	apply()
	persist()


func apply() -> void:
	_ensure_buses()
	AudioServer.set_bus_mute(AudioServer.get_bus_index("Master"), muted)
	_set_bus_volume("Master", master_volume)
	_set_bus_volume("Music", music_volume)
	_set_bus_volume("Effects", effects_volume)
	if DisplayServer.get_name() == "headless":
		settings_changed.emit()
		return
	if window_mode == "fullscreen":
		DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_FULLSCREEN)
	else:
		DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED)
		DisplayServer.window_set_size(resolution)
	UiStateService._apply_scale(UiStateService.ui_scale)
	settings_changed.emit()


func persist() -> void:
	var data := LocalSettingsStore.load_settings(settings_path)
	data[SETTINGS_KEY] = {
		"master": master_volume,
		"music": music_volume,
		"effects": effects_volume,
		"mute": muted,
		"windowMode": window_mode,
		"width": resolution.x,
		"height": resolution.y,
		"uiScale": UiStateService.ui_scale,
		"textSize": UiStateService.text_size,
	}
	LocalSettingsStore.save_settings(data, settings_path)


func load_from_disk() -> void:
	var data := LocalSettingsStore.load_settings(settings_path)
	var stored: Variant = data.get(SETTINGS_KEY, {})
	if typeof(stored) != TYPE_DICTIONARY:
		return
	var row: Dictionary = stored
	master_volume = clampf(float(row.get("master", master_volume)), 0.0, 1.0)
	music_volume = clampf(float(row.get("music", music_volume)), 0.0, 1.0)
	effects_volume = clampf(float(row.get("effects", effects_volume)), 0.0, 1.0)
	muted = bool(row.get("mute", muted))
	window_mode = String(row.get("windowMode", window_mode))
	resolution = Vector2i(int(row.get("width", resolution.x)), int(row.get("height", resolution.y)))
	UiStateService.ui_scale = clampf(float(row.get("uiScale", 1.0)), 0.75, 1.5)
	UiStateService.text_size = clampi(int(row.get("textSize", 16)), 12, 22)


func _set_bus_volume(bus_name: String, linear: float) -> void:
	var index := AudioServer.get_bus_index(bus_name)
	if index < 0:
		return
	var db := -80.0 if linear <= 0.0 else linear_to_db(linear)
	AudioServer.set_bus_volume_db(index, db)


func _ensure_buses() -> void:
	_add_bus("Music")
	_add_bus("Effects")
	_add_bus("UI")


func _add_bus(bus_name: String) -> void:
	if AudioServer.get_bus_index(bus_name) >= 0:
		return
	AudioServer.add_bus()
	var index := AudioServer.bus_count - 1
	AudioServer.set_bus_name(index, bus_name)
	AudioServer.set_bus_send(index, "Master")
