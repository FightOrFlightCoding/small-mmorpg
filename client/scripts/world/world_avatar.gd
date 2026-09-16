class_name WorldAvatar
extends Node2D

## Shared presentation for zone entities. Visuals come from ContentRegistry IDs.

var server_id: String = ""
var display_name: String = ""
var kind: String = ""
var is_local: bool = false
var used_fallback: bool = false
var visual_id: String = ""
var direction_count: int = 4
var interpolating: bool:
	get:
		return _interpolating

var _from: Vector2 = Vector2.ZERO
var _to: Vector2 = Vector2.ZERO
var _interp_t: float = 0.0
var _interp_duration: float = 0.1
var _interpolating: bool = false
var _health: int = 0
var _max_health: int = 1
var _alive: bool = true
var _health_back: ColorRect
var _health_fill: ColorRect
var _visual_set: Dictionary = {}
var _facing: Vector2 = Vector2(0, 1)
var _anim_name: String = "idle"
var _anim_elapsed: float = 0.0
var _use_frames: bool = false

@onready var _sprite: Sprite2D = $Sprite
@onready var _body: Polygon2D = $Body
@onready var _label: Label = $NameLabel
@onready var _fallback_label: Label = $FallbackLabel
var _animated: AnimatedSprite2D
var _animated_base_offset: Vector2 = Vector2.ZERO


func configure(p_kind: String, p_server_id: String, p_name: String, visual: Dictionary, p_local: bool = false) -> void:
	kind = p_kind
	server_id = p_server_id
	display_name = p_name
	is_local = p_local
	visual_id = String(visual.get("visual_id", ""))
	used_fallback = bool(visual.get("missing", true))
	_visual_set = visual.get("visual_set", {}) if typeof(visual.get("visual_set", {})) == TYPE_DICTIONARY else {}
	direction_count = VisualSetMath.normalize_direction_count(int(visual.get("direction_count", _visual_set.get("directionCount", 4))))
	_use_frames = bool(_visual_set.get("useFrames", false))
	_anim_elapsed = 0.0
	_anim_name = "idle"
	_resolve_nodes()
	_apply_visual(visual)
	if p_kind == "player":
		_body.color = _tint_for_player(p_name, p_local)
	_label.text = p_name
	_fallback_label.visible = used_fallback
	if used_fallback:
		var missing_id := String(visual.get("missing_id", visual_id))
		if missing_id.is_empty():
			missing_id = String(_visual_set.get("id", "MISSING"))
		_fallback_label.text = missing_id
	if p_local:
		_label.text = "%s (you)" % p_name
	modulate = Color.WHITE
	z_index = _z_for_kind(p_kind, p_local)
	if p_kind == "player" or p_kind == "enemy":
		_ensure_health_bar()
		_layout_health_bar()


func set_vitals(health: int, max_health: int, alive: bool) -> void:
	_health = health
	_max_health = maxi(1, max_health)
	_alive = alive and health > 0
	if kind == "player" or kind == "enemy":
		_ensure_health_bar()
		_refresh_health_bar()
	if _alive:
		modulate = Color.WHITE
	else:
		modulate = Color(0.45, 0.45, 0.5, 0.7)


func set_move_vector(vector: Vector2) -> void:
	if vector.length_squared() > 0.0001:
		_facing = vector
		_anim_name = "walk"
	else:
		_anim_name = "idle"
	_sync_animated_sprite()


func _process(delta: float) -> void:
	if _animated != null and _animated.visible and _animated.sprite_frames != null:
		# Keep Godot AnimatedSprite2D advancing while the local/remote move vector says walk.
		# Snapshot pose updates must not call set_move_vector(ZERO) or this restarts every tick.
		if _anim_name == "walk" and not _animated.is_playing():
			_sync_animated_sprite()
		_update_side_walk_bob()
		return
	if not _use_frames or _sprite == null or not _sprite.visible or _sprite.texture == null:
		return
	_anim_elapsed += delta
	_apply_frame()


func set_server_position(x: float, y: float) -> void:
	_interpolating = false
	position = Vector2(x, y)


func interpolate_toward(target: Vector2, duration: float) -> void:
	if duration <= 0.0:
		set_server_position(target.x, target.y)
		return
	_from = position
	_to = target
	_interp_t = 0.0
	_interp_duration = duration
	_interpolating = true


