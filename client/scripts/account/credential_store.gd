class_name CredentialStore
extends RefCounted

## Optional OS credential store for Stay Signed In. Unavailable until platform-tested.

const STAY_SIGNED_IN_ENABLED := false


func is_available() -> bool:
	return false


func save_refresh_token(_user_id: String, _refresh_token: String) -> bool:
	return false


func load_refresh_token(_user_id: String) -> String:
	return ""


func clear(_user_id: String = "") -> void:
	pass
