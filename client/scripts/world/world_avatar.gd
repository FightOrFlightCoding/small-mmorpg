class_name WorldAvatar
extends Node2D

## Shared presentation for zone entities. Visuals come from ContentRegistry IDs.

var server_id: String = ""
var display_name: String = ""
var kind: String = ""
var is_local: bool = false
var used_fallback: bool = false
var visual_id: String = ""

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
	_label.text = p_name
	_fallback_label.visible = used_fallback
	if p_local:
		_label.text = "%s (you)" % p_name
		modulate = Color(1.12, 1.12, 1.18, 1.0)
	z_index = _z_for_kind(p_kind, p_local)


func set_server_position(x: float, y: float) -> void:
	position = Vector2(x, y)


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
