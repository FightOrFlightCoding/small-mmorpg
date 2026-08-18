class_name ZoneChat
extends RefCounted

## Presentation helpers for the starter-zone room channel. Not a gameplay authority.

const ROOM_NAME := "zone.starter"
const CHANNEL_TYPE_ROOM := 1
const MAX_CHARS := 200
const MAX_HISTORY := 50


static func normalize_text(raw: String) -> String:
	return raw.strip_edges()


static func reject_reason(raw: String) -> String:
	var cleaned := normalize_text(raw)
	if cleaned.is_empty():
		return "empty_message"
	if cleaned.length() > MAX_CHARS:
		return "message_too_long"
	return ""


static func payload(raw: String) -> Dictionary:
	return {"message": normalize_text(raw)}


static func party_payload(raw: String, party_id: String) -> Dictionary:
	return {"message": normalize_text(raw), "partyId": party_id}


static func parse_content(raw: String) -> String:
	if raw.is_empty():
		return ""
	var parsed: Variant = JSON.parse_string(raw)
	if typeof(parsed) == TYPE_DICTIONARY:
		var data: Dictionary = parsed
		if data.has("message"):
			return String(data["message"])
	return raw


static func format_timestamp(raw: String) -> String:
	var marker := raw.find("T")
	if marker >= 0 and raw.length() >= marker + 6:
		return raw.substr(marker + 1, 5)
	var now: Dictionary = Time.get_time_dict_from_system()
	return "%02d:%02d" % [int(now.get("hour", 0)), int(now.get("minute", 0))]


static func format_line(time_text: String, sender: String, body: String) -> String:
	return "[%s] %s: %s" % [time_text, sender, body]


static func format_presence(time_text: String, username: String, joined: bool) -> String:
	if joined:
		return "[%s] %s joined chat." % [time_text, username]
	return "[%s] %s left chat." % [time_text, username]


static func cap_history(lines: PackedStringArray) -> PackedStringArray:
	if lines.size() <= MAX_HISTORY:
		return lines
	return lines.slice(lines.size() - MAX_HISTORY)


static func sender_name(sender_id: String, username: String, zone_view: Dictionary) -> String:
	for entry in zone_view.get("players", []):
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		if String(entry.get("userId", "")) != sender_id:
			continue
		var named := String(entry.get("name", ""))
		if not named.is_empty():
			return named
	if not username.is_empty():
		return username
	if not AppState.character_view.is_empty() and sender_id == AppState.user_id:
		var from_character := String(AppState.character_view.get("name", ""))
		if not from_character.is_empty():
			return from_character
	return sender_id if not sender_id.is_empty() else "unknown"
