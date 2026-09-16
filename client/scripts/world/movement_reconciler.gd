class_name MovementReconciler
extends RefCounted

## Client-side movement prediction and reconciliation. Never a gameplay authority.

const AGREE_EPSILON := 0.5
const SNAP_THRESHOLD := 24.0
const SMOOTH_BLEND := 0.35

var sim: MovementSim
var predicted: Vector2 = Vector2.ZERO
var display: Vector2 = Vector2.ZERO
var last_ack_seq: int = 0
var last_error: float = 0.0
var last_correction: String = "none"

var _pending: Array[Dictionary] = []
var _last_axis: Vector2 = Vector2.ZERO


func _init(p_sim: MovementSim = null) -> void:
	sim = p_sim if p_sim != null else MovementSim.new()


func reset(origin: Vector2) -> void:
	predicted = origin
	display = origin
	last_ack_seq = 0
	last_error = 0.0
	last_correction = "none"
	_pending.clear()
	_last_axis = Vector2.ZERO


func pending_count() -> int:
	return _pending.size()


func pending_seqs() -> PackedInt32Array:
	var seqs := PackedInt32Array()
	for cmd in _pending:
		seqs.append(int(cmd["seq"]))
	return seqs


func predict(seq: int, axis: Vector2) -> Vector2:
	var clean := MovementSim.sanitize_axes(axis)
	_pending.append({"seq": seq, "axis": clean})
	predicted = sim.step(predicted, clean)
	return predicted


func advance(delta: float, axis: Vector2) -> Vector2:
	var dt := clampf(delta, 0.0, MovementSim.TICK_DT)
	if dt <= 0.0:
		return display
	var clean := MovementSim.sanitize_axes(axis)
	_last_axis = clean
	if clean.is_zero_approx():
		display = display.move_toward(predicted, sim.move_speed * dt)
		if sim.blocked_at(display) and not sim.blocked_at(predicted):
			display = predicted
		return display
	display = sim.step(display, clean, dt)
	return display


func reconcile(server_pos: Vector2, ack_seq: int) -> Dictionary:
	var kept: Array[Dictionary] = []
	for cmd in _pending:
		if int(cmd["seq"]) > ack_seq:
			kept.append(cmd)
	_pending = kept
	last_ack_seq = ack_seq

	var replayed := server_pos
	for cmd in _pending:
		replayed = sim.step(replayed, cmd["axis"])

	var old_predicted := predicted
	predicted = replayed
	var sim_error := old_predicted.distance_to(replayed)
	last_error = sim_error
	var holding := not _last_axis.is_zero_approx()

	if sim_error <= AGREE_EPSILON:
		last_correction = "none"
	elif sim_error <= SNAP_THRESHOLD:
		last_correction = "smooth"
		if not holding:
			var blended: Vector2 = display.lerp(predicted, SMOOTH_BLEND)
			if sim.blocked_at(blended) and not sim.blocked_at(predicted):
				display = predicted
			else:
				display = blended
	else:
		last_correction = "snap"
		display = predicted

	return {
		"display": display,
		"predicted": predicted,
		"error": last_error,
		"correction": last_correction,
		"pending": pending_count(),
	}
