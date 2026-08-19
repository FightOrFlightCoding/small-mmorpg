class_name AuthPrivacy
extends RefCounted

## Maps Nakama auth errors without leaking whether an email is registered.


static func public_login_failure_code() -> String:
	return "invalid_credentials"


static func public_login_failure_message() -> String:
	return "Email or password is incorrect."


static func sanitize_auth_failure(create: bool, raw_message: String) -> Dictionary:
	var lowered := raw_message.to_lower()
	if create and (lowered.contains("exists") or lowered.contains("already")):
		return {"code": "email_taken", "message": "That email is already registered."}
	return {"code": public_login_failure_code(), "message": public_login_failure_message()}
