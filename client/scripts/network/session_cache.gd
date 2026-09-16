class_name SessionCache
extends RefCounted

## Caches Nakama session tokens in user://. Never stores passwords.

const PATH := "user://session_cache.json"
const AUTH_MODE_DEVICE := "device"
const AUTH_MODE_EMAIL := "email"


static func save(
	token: String,
	refresh_token: String,
	user_id: String,
	username: String,
	auth_mode: String,
	device_id: String = ""
) -> void:
	if token.is_empty() or refresh_token.is_empty():
		return
	var payload := {
		"token": token,
		"refresh_token": refresh_token,
		"user_id": user_id,
		"username": username,
		"auth_mode": auth_mode,
	}
	if auth_mode == AUTH_MODE_DEVICE and not device_id.is_empty():
		payload["device_id"] = device_id
	var file := FileAccess.open(PATH, FileAccess.WRITE)
	if file == null:
		return
	file.store_string(JSON.stringify(payload))
	file.close()


static func load_cache() -> Dictionary:
	if not FileAccess.file_exists(PATH):
		return {}
	var text := FileAccess.get_file_as_string(PATH)
	var parsed: Variant = JSON.parse_string(text)
	if typeof(parsed) != TYPE_DICTIONARY:
		return {}
	var data: Dictionary = parsed
	if data.has("password") or data.has("email_password"):
		clear()
		return {}
	if typeof(data.get("token", null)) != TYPE_STRING or typeof(data.get("refresh_token", null)) != TYPE_STRING:
		return {}
	return data


static func clear() -> void:
	if FileAccess.file_exists(PATH):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(PATH))