func advance_interpolation(delta: float) -> void:
	if not _interpolating:
		return
	_interp_t += delta
	var t := clampf(_interp_t / _interp_duration, 0.0, 1.0)
	position = _from.lerp(_to, t)
	if t >= 1.0:
		_interpolating = false
		position = _to


func _apply_visual(visual: Dictionary) -> void:
	var color := Color(0.92, 0.22, 0.78, 1.0)
	if visual.get("fallback_color") is Color:
		color = visual["fallback_color"]
	_body.color = color
	var texture_path := String(visual.get("texture_path", ""))
	var showed_texture := false
	if not texture_path.is_empty():
		var texture: Texture2D = load(texture_path)
		if texture == null:
			used_fallback = true
			_fallback_label.visible = true
		else:
			_sprite.texture = texture
			_sprite.visible = true
			_body.visible = false
			showed_texture = true
			_apply_frame()
	if not showed_texture:
		_sprite.visible = false
		_body.visible = true
	if _apply_animated_sprite():
		_sprite.visible = false
		_body.visible = false


func _apply_frame() -> void:
	if not _use_frames or _sprite == null or _sprite.texture == null:
		return
	var frame_size: Variant = _visual_set.get("frameSize", [24, 24])
	if typeof(frame_size) != TYPE_ARRAY or (frame_size as Array).size() < 2:
		return
	var frame_w := int((frame_size as Array)[0])
	var frame_h := int((frame_size as Array)[1])
	if frame_w <= 0 or frame_h <= 0:
		return
	if _sprite.texture.get_width() < frame_w * 2 and _sprite.texture.get_height() < frame_h * 2:
		return
	var animations: Variant = _visual_set.get("animations", {})
	var anim: Dictionary = {}
	if typeof(animations) == TYPE_DICTIONARY and (animations as Dictionary).has(_anim_name):
		var row: Variant = (animations as Dictionary)[_anim_name]
		if typeof(row) == TYPE_DICTIONARY:
			anim = row
	var frame := VisualSetMath.frame_index(anim, _anim_elapsed)
	var dir := VisualSetMath.direction_index(_facing, direction_count)
	_sprite.region_enabled = true
	_sprite.region_rect = Rect2(frame * frame_w, dir * frame_h, frame_w, frame_h)


func _resolve_nodes() -> void:
	if _body == null:
		_body = $Body
	if _sprite == null:
		_sprite = $Sprite
	if _label == null:
		_label = $NameLabel
	if _fallback_label == null:
		_fallback_label = $FallbackLabel
	if _animated == null:
		_animated = get_node_or_null("AnimatedSprite2D") as AnimatedSprite2D


func _apply_animated_sprite() -> bool:
	if _animated == null:
		_animated = get_node_or_null("AnimatedSprite2D") as AnimatedSprite2D
	if _animated == null:
		return false
	var frames_path := String(_visual_set.get("spriteFramesPath", ""))
	if not frames_path.is_empty():
		if not ResourceLoader.exists(frames_path):
			push_warning("Missing asset id: %s — sprite frames." % frames_path)
			_animated.visible = false
			return false
		var loaded: SpriteFrames = load(frames_path) as SpriteFrames
		if loaded == null:
			_animated.visible = false
			return false
		_animated.sprite_frames = loaded
	if _animated.sprite_frames == null:
		_animated.visible = false
		return false
	var scale := float(_visual_set.get("displayScale", 0.375))
	if scale <= 0.0:
		scale = 0.375
	_animated.scale = Vector2(scale, scale)
	_animated_base_offset = _animated_offset(scale)
	_animated.offset = _animated_base_offset
	_animated.visible = true
	_sync_animated_sprite()
	return true


func _animated_offset(scale: float) -> Vector2:
	var authored: Variant = _visual_set.get("spriteOffset", null)
	if typeof(authored) == TYPE_ARRAY and (authored as Array).size() >= 2:
		return Vector2(float((authored as Array)[0]), float((authored as Array)[1]))
	var frame_size: Variant = _visual_set.get("frameSize", [192, 160])
	var foot: Variant = _visual_set.get("foot", [96, 150])
	var frame_h := 160.0
	if typeof(frame_size) == TYPE_ARRAY and (frame_size as Array).size() >= 2:
		frame_h = float((frame_size as Array)[1])
	var foot_y := frame_h
	if typeof(foot) == TYPE_ARRAY and (foot as Array).size() >= 2:
		foot_y = float((foot as Array)[1])
	var center_y := frame_h * 0.5
	return Vector2(0.0, 12.0 / scale - (foot_y - center_y))


