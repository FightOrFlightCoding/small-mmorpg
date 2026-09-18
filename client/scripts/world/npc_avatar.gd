class_name NpcAvatar
extends WorldAvatar

## Presentation-only interaction affordance. Server distance remains authoritative.

@onready var _interaction_shape: CollisionShape2D = $InteractionArea/InteractionShape
@onready var _interaction_area: Area2D = $InteractionArea
@onready var _marker_anchor: Node2D = $MarkerAnchor


func _ready() -> void:
	_apply_placeholder()
	_apply_interaction_radius(server_id)


func configure(p_kind: String, p_server_id: String, p_name: String, visual: Dictionary, p_local: bool = false) -> void:
	super.configure(p_kind, p_server_id, p_name, visual, p_local)
	_apply_placeholder()
	_apply_interaction_radius(p_server_id)


func marker_anchor() -> Node2D:
	if _marker_anchor == null:
		_marker_anchor = get_node_or_null("MarkerAnchor") as Node2D
	return _marker_anchor


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
		_interaction_area.input_pickable = true
		_interaction_area.collision_mask = 0


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
