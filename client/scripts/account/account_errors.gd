class_name AccountErrors
extends RefCounted

## Maps gateway, RPC, and UI catalog codes to player-visible copy. Never includes tokens or internals.

const UNKNOWN_COPY := "Something went wrong."

const ALIASES := {
	"invalid_credentials": "AUTH_INVALID_CREDENTIALS",
	"AUTH_EMAIL_INVALID": "AUTH_EMAIL_INVALID",
	"email_invalid": "AUTH_EMAIL_INVALID",
	"AUTH_EMAIL_IN_USE_OR_PENDING": "AUTH_EMAIL_IN_USE_OR_PENDING",
	"AUTH_EMAIL_TAKEN": "AUTH_EMAIL_IN_USE_OR_PENDING",
	"AUTH_REGISTRATION_FAILED": "AUTH_EMAIL_IN_USE_OR_PENDING",
	"AUTH_EMAIL_UNVERIFIED": "AUTH_EMAIL_UNVERIFIED",
	"EMAIL_VERIFICATION_REQUIRED": "AUTH_EMAIL_UNVERIFIED",
	"email_verification_required": "AUTH_EMAIL_UNVERIFIED",
	"AUTH_PASSWORD_WEAK": "AUTH_PASSWORD_WEAK",
	"password_too_short": "AUTH_PASSWORD_WEAK",
	"password_common": "AUTH_PASSWORD_WEAK",
	"AUTH_RATE_LIMITED": "AUTH_RATE_LIMITED",
	"auth_rate_limited": "AUTH_RATE_LIMITED",
	"rate_limited": "AUTH_RATE_LIMITED",
	"AUTH_VERIFICATION_INVALID": "AUTH_VERIFICATION_INVALID",
	"AUTH_INVALID_CHALLENGE": "AUTH_VERIFICATION_INVALID",
	"AUTH_VERIFICATION_EXPIRED": "AUTH_VERIFICATION_EXPIRED",
	"AUTH_CHALLENGE_EXPIRED": "AUTH_VERIFICATION_EXPIRED",
	"AUTH_RESET_INVALID": "AUTH_RESET_INVALID",
	"AUTH_RESET_EXPIRED": "AUTH_RESET_EXPIRED",
	"AUTH_SESSION_EXPIRED": "AUTH_SESSION_EXPIRED",
	"session_expired": "AUTH_SESSION_EXPIRED",
	"AUTH_SESSION_REVOKED": "AUTH_SESSION_REVOKED",
	"AUTH_FORBIDDEN": "AUTH_SESSION_REVOKED",
	"ACCOUNT_DISABLED": "ACCOUNT_DISABLED",
	"AUTH_ACCOUNT_DISABLED": "ACCOUNT_DISABLED",
	"account_disabled": "ACCOUNT_DISABLED",
	"ACCOUNT_DELETING": "ACCOUNT_DELETING",
	"AUTH_ACCOUNT_DELETING": "ACCOUNT_DELETING",
	"account_deleting": "ACCOUNT_DELETING",
	"account_deleted": "ACCOUNT_DELETING",
	"ACCOUNT_SERVER_UNAVAILABLE": "ACCOUNT_SERVER_UNAVAILABLE",
	"AUTH_UNAVAILABLE": "ACCOUNT_SERVER_UNAVAILABLE",
	"network_unreachable": "ACCOUNT_SERVER_UNAVAILABLE",
	"CHARACTER_SLOTS_FULL": "CHARACTER_SLOTS_FULL",
	"slot_limit": "CHARACTER_SLOTS_FULL",
	"CHARACTER_NAME_INVALID": "CHARACTER_NAME_INVALID",
	"invalid_name": "CHARACTER_NAME_INVALID",
	"CHARACTER_NAME_TAKEN": "CHARACTER_NAME_TAKEN",
	"name_taken": "CHARACTER_NAME_TAKEN",
	"CHARACTER_NOT_OWNED": "CHARACTER_NOT_OWNED",
	"selection_foreign": "CHARACTER_NOT_OWNED",
	"character_missing": "CHARACTER_NOT_OWNED",
	"CHARACTER_DELETED": "CHARACTER_DELETED",
	"character_deleted": "CHARACTER_DELETED",
	"CHARACTER_ALREADY_ACTIVE": "CHARACTER_ALREADY_ACTIVE",
	"selection_pending": "CHARACTER_ALREADY_ACTIVE",
	"ACCOUNT_CHARACTER_ACTIVE": "ACCOUNT_CHARACTER_ACTIVE",
	"account_busy": "ACCOUNT_CHARACTER_ACTIVE",
	"AUTH_ACCOUNT_BUSY": "ACCOUNT_CHARACTER_ACTIVE",
	"CHARACTER_LINK_DEAD": "CHARACTER_LINK_DEAD",
	"link_dead": "CHARACTER_LINK_DEAD",
	"CHARACTER_SELECTION_EXPIRED": "CHARACTER_SELECTION_EXPIRED",
	"selection_expired": "CHARACTER_SELECTION_EXPIRED",
	"selection_invalidated": "CHARACTER_SELECTION_EXPIRED",
	"CHARACTER_SAFE_LEAVE_DENIED": "CHARACTER_SAFE_LEAVE_DENIED",
	"unsafe_leave": "CHARACTER_SAFE_LEAVE_DENIED",
	"EMAIL_DELIVERY_DELAYED": "EMAIL_DELIVERY_DELAYED",
	"CLIENT_UPDATE_REQUIRED": "CLIENT_UPDATE_REQUIRED",
	"AUTH_CLIENT_VERSION": "CLIENT_UPDATE_REQUIRED",
	"client_too_old": "CLIENT_UPDATE_REQUIRED",
	"PROTOCOL_MISMATCH": "PROTOCOL_MISMATCH",
	"protocol_mismatch": "PROTOCOL_MISMATCH",
	"CONTENT_MISMATCH": "CONTENT_MISMATCH",
	"content_mismatch": "CONTENT_MISMATCH",
	"content_incompatible": "CONTENT_MISMATCH",
	"MAINTENANCE_ACTIVE": "MAINTENANCE_ACTIVE",
	"server_maintenance": "MAINTENANCE_ACTIVE",
	"AUTH_REGISTRATION_CLOSED": "AUTH_REGISTRATION_CLOSED",
	"AUTH_CHALLENGE_LOCKED": "AUTH_CHALLENGE_LOCKED",
	"AUTH_PASSWORD_REUSE": "AUTH_PASSWORD_REUSE",
	"AUTH_VALIDATION": "AUTH_VALIDATION",
	"AUTH_ACCOUNT_TRADING": "AUTH_ACCOUNT_TRADING",
	"account_trading": "AUTH_ACCOUNT_TRADING",
	"AUTH_ACCOUNT_TRANSFERRING": "AUTH_ACCOUNT_TRANSFERRING",
	"account_transferring": "AUTH_ACCOUNT_TRANSFERRING",
	"AUTH_DELETE_ACTIVE": "AUTH_DELETE_ACTIVE",
	"delete_already_active": "AUTH_DELETE_ACTIVE",
	"AUTH_DELETE_PHRASE": "AUTH_DELETE_PHRASE",
	"delete_phrase": "AUTH_DELETE_PHRASE",
	"AUTH_EXPORT_EXPIRED": "AUTH_EXPORT_EXPIRED",
	"password_mismatch": "password_mismatch",
	"terms_required": "terms_required",
}

