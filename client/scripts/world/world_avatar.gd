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
	if _body == null:
		_body = $Body
	if _sprite == null:
		_sprite = $Sprite
	if _label == null:
		_label = $NameLabel
	if _fallback_label == null:
		_fallback_label = $FallbackLabel
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


func _process(delta: float) -> void:
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
	if texture_path.is_empty():
		_sprite.visible = false
		_body.visible = true
		return
	var texture: Texture2D = load(texture_path)
	if texture == null:
		used_fallback = true
		_sprite.visible = false
		_body.visible = true
		_fallback_label.visible = true
		return
	_sprite.texture = texture
	_sprite.visible = true
	_body.visible = false
	_apply_frame()


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
