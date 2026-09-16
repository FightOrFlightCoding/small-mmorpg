class_name UxServerStatus
extends Label

## Compact server availability indicator. Not an authority.

enum State { CHECKING, READY, MAINTENANCE, INCOMPATIBLE, UNAVAILABLE }


func set_state(state: State, extra: String = "") -> void:
	match state:
		State.READY:
			text = "Server: ready"
		State.MAINTENANCE:
			text = "Server: maintenance"
		State.INCOMPATIBLE:
			text = "Server: incompatible"
		State.UNAVAILABLE:
			text = "Server: unavailable"
		_:
			text = "Server: checking"
	if not extra.is_empty():
		text = "%s — %s" % [text, extra]
	if "accessibility_name" in self:
		set("accessibility_name", text)


static func from_app_state(target: Label) -> void:
	if target == null:
		return
	if AppState.server_maintenance:
		target.text = "Server: maintenance"
	elif AppState.content_incompatible:
		target.text = "Server: incompatible"
	elif not AccountService.gateway_reachable:
		target.text = "Server: unavailable"
	else:
		target.text = "Server: ready"
	if "accessibility_name" in target:
		target.set("accessibility_name", target.text)
