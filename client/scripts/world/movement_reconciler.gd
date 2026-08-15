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


func _init(p_sim: MovementSim = null) -> void:
	sim = p_sim if p_sim != null else MovementSim.new()


func reset(origin: Vector2) -> void:
	predicted = origin
	display = origin
	last_ack_seq = 0
	last_error = 0.0
	last_correction = "none"
	_pending.clear()


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
	display = sim.step(display, clean)
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

	var visual_error := display.distance_to(replayed)
	last_error = visual_error
	predicted = replayed

	if visual_error <= AGREE_EPSILON:
		last_correction = "none"
		display = replayed
	elif visual_error <= SNAP_THRESHOLD:
		last_correction = "smooth"
		display = display.lerp(replayed, SMOOTH_BLEND)
	else:
		last_correction = "snap"
		display = replayed

	return {
		"display": display,
		"predicted": predicted,
		"error": last_error,
		"correction": last_correction,
		"pending": pending_count(),
	}
