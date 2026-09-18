class_name InteractIntent
extends RefCounted

## Client-side nearby NPC pick. Server distance is authoritative.


static func interaction_range() -> float:
	var player: Dictionary = ContentRegistry.get_by_id("player.base")
	return float(player.get("interactionRange", 48.0))


static func nearest_npc_id(player_pos: Vector2, npcs: Array, range_px: float = -1.0) -> String:
	var fallback := range_px
	if fallback < 0.0:
		fallback = interaction_range()
	var best_id := ""
	var best_d := fallback
	for entry in npcs:
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		var npc: Dictionary = entry
		var npc_id := String(npc.get("id", npc.get("npcId", "")))
		if npc_id.is_empty():
			continue
		var pos := Vector2(float(npc.get("x", 0.0)), float(npc.get("y", 0.0)))
		var distance := player_pos.distance_to(pos)
		var limit := _range_for_npc(npc_id, fallback)
		if distance <= limit and distance <= best_d:
			best_id = npc_id
			best_d = distance
	return best_id


static func npc_id_at(click_pos: Vector2, player_pos: Vector2, npcs: Array, click_radius_px: float = -1.0) -> String:
	var fallback := interaction_range()
	var best_id := ""
	var best_d := INF
	for entry in npcs:
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		var npc: Dictionary = entry
		var npc_id := String(npc.get("id", npc.get("npcId", "")))
		if npc_id.is_empty():
			continue
		var pos := Vector2(float(npc.get("x", 0.0)), float(npc.get("y", 0.0)))
		var limit := _range_for_npc(npc_id, fallback)
		var click_limit := limit
		if click_radius_px >= 0.0:
			click_limit = click_radius_px
		var click_distance := click_pos.distance_to(pos)
		if click_distance > click_limit:
			continue
		if player_pos.distance_to(pos) > limit:
			continue
		if click_distance <= best_d:
			best_id = npc_id
			best_d = click_distance
	return best_id


static func _range_for_npc(npc_id: String, fallback: float) -> float:
	var definition: Dictionary = ContentRegistry.get_by_id(npc_id)
	if definition.is_empty():
		return fallback
	if not definition.has("interactionRange"):
		return fallback
	return float(definition.get("interactionRange", fallback))
