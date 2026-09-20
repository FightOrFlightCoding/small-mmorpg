class_name GroundItemAvatar
extends WorldAvatar

## Presentation-only public ground item. The server owns range, pickup, and collision (none).

const CLICK_RADIUS := 48.0

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
	_resolve_nodes()
	if _label != null:
		_label.text = display_name if quantity <= 1 else "%s ×%s" % [display_name, str(quantity)]
		_label.visible = true
	if _fallback_label != null:
		_fallback_label.visible = false
	_pass_world_clicks()
	var texture := ItemPresentation.icon_texture(definition)
	if texture != null and _sprite != null:
		_sprite.texture = texture
		_sprite.visible = true
		if _body != null:
			_body.visible = false
	else:
		if _sprite != null:
			_sprite.visible = false
		if _body != null:
			_body.visible = true
			_body.color = ItemPresentation.fallback_color(definition)


func contains_world_point(world_pos: Vector2) -> bool:
	if world_pos.distance_to(global_position) <= CLICK_RADIUS:
		return true
	_resolve_nodes()
	if _label == null or not _label.visible:
		return false
	var local := to_local(world_pos)
	var rect := Rect2(_label.position, _label.size)
	if rect.size.x <= 1.0 or rect.size.y <= 1.0:
		rect = Rect2(Vector2(_label.offset_left, _label.offset_top), Vector2(_label.offset_right - _label.offset_left, _label.offset_bottom - _label.offset_top))
	return rect.has_point(local)


func tooltip_copy() -> String:
	return ItemPresentation.tooltip_text({"itemId": item_id, "quantity": quantity}, ItemPresentation.debug_tooltips_enabled())