func _walk_anim_name() -> StringName:
	var dir := VisualSetMath.direction_index(_facing, 4)
	match dir:
		0:
			return &"walk_right"
		1:
			return &"walk_down"
		2:
			return &"walk_left"
		3:
			return &"walk_up"
		_:
			return &"walk_down"


func _update_side_walk_bob() -> void:
	if _animated == null:
		return
	var anim := StringName(_animated.animation)
	var side := anim == &"walk_right" or anim == &"walk_left"
	if not side or _anim_name != "walk" or not _animated.is_playing():
		_animated.offset = _animated_base_offset
		return
	# Side art gathers feet under the body; keep offset stable (bob reads as strut).
	_animated.offset = _animated_base_offset


func _sync_animated_sprite() -> void:
	if _animated == null or _animated.sprite_frames == null or not _animated.visible:
		return
	var anim := _walk_anim_name()
	var flip_left := anim == &"walk_left"
	if not _animated.sprite_frames.has_animation(anim):
		if anim == &"walk_left" and _animated.sprite_frames.has_animation(&"walk_right"):
			anim = &"walk_right"
			flip_left = true
		else:
			return
	_animated.flip_h = flip_left
	# Match Godot 2D sprite animation docs: play while moving, stop when idle.
	if _anim_name == "walk":
		if _animated.animation != anim:
			_animated.play(anim)
		elif not _animated.is_playing():
			_animated.play(anim)
		return
	if _animated.is_playing():
		_animated.pause()
	if _animated.animation != anim:
		_animated.animation = anim
		_animated.frame = 0
		_animated.frame_progress = 0.0
	_animated.offset = _animated_base_offset


func _layout_health_bar() -> void:
	if _health_back == null:
		return
	var y := -18.0
	if _animated != null and _animated.visible:
		y = (_animated.offset.y - 80.0) * _animated.scale.y - 8.0
	_health_back.position = Vector2(-12.0, y)


func _z_for_kind(p_kind: String, p_local: bool) -> int:
	if p_kind == "loot":
		return 3
	if p_kind == "npc":
		return 4
	if p_kind == "enemy":
		return 5
	if p_kind == "player":
		return 7 if p_local else 6
	return 2


func _tint_for_player(p_name: String, p_local: bool) -> Color:
	var base := Color(0.24, 0.48, 0.84, 1.0)
	match p_name:
		"Alice":
			base = Color(0.24, 0.48, 0.84, 1.0)
		"Bob":
			base = Color(0.86, 0.42, 0.18, 1.0)
		_:
			var h := float(absi(p_name.hash()) % 360) / 360.0
			base = Color.from_hsv(h, 0.55, 0.92)
	if p_local:
		return base.lightened(0.08)
	return base


func _ensure_health_bar() -> void:
	if _health_back != null:
		return
	_health_back = ColorRect.new()
	_health_back.name = "HealthBack"
	_health_back.size = Vector2(24, 3)
	_health_back.position = Vector2(-12, -18)
	_health_back.color = Color(0.08, 0.08, 0.08, 0.8)
	_health_back.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_health_back)
	_layout_health_bar()
	_health_fill = ColorRect.new()
	_health_fill.name = "HealthFill"
	_health_fill.size = Vector2(24, 3)
	_health_fill.position = Vector2.ZERO
	_health_fill.color = Color(0.28, 0.78, 0.32, 1)
	_health_fill.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_health_back.add_child(_health_fill)


func _refresh_health_bar() -> void:
	if _health_back == null or _health_fill == null:
		return
	_health_back.visible = true
	var ratio := clampf(float(_health) / float(_max_health), 0.0, 1.0)
	_health_fill.size = Vector2(24.0 * ratio, 3.0)
	if kind == "enemy":
		_health_fill.color = Color(0.86, 0.28, 0.22, 1)
	elif is_local:
		_health_fill.color = Color(0.32, 0.82, 0.38, 1)
	else:
		_health_fill.color = Color(0.28, 0.62, 0.9, 1)