const MESSAGES := {
	"AUTH_INVALID_CREDENTIALS": "Email or password is incorrect.",
	"AUTH_EMAIL_INVALID": "Enter a valid email address.",
	"AUTH_EMAIL_IN_USE_OR_PENDING": "We could not create this account.\nIf you previously registered, try logging in or resetting your password.",
	"AUTH_EMAIL_UNVERIFIED": "Verify your email before creating a character or entering the world.",
	"AUTH_PASSWORD_WEAK": "Choose a stronger password. Use 15–128 characters and avoid common passwords.",
	"AUTH_RATE_LIMITED": "Too many attempts. Wait and try again.",
	"AUTH_VERIFICATION_INVALID": "That verification code is invalid or has expired.",
	"AUTH_VERIFICATION_EXPIRED": "That code has expired. Request a new one.",
	"AUTH_RESET_INVALID": "That reset code is invalid. Request a new one.",
	"AUTH_RESET_EXPIRED": "That reset code has expired. Request a new one.",
	"AUTH_SESSION_EXPIRED": "The session expired. Sign in again.",
	"AUTH_SESSION_REVOKED": "That session is no longer valid. Sign in again.",
	"ACCOUNT_DISABLED": "This account is disabled. Contact support if you need help.",
	"ACCOUNT_DELETING": "This account is being deleted and cannot sign in.",
	"ACCOUNT_SERVER_UNAVAILABLE": "The account service is unavailable. Try again shortly.",
	"CHARACTER_SLOTS_FULL": "All five character slots are in use. Delete or wait for a purge before creating or restoring.",
	"CHARACTER_NAME_INVALID": "That character name does not meet the requirements.",
	"CHARACTER_NAME_TAKEN": "That character name is not available.",
	"CHARACTER_NOT_OWNED": "That character is not available on this account.",
	"CHARACTER_DELETED": "That character is deleted.",
	"CHARACTER_ALREADY_ACTIVE": "That character is already being selected.",
	"ACCOUNT_CHARACTER_ACTIVE": "Another character on this account is still in the world.",
	"CHARACTER_LINK_DEAD": "That character is still in the world. Wait for the server countdown.",
	"CHARACTER_SELECTION_EXPIRED": "That selection expired. Choose a character again.",
	"CHARACTER_SAFE_LEAVE_DENIED": "The server did not authorize leaving yet. The character is still in the world.",
	"EMAIL_DELIVERY_DELAYED": "Email delivery is delayed. Check junk folders or try again later.",
	"CLIENT_UPDATE_REQUIRED": "This client version is not compatible with the server. Update the client.",
	"PROTOCOL_MISMATCH": "This client cannot speak to the server. Update the client.",
	"CONTENT_MISMATCH": "This client content pack does not match the server.",
	"MAINTENANCE_ACTIVE": "The server is in maintenance. Gameplay is paused.",
	"AUTH_REGISTRATION_CLOSED": "New account registration is closed on this server.",
	"AUTH_CHALLENGE_LOCKED": "Too many incorrect codes. Request a new one.",
	"AUTH_PASSWORD_REUSE": "Choose a different password.",
	"AUTH_VALIDATION": "Check the highlighted fields and try again.",
	"AUTH_ACCOUNT_TRADING": "Finish or cancel the open trade before deleting this account.",
	"AUTH_ACCOUNT_TRANSFERRING": "Wait for the transfer to finish before deleting this account.",
	"AUTH_DELETE_ACTIVE": "Account deletion is already in progress.",
	"AUTH_DELETE_PHRASE": "Type DELETE ACCOUNT exactly to confirm.",
	"AUTH_EXPORT_EXPIRED": "That export download expired. Request a new export.",
	"password_mismatch": "Password confirmation does not match.",
	"terms_required": "Accept the current Terms of Service and Privacy Policy to register.",
	"legal_placeholder": "Legal documents will be published at a later date.",
	"email_verified": "Email verified. You can sign in.",
	"verification_resent": "If that email is unverified, we sent another code.",
	"development_auth_blocked": "Development sign-in is unavailable in this build. Use email and password.",
}


