class_name EmailSyntax
extends RefCounted

## Local email syntax guidance only. Never authoritative and never enumerates accounts.


static func guidance(email: String) -> Dictionary:
	var trimmed := email.strip_edges()
	if trimmed.is_empty():
		return {"ok": false, "reason": "empty", "label": "Enter the email you will use to sign in."}
	if trimmed.length() > 254:
		return {"ok": false, "reason": "too_long", "label": "That email is too long."}
	if trimmed.contains(" "):
		return {"ok": false, "reason": "spaces", "label": "Email addresses cannot contain spaces."}
	var at := trimmed.find("@")
	if at <= 0 or at != trimmed.rfind("@"):
		return {"ok": false, "reason": "at", "label": "Use an address like name@example.com."}
	var local := trimmed.substr(0, at)
	var domain := trimmed.substr(at + 1)
	if local.is_empty() or domain.is_empty() or not domain.contains("."):
		return {"ok": false, "reason": "parts", "label": "Use an address like name@example.com."}
	if domain.begins_with(".") or domain.ends_with(".") or domain.contains(".."):
		return {"ok": false, "reason": "domain", "label": "Check the domain after @."}
	return {"ok": true, "reason": "ok", "label": "Looks like an email address."}
