class_name CorpseAvatar
extends WorldAvatar

## Presentation-only corpse marker. The server owns range, loot, and collision (none).

const CLICK_RADIUS := 20.0


func contains_world_point(world_pos: Vector2) -> bool:
	return world_pos.distance_to(global_position) <= CLICK_RADIUS
