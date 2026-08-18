class_name LocalSettingsStore
extends RefCounted

## Non-authoritative client settings only. Never stores credentials or session tokens.

const DEFAULT_PATH := "user://client_settings.json"
const FORBIDDEN_KEYS := [
	"password",
	"email",
	"email_password",
	"token",
	"refresh_token",
	"session",
	"selection_ticket",
	"transfer_ticket",
]


static func load_settings(path: String = DEFAULT_PATH) -> Dictionary:
	if not FileAccess.file_exists(path):
		return {}
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	if typeof(parsed) != TYPE_DICTIONARY:
		return {}
	var data: Dictionary = parsed
	if _contains_forbidden(data):
		return {}
	return data


static func save_settings(data: Dictionary, path: String = DEFAULT_PATH) -> bool:
	if _contains_forbidden(data):
		return false
	var file := FileAccess.open(path, FileAccess.WRITE)
	if file == null:
		return false
	file.store_string(JSON.stringify(data))
	file.close()
	return true


static func clear(path: String = DEFAULT_PATH) -> void:
	if FileAccess.file_exists(path):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(path))


static func _contains_forbidden(value: Variant) -> bool:
	if typeof(value) == TYPE_DICTIONARY:
		var data: Dictionary = value
		for key in data.keys():
			var name := String(key).to_lower()
			if FORBIDDEN_KEYS.has(name):
				return true
			if _contains_forbidden(data[key]):
				return true
	elif typeof(value) == TYPE_ARRAY:
		for entry in value:
			if _contains_forbidden(entry):
				return true
	return false