static func canonicalize(code: String) -> String:
	if ALIASES.has(code):
		return String(ALIASES[code])
	return code


static func is_known(code: String) -> bool:
	if code.is_empty():
		return false
	return MESSAGES.has(canonicalize(code))


static func message_for(code: String, fallback: String = "") -> String:
	var key := canonicalize(code)
	if MESSAGES.has(key):
		return String(MESSAGES[key])
	if code == "AUTH_REGISTRATION_FAILED":
		return String(MESSAGES["AUTH_EMAIL_IN_USE_OR_PENDING"])
	if fallback.is_empty() or looks_like_internal_trace(fallback):
		return UNKNOWN_COPY
	return UNKNOWN_COPY


static func display_for(code: String, request_id: String = "") -> String:
	if is_known(code) or code == "AUTH_REGISTRATION_FAILED":
		return message_for(code)
	if request_id.is_empty():
		return UNKNOWN_COPY
	return "%s\nReference: %s" % [UNKNOWN_COPY, request_id]


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
		"slot_limit",
		"name_taken",
		"invalid_name",
		"invalid_class",
		"character_deleted",
		"gameplay_lease",
		"confirmation_mismatch",
		"confirmation_required",
		"retention_expired",
		"reservation_mismatch",
		"account_busy",
		"link_dead",
		"account_trading",
		"account_transferring",
		"delete_already_active",
		"delete_phrase",
		"content_incompatible",
		"selection_expired",
		"selection_invalidated",
		"selection_required",
	])
	if known.has(first_line):
		return first_line
	var lowered := trimmed.to_lower()
	var best := ""
	for item in known:
		if lowered.contains(item) and String(item).length() > best.length():
			best = item
	return best


static func sanitize_public_rpc(mapped: Dictionary) -> Dictionary:
	var raw := String(mapped.get("message", ""))
	var code := String(mapped.get("code", ""))
	var domain := extract_rpc_domain_code(raw)
	if domain.is_empty():
		domain = extract_rpc_domain_code(code)
	if not domain.is_empty():
		mapped["code"] = domain
		if is_account_gate(domain) or is_known(domain):
			mapped["message"] = message_for(domain)
		elif looks_like_internal_trace(raw):
			mapped["message"] = "The server rejected the request."
	elif looks_like_internal_trace(raw):
		mapped["code"] = "rpc_failed"
		mapped["message"] = "The server rejected the request."
	elif not is_known(code):
		mapped["message"] = display_for(code, String(mapped.get("request_id", mapped.get("requestId", ""))))
	return mapped


static func is_account_gate(code: String) -> bool:
	var key := canonicalize(code)
	return (
		key == "AUTH_EMAIL_UNVERIFIED"
		or key == "ACCOUNT_DISABLED"
		or key == "ACCOUNT_DELETING"
	)
