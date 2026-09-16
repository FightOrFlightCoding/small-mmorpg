class_name PasswordStrength
extends RefCounted

## Client-side guidance matching the gateway 15–128 and common-password rules.

const MIN_LENGTH := 15
const MAX_LENGTH := 128
const COMMON: Array[String] = [
	"passwordpassword",
	"password1234567",
	"123456789012345",
	"qwertyuiopasdfg",
	"letmeinletmein1",
	"iloveyouiloveyou",
	"adminadminadmin",
	"welcome welcome1",
	"footballfootball",
	"monkeymonkeymon",
]


static func evaluate(password: String) -> Dictionary:
	if password.length() == 0:
		return {"ok": false, "reason": "password_required", "label": "Use 15–128 characters. Avoid common passwords."}
	if password.length() < MIN_LENGTH:
		return {"ok": false, "reason": "password_too_short", "label": "Too short. Use at least 15 characters."}
	if password.length() > MAX_LENGTH:
		return {"ok": false, "reason": "password_too_long", "label": "Too long. Use at most 128 characters."}
	if password.to_lower() in COMMON:
		return {"ok": false, "reason": "password_common", "label": "That password is too common."}
	return {"ok": true, "reason": "ok", "label": "Looks good."}
