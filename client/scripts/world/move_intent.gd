class_name MoveIntent
extends RefCounted

## Client movement intention. Sends direction and sequence only.

const SEND_HZ := 10.0


static func normalize_axes(axis: Vector2) -> Vector2:
	if axis.length_squared() <= 0.0:
		return Vector2.ZERO
	if axis.length() > 1.0:
		return axis.normalized()
	return axis


static func read_axes() -> Vector2:
	return normalize_axes(Input.get_vector("move_left", "move_right", "move_up", "move_down"))


static func payload(seq: int, axis: Vector2) -> Dictionary:
	var clean := normalize_axes(axis)
	return MatchProtocol.client_envelope({
		"seq": seq,
		"axisX": clean.x,
		"axisY": clean.y,
	})


static func payload_json(seq: int, axis: Vector2) -> String:
	return JSON.stringify(payload(seq, axis))
