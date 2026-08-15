class_name WorldAvatar
extends Node2D

## Shared presentation for zone entities. Visuals come from ContentRegistry IDs.

var server_id: String = ""
var display_name: String = ""
var kind: String = ""
var is_local: bool = false
var used_fallback: bool = false
var visual_id: String = ""
var interpolating: bool:
	get:
		return _interpolating

var _from: Vector2 = Vector2.ZERO
var _to: Vector2 = Vector2.ZERO
var _interp_t: float = 0.0
var _interp_duration: float = 0.1
var _interpolating: bool = false

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
	if p_local:
		_label.text = "%s (you)" % p_name
	modulate = Color.WHITE
	z_index = _z_for_kind(p_kind, p_local)


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
