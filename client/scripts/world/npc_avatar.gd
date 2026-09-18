class_name NpcAvatar
extends WorldAvatar

## Presentation-only interaction affordance. Server distance remains authoritative.

@onready var _interaction_shape: CollisionShape2D = $InteractionArea/InteractionShape


func _ready() -> void:
	_apply_interaction_radius(server_id)


func configure(p_kind: String, p_server_id: String, p_name: String, visual: Dictionary, p_local: bool = false) -> void:
	super.configure(p_kind, p_server_id, p_name, visual, p_local)
	_apply_interaction_radius(p_server_id)


func _apply_interaction_radius(npc_id: String) -> void:
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
