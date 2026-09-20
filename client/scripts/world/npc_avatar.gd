class_name NpcAvatar
extends WorldAvatar

## Presentation-only interaction affordance. Server distance remains authoritative.
## Cosmetic pose comes from a server movement plan interpolated against match ticks.

const TICK_RATE_HZ := 10.0

@onready var _interaction_shape: CollisionShape2D = $InteractionArea/InteractionShape
@onready var _interaction_area: Area2D = $InteractionArea
@onready var _marker_anchor: Node2D = $MarkerAnchor
@onready var _marker_label: Label = $MarkerAnchor/MarkerLabel

var _plan: Dictionary = {}
var _revision: int = 0
var _clock_tick: float = 0.0
var _has_plan: bool = false


func _ready() -> void:
	_apply_placeholder()
	_apply_interaction_radius(server_id)


func configure(p_kind: String, p_server_id: String, p_name: String, visual: Dictionary, p_local: bool = false) -> void:
	super.configure(p_kind, p_server_id, p_name, visual, p_local)
	_apply_placeholder()
	_apply_interaction_radius(p_server_id)


func apply_catalog_id(npc_id: String) -> void:
	_apply_interaction_radius(npc_id)


func marker_anchor() -> Node2D:
	if _marker_anchor == null:
		_marker_anchor = get_node_or_null("MarkerAnchor") as Node2D
	return _marker_anchor


func set_quest_marker(glyph: String) -> void:
	if _marker_label == null:
		_marker_label = get_node_or_null("MarkerAnchor/MarkerLabel") as Label
	if _marker_label == null:
		return
	_marker_label.text = glyph
	_marker_label.visible = not glyph.is_empty()


func contains_world_point(world_pos: Vector2) -> bool:
	return world_pos.distance_to(global_position) <= interaction_radius()


func interaction_radius() -> float:
	if _interaction_shape == null:
		_interaction_shape = get_node_or_null("InteractionArea/InteractionShape") as CollisionShape2D
	if _interaction_shape == null:
		return InteractIntent.interaction_range()
	var circle := _interaction_shape.shape as CircleShape2D
	if circle == null:
		return InteractIntent.interaction_range()
	return circle.radius


func has_movement_plan() -> bool:
	return _has_plan


func movement_revision() -> int:
	return _revision


func apply_movement_plan(plan: Dictionary, server_tick: float, force: bool = false) -> bool:
	var incoming := int(plan.get("revision", 0))
	if not force and _has_plan and incoming <= _revision:
		return false
	_plan = plan.duplicate(true)
	_revision = incoming
	_clock_tick = server_tick
	_has_plan = true
	var pose := interpolated_pose(_plan, _clock_tick)
	set_move_vector(pose - position)
	position = pose
	return true


func apply_server_npc(record: Dictionary, server_tick: float, force: bool = false) -> void:
	var plan: Variant = record.get("movement", {})
	if typeof(plan) == TYPE_DICTIONARY and not (plan as Dictionary).is_empty():
		apply_movement_plan(plan as Dictionary, server_tick, force)
		return
	_has_plan = false
	set_server_position(float(record.get("x", 0.0)), float(record.get("y", 0.0)))


func advance_interpolation(delta: float) -> void:
	if not _has_plan:
		super.advance_interpolation(delta)
		return
	_clock_tick += delta * TICK_RATE_HZ
	var pose := interpolated_pose(_plan, _clock_tick)
	set_move_vector(pose - position)
	position = pose


static func interpolated_pose(plan: Dictionary, tick: float) -> Vector2:
	var phase := String(plan.get("phase", "idle"))
	var start := Vector2(float(plan.get("startX", 0.0)), float(plan.get("startY", 0.0)))
	var finish := Vector2(float(plan.get("endX", start.x)), float(plan.get("endY", start.y)))
	var start_tick := float(plan.get("startTick", 0.0))
	var end_tick := float(plan.get("endTick", 0.0))
	if phase == "moving" and end_tick > start_tick and tick < end_tick:
		if tick <= start_tick:
			return start
		var t := (tick - start_tick) / (end_tick - start_tick)
		return start.lerp(finish, t)
	if phase == "moving" and tick >= end_tick:
		return finish
	return start


func _apply_placeholder() -> void:
	_resolve_nodes()
	if _sprite != null:
		_sprite.visible = false
	var animated := get_node_or_null("AnimatedSprite2D") as AnimatedSprite2D
	if animated != null:
		animated.visible = false
	if _body != null:
		_body.visible = true
	if _interaction_area == null:
		_interaction_area = get_node_or_null("InteractionArea") as Area2D
	if _interaction_area != null:
		_interaction_area.monitoring = false
		_interaction_area.monitorable = false
		_interaction_area.input_pickable = false
		_interaction_area.collision_layer = 0
		_interaction_area.collision_mask = 0
	if _interaction_shape == null:
		_interaction_shape = get_node_or_null("InteractionArea/InteractionShape") as CollisionShape2D
	if _interaction_shape != null:
		_interaction_shape.disabled = true


func _apply_interaction_radius(npc_id: String) -> void:
	if _interaction_shape == null:
		_interaction_shape = get_node_or_null("InteractionArea/InteractionShape") as CollisionShape2D
	if _interaction_shape == null:
		return
	var radius := InteractIntent.interaction_range()
	if not npc_id.is_empty():
		var definition: Dictionary = ContentRegistry.get_by_id(npc_id)
		if not definition.is_empty() and definition.has("interactionRange"):
			radius = float(definition.get("interactionRange", radius))
	var circle := _interaction_shape.shape as CircleShape2D
	if circle == null:
		circle = CircleShape2D.new()
		_interaction_shape.shape = circle
	circle.radius = radius
