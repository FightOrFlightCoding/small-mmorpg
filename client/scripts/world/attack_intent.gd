class_name AttackIntent
extends RefCounted

## Client-side nearby enemy pick. Server range, cooldown, and damage are authoritative.


static func attack_range() -> float:
	var player: Dictionary = ContentRegistry.get_by_id("player.base")
	return float(player.get("attackRange", 40.0))


static func nearest_enemy_id(player_pos: Vector2, enemies: Array, range_px: float = -1.0) -> String:
	var limit := range_px
	if limit < 0.0:
		limit = attack_range()
	var best_id := ""
	var best_d := limit
	for entry in enemies:
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		var enemy: Dictionary = entry
		if enemy.has("alive") and not bool(enemy["alive"]):
			continue
		if int(enemy.get("health", 1)) <= 0:
			continue
		var enemy_id := String(enemy.get("id", enemy.get("enemyId", "")))
		if enemy_id.is_empty():
			continue
		var pos := Vector2(float(enemy.get("x", 0.0)), float(enemy.get("y", 0.0)))
		var distance := player_pos.distance_to(pos)
		if distance <= best_d:
			best_id = enemy_id
			best_d = distance
	return best_id
