extends SceneTree

## Editor/headless applicator for baked village-road cells. Idempotent.

const PLAN_PATH := "res://data/world/maps/village_road_plan.json"
const TILESET_PATH := "res://resources/world/terrain/grass_foundation_tileset.tres"


func _init() -> void:
	var painter := VillageRoadPainter.new()
	var plan: Dictionary = painter.load_plan(PLAN_PATH)
	if plan.is_empty():
		push_error("village road plan missing")
		quit(1)
		return
	var tileset: TileSet = load(TILESET_PATH)
	if tileset == null:
		push_error("shared terrain tileset missing")
		quit(1)
		return
	if tileset.get_source_count() < 3:
		push_error("road atlas source missing; rebuild grass_foundation_tileset")
		quit(1)
		return
	var connectivity: Dictionary = plan.get("connectivity", {})
	if not bool(connectivity.get("ok", false)):
		push_error("village road connectivity is not ok")
		quit(1)
		return
	var spawn: Dictionary = plan.get("spawn", {})
	print("VILLAGE_ROADS_OK source=%s terrain_set=%s spawn=%s cells=%s" % [
		str(int(plan.get("atlas_source_id", 2))),
		str(int(plan.get("terrain_set_id", 1))),
		str(spawn.get("pixel", [])),
		str((plan.get("cells", []) as Array).size()),
	])
	quit(0)
