class_name VisualCatalog
extends RefCounted

## Maps stable visual IDs to local textures and fallback colors. Gameplay never stores res:// Kenney paths.

const DEFAULT_MAP_PATH: String = "res://content/visual_map.json"
const MISSING_COLOR := Color(0.92, 0.22, 0.78, 1.0)

var loaded_path: String = ""
var _entries: Dictionary = {}


func load_map(path: String = DEFAULT_MAP_PATH) -> bool:
	_entries.clear()
	loaded_path = path
	if not FileAccess.file_exists(path):
		return false
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		return false
	var parsed: Variant = JSON.parse_string(file.get_as_text())
	if typeof(parsed) != TYPE_DICTIONARY:
		return false
	_entries = (parsed as Dictionary).duplicate(true)
	return true


func resolve(visual_id: String) -> Dictionary:
	var entry: Dictionary = {}
	if _entries.has(visual_id) and typeof(_entries[visual_id]) == TYPE_DICTIONARY:
		entry = _entries[visual_id]
	var texture_path := String(entry.get("texture", ""))
	var texture_ok := not texture_path.is_empty() and FileAccess.file_exists(texture_path)
	var obstacle_path := String(entry.get("obstacle_texture", ""))
	var obstacle_ok := not obstacle_path.is_empty() and FileAccess.file_exists(obstacle_path)
	var color := _parse_color(String(entry.get("fallback_color", "")), MISSING_COLOR)
	var obstacle_color := _parse_color(String(entry.get("obstacle_fallback_color", "")), Color(0.35, 0.27, 0.22, 1.0))
	var missing := visual_id.is_empty() or (not _entries.has(visual_id)) or (not texture_path.is_empty() and not texture_ok)
	if visual_id.is_empty():
		missing = true
	return {
		"visual_id": visual_id,
		"texture_path": texture_path if texture_ok else "",
		"fallback_color": color,
		"obstacle_texture_path": obstacle_path if obstacle_ok else "",
		"obstacle_fallback_color": obstacle_color,
		"missing": missing,
	}


func _parse_color(hex: String, fallback: Color) -> Color:
	if hex.is_empty():
		return fallback
	return Color.from_string(hex, fallback)
