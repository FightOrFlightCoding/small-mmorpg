class_name AccountErrors
extends RefCounted

## Maps gateway and gameplay account codes to player-visible copy. Never includes tokens.


static func message_for(code: String, fallback: String = "") -> String:
	match code:
		"AUTH_REGISTRATION_FAILED":
			return "We could not create this account.\nIf you previously registered, try logging in or resetting your password."
		"AUTH_INVALID_CREDENTIALS", "invalid_credentials":
			return "Email or password is incorrect."
		"EMAIL_VERIFICATION_REQUIRED", "email_verification_required":
			return "Verify your email before creating a character or entering the world."
		"AUTH_ACCOUNT_DISABLED", "account_disabled":
			return "This account is disabled. Contact support if you need help."
		"AUTH_ACCOUNT_DELETING", "account_deleting", "account_deleted":
			return "This account is being deleted and cannot sign in."
		"AUTH_REGISTRATION_CLOSED":
			return "New account registration is closed on this server."
		"AUTH_CLIENT_VERSION":
			return "This client version is not compatible with the server."
		"AUTH_RATE_LIMITED", "auth_rate_limited":
			return "Too many attempts. Wait and try again."
		"AUTH_INVALID_CHALLENGE":
			return "That verification code is invalid or has expired."
		"AUTH_UNAVAILABLE", "network_unreachable":
			return "The account service is unavailable. Try again shortly."
		"AUTH_FORBIDDEN":
			return "That session is no longer valid. Sign in again."
		"AUTH_VALIDATION":
			return "Check the highlighted fields and try again."
		"password_mismatch":
			return "Password confirmation does not match."
		"terms_required":
			return "Accept the current Terms of Service and Privacy Policy to register."
		"session_expired":
			return "The session expired. Sign in again."
		_:
			if fallback.is_empty():
				return "Could not complete that account request."
			return fallback


static func looks_like_internal_trace(message: String) -> bool:
	var lowered := message.to_lower()
	if lowered.contains("stacktrace") or lowered.contains("uncaught exception"):
		return true
	if lowered.contains("index.js") and lowered.contains(" at "):
		return true
	return lowered.contains("\tat ")


static func extract_rpc_domain_code(message: String) -> String:
	var trimmed := message.strip_edges()
	if trimmed.is_empty():
		return ""
	if trimmed.begins_with("unknown_field:") or trimmed.begins_with("stat_injection:"):
		return trimmed
	var first_line := trimmed.split("\n")[0].strip_edges()
	if first_line.to_lower().begins_with("error:"):
		first_line = first_line.substr(6).strip_edges()
	var known := PackedStringArray([
		"already_in_party",
		"character_missing",
		"duplicate_invite",
		"duplicate_request",
		"invite_expired",
		"invite_missing",
		"invite_pending",
		"invalid_credentials",
		"invalid_id",
		"invalid_request_id",
		"invalid_target",
		"malformed_json",
		"not_in_party",
		"not_leader",
		"not_member",
		"party_failed",
		"party_full",
		"party_missing",
		"rate_limited",
		"revision_mismatch",
		"selection_foreign",
		"stale_revision",
		"unauthenticated",
		"email_verification_required",
		"account_disabled",
		"account_deleting",
		"account_deleted",
		"server_maintenance",
		"registration_disabled",
		"device_auth_disabled",
	])
	if known.has(first_line):
		return first_line
	var lowered := trimmed.to_lower()
	var best := ""
	for code in known:
		if lowered.contains(code) and String(code).length() > best.length():
			best = code
	return best


static func sanitize_public_rpc(mapped: Dictionary) -> Dictionary:
	var raw := String(mapped.get("message", ""))
	var code := String(mapped.get("code", ""))
	var domain := extract_rpc_domain_code(raw)
	if domain.is_empty():
		domain = extract_rpc_domain_code(code)
	if not domain.is_empty():
		mapped["code"] = domain
		if is_account_gate(domain):
			mapped["message"] = message_for(domain, "The server rejected the request.")
		elif looks_like_internal_trace(raw):
			mapped["message"] = "The server rejected the request."
	elif looks_like_internal_trace(raw):
		mapped["code"] = "rpc_failed"
		mapped["message"] = "The server rejected the request."
	return mapped


static func is_account_gate(code: String) -> bool:
	return (
		code == "email_verification_required"
		or code == "EMAIL_VERIFICATION_REQUIRED"
		or code == "account_disabled"
		or code == "AUTH_ACCOUNT_DISABLED"
		or code == "account_deleting"
		or code == "AUTH_ACCOUNT_DELETING"
		or code == "account_deleted"
	)
