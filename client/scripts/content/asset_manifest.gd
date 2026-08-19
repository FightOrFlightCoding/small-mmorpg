class_name AssetManifest
extends RefCounted

## Client-only visual/audio set catalog. Not hashed into gameplay contentHash.

const DEFAULT_PATH := "res://content/asset_manifest.json"

var loaded: bool = false
var last_warning: String = ""
var missing_ids: PackedStringArray = PackedStringArray()
var _sets: Dictionary = {}
var _icons: Dictionary = {}
var _audio: Dictionary = {}
var _projectiles: Dictionary = {}
var _impacts: Dictionary = {}
var _tilesets: Dictionary = {}


func load_manifest(path: String = DEFAULT_PATH) -> bool:
	_sets.clear()
	_icons.clear()
	_audio.clear()
	_projectiles.clear()
	_impacts.clear()
	_tilesets.clear()
	missing_ids = PackedStringArray()
	last_warning = ""
	loaded = false
	if not FileAccess.file_exists(path):
		_warn("asset.manifest", "Asset manifest was not found.")
		return false
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	if typeof(parsed) != TYPE_DICTIONARY:
		_warn("asset.manifest", "Asset manifest was malformed.")
		return false
	var root: Dictionary = parsed
	_ingest_sets(root.get("sets", {}))
	_icons = _as_dict(root.get("icons", {}))
	_audio = _as_dict(root.get("audio", {}))
	_projectiles = _as_dict(root.get("projectiles", {}))
	_impacts = _as_dict(root.get("impacts", {}))
	_tilesets = _as_dict(root.get("tilesets", {}))
	loaded = true
	return true


func resolve_set(set_id: String) -> Dictionary:
	if _sets.has(set_id):
		var record: Dictionary = (_sets[set_id] as Dictionary).duplicate(true)
		record["missing"] = false
		return record
	_warn(set_id, "Missing visual set.")
	return _fallback_set(set_id)


func has_set_for_content(content_id: String) -> bool:
	if content_id.is_empty():
		return false
	var mapped := "visual_set.%s" % content_id
	if _sets.has(mapped):
		return true
	for set_id in _sets.keys():
		var row: Dictionary = _sets[set_id]
		if String(row.get("contentId", "")) == content_id:
			return true
	return false


func resolve_set_for_content(content_id: String) -> Dictionary:
	var mapped := "visual_set.%s" % content_id
	if _sets.has(mapped):
		return resolve_set(mapped)
	for set_id in _sets.keys():
		var row: Dictionary = _sets[set_id]
		if String(row.get("contentId", "")) == content_id:
			return resolve_set(String(set_id))
	return resolve_set(mapped)


func icon_visual_id(kind: String, content_id: String) -> String:
	var bucket: Variant = _icons.get(kind, {})
	if typeof(bucket) == TYPE_DICTIONARY:
		return String((bucket as Dictionary).get(content_id, ""))
	return ""


func audio_entry(audio_id: String) -> Dictionary:
	if _audio.has(audio_id):
		var row: Variant = _audio[audio_id]
		if typeof(row) == TYPE_DICTIONARY:
			var data: Dictionary = (row as Dictionary).duplicate(true)
			data["id"] = audio_id
			data["missing"] = String(data.get("stream", "")).is_empty() or not FileAccess.file_exists(String(data.get("stream", "")))
			if bool(data["missing"]):
				_warn(audio_id, "Missing audio stream.")
			return data
	_warn(audio_id, "Missing audio id.")
	return {"id": audio_id, "stream": "", "bus": "Master", "missing": true}


func validate_all() -> PackedStringArray:
	var errors := PackedStringArray()
	for set_id in _sets.keys():
		errors.append_array(VisualSetMath.validate_set(_sets[set_id]))
	return errors


func _ingest_sets(raw: Variant) -> void:
	if typeof(raw) != TYPE_DICTIONARY:
		return
	for set_id in (raw as Dictionary).keys():
		var row: Variant = (raw as Dictionary)[set_id]
		if typeof(row) != TYPE_DICTIONARY:
			continue
		var data: Dictionary = (row as Dictionary).duplicate(true)
		data["id"] = String(set_id)
		_sets[String(set_id)] = _normalize_set(data)


func _normalize_set(data: Dictionary) -> Dictionary:
	if int(data.get("directionCount", 0)) != 8:
		data["directionCount"] = 4
	if typeof(data.get("frameSize", null)) != TYPE_ARRAY:
		data["frameSize"] = [24, 24]
	if typeof(data.get("pivot", null)) != TYPE_ARRAY:
		data["pivot"] = [12, 18]
	if typeof(data.get("foot", null)) != TYPE_ARRAY:
		data["foot"] = [12, 24]
	if typeof(data.get("animations", null)) != TYPE_DICTIONARY:
		data["animations"] = {
			"idle": {"frames": [0, 0], "fps": 4, "loop": true},
			"walk": {"frames": [0, 3], "fps": 8, "loop": true},
		}
	if typeof(data.get("collisionFootprint", null)) != TYPE_DICTIONARY:
		data["collisionFootprint"] = {"width": 24, "height": 24}
	if typeof(data.get("equipmentAnchors", null)) != TYPE_DICTIONARY:
		data["equipmentAnchors"] = {}
	if String(data.get("fallbackVisualId", "")).is_empty():
		data["fallbackVisualId"] = String(data.get("spriteVisualId", "visual.player"))
	if String(data.get("spriteSource", "")).is_empty():
		data["spriteSource"] = String(data.get("spriteVisualId", ""))
	return data


func _fallback_set(set_id: String) -> Dictionary:
	var data := _normalize_set({
		"id": set_id,
		"kind": "unknown",
		"spriteVisualId": "visual.player",
		"directionCount": 4,
	})
	data["missing"] = true
	return data


func _warn(asset_id: String, message: String) -> void:
	last_warning = "%s (%s)" % [message, asset_id]
	if not missing_ids.has(asset_id):
		missing_ids.append(asset_id)
	push_warning("Missing asset id: %s — %s" % [asset_id, message])


func _as_dict(value: Variant) -> Dictionary:
	if typeof(value) == TYPE_DICTIONARY:
		return (value as Dictionary).duplicate(true)
	return {}
