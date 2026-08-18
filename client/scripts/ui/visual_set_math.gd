class_name VisualSetMath
extends RefCounted

## Direction and frame math for authored visual sets. 4-dir vs 8-dir is data, not scattered renderer code.


static func normalize_direction_count(direction_count: int) -> int:
	if direction_count >= 8:
		return 8
	return 4


static func direction_index(facing: Vector2, direction_count: int) -> int:
	var count := normalize_direction_count(direction_count)
	if facing.length_squared() <= 0.0001:
		return 0
	var angle := facing.angle()
	if count == 8:
		var octant := int(round(angle / (PI * 0.25)))
		return posmod(octant, 8)
	var quarter := int(round(angle / (PI * 0.5)))
	return posmod(quarter, 4)


static func frame_index(anim: Dictionary, elapsed_sec: float) -> int:
	var start := 0
	var finish := 0
	var frames: Variant = anim.get("frames", null)
	if typeof(frames) == TYPE_ARRAY and (frames as Array).size() >= 2:
		start = int((frames as Array)[0])
		finish = int((frames as Array)[1])
	else:
		start = int(anim.get("start", 0))
		finish = int(anim.get("end", start))
	if finish < start:
		return start
	var fps := maxf(float(anim.get("fps", 1.0)), 0.01)
	var span := finish - start + 1
	var raw := int(floor(elapsed_sec * fps))
	if bool(anim.get("loop", true)):
		return start + posmod(raw, span)
	return mini(start + raw, finish)


static func validate_set(data: Dictionary) -> PackedStringArray:
	var errors := PackedStringArray()
	var set_id := String(data.get("id", data.get("setId", "")))
	var directions := int(data.get("directionCount", 0))
	if directions != 4 and directions != 8:
		errors.append("%s: directionCount must be 4 or 8" % set_id)
	var frame_size: Variant = data.get("frameSize", [0, 0])
	if typeof(frame_size) != TYPE_ARRAY or (frame_size as Array).size() < 2 or int((frame_size as Array)[0]) <= 0 or int((frame_size as Array)[1]) <= 0:
		errors.append("%s: frameSize must be positive" % set_id)
	if String(data.get("spriteVisualId", "")).is_empty():
		errors.append("%s: spriteVisualId is required" % set_id)
	var animations: Variant = data.get("animations", {})
	if typeof(animations) != TYPE_DICTIONARY or (animations as Dictionary).is_empty():
		errors.append("%s: animations are required" % set_id)
	else:
		for anim_name in (animations as Dictionary).keys():
			var anim: Variant = (animations as Dictionary)[anim_name]
			if typeof(anim) != TYPE_DICTIONARY:
				errors.append("%s.%s: animation must be an object" % [set_id, String(anim_name)])
				continue
			var frames: Variant = (anim as Dictionary).get("frames", [])
			if typeof(frames) != TYPE_ARRAY or (frames as Array).size() < 2:
				errors.append("%s.%s: frames must be [start, end]" % [set_id, String(anim_name)])
				continue
			if int((frames as Array)[1]) < int((frames as Array)[0]):
				errors.append("%s.%s: frame range is inverted" % [set_id, String(anim_name)])
			if float((anim as Dictionary).get("fps", 0.0)) <= 0.0:
				errors.append("%s.%s: fps must be positive" % [set_id, String(anim_name)])
	return errors
