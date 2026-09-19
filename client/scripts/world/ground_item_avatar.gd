class_name GroundItemAvatar
extends WorldAvatar

## Presentation-only public ground item. The server owns range, pickup, and collision (none).

const CLICK_RADIUS := 16.0

var rarity_label: String = ""
var item_id: String = ""
var quantity: int = 1


func apply_ground_item(record: Dictionary) -> void:
	item_id = String(record.get("itemId", ""))
	quantity = int(record.get("quantity", 1))
	var definition: Dictionary = ItemPresentation.definition_for(item_id)
	rarity_label = ItemPresentation.rarity_label(definition)
	var named := ItemPresentation.display_name({"itemId": item_id}, definition)
	display_name = named if rarity_label.is_empty() else "%s %s" % [rarity_label, named]
	if _label != null:
		_label.text = display_name if quantity <= 1 else "%s ×%s" % [display_name, str(quantity)]
	if _body != null:
		_body.color = ItemPresentation.rarity_color(definition)


func contains_world_point(world_pos: Vector2) -> bool:
	return world_pos.distance_to(global_position) <= CLICK_RADIUS


func tooltip_copy() -> String:
	return ItemPresentation.tooltip_text({"itemId": item_id, "quantity": quantity}, ItemPresentation.debug_tooltips_enabled())
