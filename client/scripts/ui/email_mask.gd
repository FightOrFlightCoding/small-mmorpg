class_name EmailMask
extends RefCounted

## Masks an address the player already typed or authenticated. Never invents an address.


static func mask(email: String) -> String:
	var trimmed := email.strip_edges()
	var at := trimmed.find("@")
	if at <= 0 or at == trimmed.length() - 1:
		return ""
	var local := trimmed.substr(0, at)
	var domain := trimmed.substr(at + 1)
	var shown := local.substr(0, 1)
	return "%s***@%s" % [shown, domain]


static func explain_destination(email: String, fallback: String = "your email") -> String:
	var masked := mask(email)
	if masked.is_empty():
		return "We sent a code to %s." % fallback
	return "We sent a code to %s." % masked
