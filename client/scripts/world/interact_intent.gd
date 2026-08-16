class_name InteractIntent
extends RefCounted

## Client-side nearby NPC pick. Server distance is authoritative.


static func interaction_range() -> float:
	var player: Dictionary = ContentRegistry.get_by_id("player.base")
	return float(player.get("interactionRange", 48.0))


static func nearest_npc_id(player_pos: Vector2, npcs: Array, range_px: float = -1.0) -> String:
	var limit := range_px
	if limit < 0.0:
		limit = interaction_range()
	var best_id := ""
	var best_d := limit
	for entry in npcs:
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		var npc: Dictionary = entry
		var npc_id := String(npc.get("id", npc.get("npcId", "")))
		if npc_id.is_empty():
			continue
		var pos := Vector2(float(npc.get("x", 0.0)), float(npc.get("y", 0.0)))
		var distance := player_pos.distance_to(pos)
		if distance <= best_d:
			best_id = npc_id
			best_d = distance
	return best_id
