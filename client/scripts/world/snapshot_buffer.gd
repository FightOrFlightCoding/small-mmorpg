class_name SnapshotBuffer
extends RefCounted

## Short history of remote poses. Samples behind estimated server time; does not extrapolate.

const INTERP_DELAY_TICKS := 1.0
const MAX_FRAMES := 8

var frozen: bool = false

var _frames: Array[Dictionary] = []
var _since_latest_sec: float = 0.0


func clear() -> void:
	_frames.clear()
	_since_latest_sec = 0.0
	frozen = false


func depth() -> int:
	return _frames.size()


func latest_tick() -> int:
	if _frames.is_empty():
		return 0
	return int(_frames[_frames.size() - 1]["tick"])


func push(tick: int, poses: Dictionary) -> bool:
	if frozen:
		return false
	if not _frames.is_empty() and tick <= int(_frames[_frames.size() - 1]["tick"]):
		return false
	_frames.append({"tick": tick, "poses": poses.duplicate(true)})
	_since_latest_sec = 0.0
	while _frames.size() > MAX_FRAMES:
		_frames.remove_at(0)
	return true


func advance(delta: float) -> void:
	if frozen or _frames.is_empty():
		return
	_since_latest_sec += maxf(delta, 0.0)


func sample(render_tick: float) -> Dictionary:
	if _frames.is_empty():
		return {}
	if _frames.size() == 1 or render_tick >= float(latest_tick()):
		return (_frames[_frames.size() - 1]["poses"] as Dictionary).duplicate(true)
	if render_tick <= float(_frames[0]["tick"]):
		return (_frames[0]["poses"] as Dictionary).duplicate(true)

	var later_idx := 0
	for i in range(_frames.size()):
		if float(_frames[i]["tick"]) >= render_tick:
			later_idx = i
			break
	if later_idx == 0:
		return (_frames[0]["poses"] as Dictionary).duplicate(true)
	var earlier: Dictionary = _frames[later_idx - 1]
	var later: Dictionary = _frames[later_idx]
	var from_tick := float(earlier["tick"])
	var to_tick := float(later["tick"])
	var span := to_tick - from_tick
	var t := 0.0 if span <= 0.0 else clampf((render_tick - from_tick) / span, 0.0, 1.0)
	var from_poses: Dictionary = earlier["poses"]
	var to_poses: Dictionary = later["poses"]
	var mixed: Dictionary = {}
	for id in to_poses.keys():
		var to_pos: Vector2 = to_poses[id]
		if from_poses.has(id):
			mixed[id] = (from_poses[id] as Vector2).lerp(to_pos, t)
		else:
			mixed[id] = to_pos
	return mixed


func render_tick() -> float:
	if _frames.is_empty():
		return 0.0
	var latest := float(latest_tick())
	var tick_dt := 1.0 / MatchProtocol.SNAPSHOT_RATE_HZ
	var estimated := latest + _since_latest_sec / tick_dt
	return clampf(estimated - INTERP_DELAY_TICKS, float(_frames[0]["tick"]), latest)
