class_name PickupIntent
extends RefCounted

## Client-side nearby loot pick. Server range and inventory are authoritative.


static func pickup_range() -> float:
	var player: Dictionary = ContentRegistry.get_by_id("player.base")
	return float(player.get("pickupRange", 40.0))


static func nearest_loot_id(player_pos: Vector2, loot: Array, range_px: float = -1.0) -> String:
	return nearest_entity_id(player_pos, loot, "id", range_px)


static func nearest_ground_entity_id(player_pos: Vector2, items: Array, range_px: float = -1.0) -> String:
	return nearest_entity_id(player_pos, items, "groundEntityId", range_px)


static func nearest_entity_id(player_pos: Vector2, records: Array, id_key: String, range_px: float = -1.0) -> String:
	var limit := range_px
	if limit < 0.0:
		limit = pickup_range()
	var best_id := ""
	var best_d := limit
	for entry in records:
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		var entity: Dictionary = entry
		var entity_id := String(entity.get(id_key, entity.get("id", "")))
		if entity_id.is_empty():
			continue
		var pos := Vector2(float(entity.get("x", 0.0)), float(entity.get("y", 0.0)))
		var distance := player_pos.distance_to(pos)
		if distance <= best_d:
			best_id = entity_id
			best_d = distance
	return best_id


static func entity_pos(entity_id: String, records: Array, id_key: String = "id") -> Vector2:
	if entity_id.is_empty():
		return Vector2.INF
	for entry in records:
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		var entity: Dictionary = entry
		var found := String(entity.get(id_key, entity.get("id", "")))
		if found != entity_id:
			continue
		return Vector2(float(entity.get("x", 0.0)), float(entity.get("y", 0.0)))
	return Vector2.INF
