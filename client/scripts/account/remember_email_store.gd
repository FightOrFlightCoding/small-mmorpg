class_name RememberEmailStore
extends RefCounted

## Persists only a remembered email. Never stores passwords or tokens.

const PATH := "user://remember_email.json"


static func load_email() -> String:
	if not FileAccess.file_exists(PATH):
		return ""
	var text := FileAccess.get_file_as_string(PATH)
	var parsed: Variant = JSON.parse_string(text)
	if typeof(parsed) != TYPE_DICTIONARY:
		return ""
	var data: Dictionary = parsed
	if data.has("password") or data.has("token") or data.has("refresh_token"):
		clear()
		return ""
	if typeof(data.get("email", null)) != TYPE_STRING:
		return ""
	return String(data["email"]).strip_edges()


static func save_email(email: String) -> void:
	var cleaned := email.strip_edges()
	if cleaned.is_empty():
		clear()
		return
	var file := FileAccess.open(PATH, FileAccess.WRITE)
	if file == null:
		return
	file.store_string(JSON.stringify({"email": cleaned}))
	file.close()


static func clear() -> void:
	if FileAccess.file_exists(PATH):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(PATH))
