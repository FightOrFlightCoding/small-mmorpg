class_name ResidentialHouse2D
extends Node2D

## Static residential exterior. No per-frame logic.

const ASSET_ORIGIN := Vector2(256, 400)

@export var house_id: String = ""
@export var exterior_texture: Texture2D
@export var shadow_texture: Texture2D

var building_id: String = ""
var entrance_id: String = "front"
var future_interior_id: Variant = null

@onready var _shadow: Sprite2D = $Shadow
@onready var _exterior: Sprite2D = $Exterior
@onready var _collision: CollisionPolygon2D = $SolidBody/BuildingCollision
@onready var _door_area: Area2D = $DoorArea
@onready var _door_shape: CollisionShape2D = $DoorArea/DoorShape
@onready var _entrance: Marker2D = $EntranceMarker
@onready var _sort: Marker2D = $SortOriginMarker
@onready var _debug: Node2D = $DebugFootprint


func _ready() -> void:
	texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	y_sort_enabled = false
	z_index = ResidentialHousePlacer.SORT_Z
	if not house_id.is_empty():
		apply_definition(ResidentialHousePlacer.definition_for(house_id))


func apply_definition(definition: Dictionary) -> void:
	if definition.is_empty():
		return
	building_id = String(definition.get("house_id", house_id))
	house_id = building_id
	future_interior_id = definition.get("future_interior_id", null)
	var ext_path := String(definition.get("exterior_texture_path", ""))
	var sh_path := String(definition.get("shadow_texture_path", ""))
	if not ext_path.is_empty() and ResourceLoader.exists(ext_path):
		exterior_texture = load(ext_path)
	if not sh_path.is_empty() and ResourceLoader.exists(sh_path):
		shadow_texture = load(sh_path)
	_configure_sprites()
	_configure_collision(definition.get("footprint_polygon", []))
	_configure_door(definition.get("door_area_local", []))
	_configure_markers(definition)
	_door_area.set_meta("building_id", building_id)
	_door_area.set_meta("entrance_id", entrance_id)
	_door_area.set_meta("future_interior_id", future_interior_id)


func _configure_sprites() -> void:
	if _shadow != null:
		_shadow.texture = shadow_texture
		_shadow.centered = false
		_shadow.position = -ASSET_ORIGIN
		_shadow.z_index = -1
		_shadow.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
		_shadow.y_sort_enabled = false
	if _exterior != null:
		_exterior.texture = exterior_texture
		_exterior.centered = false
		_exterior.position = -ASSET_ORIGIN
		_exterior.z_index = 0
		_exterior.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST


func _configure_collision(poly: Variant) -> void:
	if _collision == null or typeof(poly) != TYPE_ARRAY:
		return
	var points := PackedVector2Array()
	for entry in poly:
		if typeof(entry) != TYPE_ARRAY or (entry as Array).size() < 2:
			continue
		points.append(Vector2(float((entry as Array)[0]), float((entry as Array)[1])))
	if points.size() >= 3:
		_collision.polygon = points


func _configure_door(area: Variant) -> void:
	if _door_area == null or _door_shape == null or typeof(area) != TYPE_ARRAY:
		return
	var values: Array = area
	if values.size() < 4:
		return
	var cx := float(values[0])
	var cy := float(values[1])
	var w := float(values[2])
	var h := float(values[3])
	_door_area.position = Vector2(cx, cy + h * 0.5)
	var rect := RectangleShape2D.new()
	rect.size = Vector2(w, h)
	_door_shape.shape = rect
	_door_area.monitoring = true
	_door_area.monitorable = true


func _configure_markers(definition: Dictionary) -> void:
	var entrance: Variant = definition.get("entrance_marker_local_position", [0, 18])
	if typeof(entrance) == TYPE_ARRAY and (entrance as Array).size() >= 2:
		_entrance.position = Vector2(float((entrance as Array)[0]), float((entrance as Array)[1]))
	_sort.position = Vector2.ZERO
	if _debug != null:
		_debug.visible = false
