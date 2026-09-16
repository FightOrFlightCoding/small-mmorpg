class_name DevIdentity
extends RefCounted

## Resolves a Nakama device id for local development. Never logs tokens.

const DEV_PREFIX := "vibecode-dev-"
const LOCAL_PREFIX := "vibecode-local-"
const SHARED_FALLBACK := "vibecode-local-shared"
const MIN_DEVICE_ID_LENGTH := 10
const MAX_DEVICE_ID_LENGTH := 128
const DEV_USER_PATTERN := "^[a-z][a-z0-9_]{0,31}$"
const DEVICE_ID_PATTERN := "^[a-zA-Z0-9._-]+$"

static var force_release_config: bool = false


static func development_auth_allowed() -> bool:
	if force_release_config:
		return false
	return OS.is_debug_build()


static func parse_dev_user(args: PackedStringArray) -> String:
	for arg in args:
		if arg.begins_with("--dev-user="):
			return arg.substr("--dev-user=".length())
	return ""


static func device_id_for_dev_user(dev_user: String) -> String:
	if not _matches(DEV_USER_PATTERN, dev_user):
		return ""
	return DEV_PREFIX + dev_user


static func is_valid_device_id(device_id: String) -> bool:
	if device_id.length() < MIN_DEVICE_ID_LENGTH or device_id.length() > MAX_DEVICE_ID_LENGTH:
		return false
	return _matches(DEVICE_ID_PATTERN, device_id)


static func resolve(args: PackedStringArray, machine_unique_id: String) -> Dictionary:
	var result := {
		"device_id": SHARED_FALLBACK,
		"dev_user": "",
		"source": "shared",
		"display_name": "Adventurer",
		"warning": "No --dev-user was set and this machine has no stable unique id. All such clients share one Nakama account.",
		"error": "",
	}
	var dev_user := parse_dev_user(args)
	if not dev_user.is_empty():
		var device_id := device_id_for_dev_user(dev_user)
		if device_id.is_empty() or not is_valid_device_id(device_id):
			result["error"] = "invalid_dev_user"
			result["warning"] = "Development user '%s' is invalid. Use lowercase letters, digits, and underscore." % dev_user
			return result
		result["device_id"] = device_id
		result["dev_user"] = dev_user
		result["source"] = "dev"
		result["display_name"] = _title_case(dev_user)
		result["warning"] = ""
		return result

	var sanitized := _sanitize_machine_id(machine_unique_id)
	if sanitized.is_empty():
		return result
	result["device_id"] = sanitized
	result["source"] = "machine"
	result["display_name"] = "Adventurer"
	result["warning"] = "No --dev-user was set. This client uses OS.get_unique_id(). It is not a production identity: reinstall or another machine creates a different account, and every launch on this machine shares one account."
	return result


static func proposed_character_name(identity: Dictionary) -> String:
	var display_name := String(identity.get("display_name", "Adventurer"))
	if display_name.is_empty():
		return "Adventurer"
	return display_name


static func _sanitize_machine_id(machine_unique_id: String) -> String:
	var cleaned := ""
	for i in machine_unique_id.length():
		var ch := machine_unique_id.substr(i, 1)
		if _matches("[a-zA-Z0-9._-]", ch):
			cleaned += ch
		elif ch == "{" or ch == "}" or ch == ":" or ch == " ":
			continue
		else:
			cleaned += "-"
	if cleaned.is_empty():
		return ""
	var device_id := LOCAL_PREFIX + cleaned
	if device_id.length() > MAX_DEVICE_ID_LENGTH:
		device_id = device_id.substr(0, MAX_DEVICE_ID_LENGTH)
	if not is_valid_device_id(device_id):
		return ""
	return device_id


static func _title_case(value: String) -> String:
	if value.is_empty():
		return "Adventurer"
	return value.substr(0, 1).to_upper() + value.substr(1)


static func _matches(pattern: String, value: String) -> bool:
	var regex := RegEx.new()
	var err := regex.compile(pattern)
	if err != OK:
		return false
	return regex.search(value) != null
