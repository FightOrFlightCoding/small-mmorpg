class_name GrassFoundationPainter
extends RefCounted

## Deterministic grass ground/detail painter. Never runs per frame.

const TILE_SIZE: int = 64
const GROUND_SOURCE_ID: int = 0
const DETAIL_SOURCE_ID: int = 1
const DEFAULT_SEED: int = 18427
const NORMAL_DETAIL_DENSITY: float = 0.11
const STRESS_DETAIL_DENSITY: float = 0.28
const GROUND_WEIGHTS: Array[int] = [55, 18, 17, 10]
const DETAIL_WEIGHTS: Array[int] = [22, 20, 18, 12, 10, 10, 5, 3]
const TEST_MAP_SIZE: Vector2i = Vector2i(20, 12)
const TEST_NO_DETAIL_COLUMNS: int = 4
const TEST_STRESS_START_COLUMN: int = 16

const _PEERING: Array[int] = [
	TileSet.CELL_NEIGHBOR_RIGHT_SIDE,
	TileSet.CELL_NEIGHBOR_BOTTOM_RIGHT_CORNER,
	TileSet.CELL_NEIGHBOR_BOTTOM_SIDE,
	TileSet.CELL_NEIGHBOR_BOTTOM_LEFT_CORNER,
	TileSet.CELL_NEIGHBOR_LEFT_SIDE,
	TileSet.CELL_NEIGHBOR_TOP_LEFT_CORNER,
	TileSet.CELL_NEIGHBOR_TOP_SIDE,
	TileSet.CELL_NEIGHBOR_TOP_RIGHT_CORNER,
]


static func cell_hash(cell: Vector2i, seed: int, salt: int) -> int:
	var h: int = seed
	h = h * 374761393 + cell.x * 668265263
	h = h * 374761393 + cell.y * 1274126177
	h = h * 374761393 + salt
	h ^= h >> 13
	return absi(h)


static func ground_variant(cell: Vector2i, seed: int) -> int:
	var bucket: int = cell_hash(cell, seed, 1) % 100
	var acc: int = 0
	for i in GROUND_WEIGHTS.size():
		acc += GROUND_WEIGHTS[i]
		if bucket < acc:
			return i
	return 0


static func ground_atlas(cell: Vector2i, seed: int) -> Vector2i:
	return Vector2i(ground_variant(cell, seed), 0)


static func detail_variant(cell: Vector2i, seed: int) -> int:
	var bucket: int = cell_hash(cell, seed, 3) % 100
	var acc: int = 0
	for i in DETAIL_WEIGHTS.size():
		acc += DETAIL_WEIGHTS[i]
		if bucket < acc:
			return i
	return 0


static func detail_atlas(cell: Vector2i, seed: int) -> Vector2i:
	var variant: int = detail_variant(cell, seed)
	return Vector2i(variant % 4, int(variant / 4))


static func should_place_detail(cell: Vector2i, seed: int, density: float) -> bool:
	if density <= 0.0:
		return false
	var threshold: int = clampi(int(round(density * 100.0)), 0, 100)
	return (cell_hash(cell, seed, 2) % 100) < threshold


func paint_ground_rect(ground: TileMapLayer, rect: Rect2i, seed: int) -> void:
	for y in range(rect.position.y, rect.position.y + rect.size.y):
		for x in range(rect.position.x, rect.position.x + rect.size.x):
			var cell := Vector2i(x, y)
			ground.set_cell(cell, GROUND_SOURCE_ID, ground_atlas(cell, seed))


func paint_details_rect(ground: TileMapLayer, details: TileMapLayer, rect: Rect2i, seed: int, density: float) -> void:
	for y in range(rect.position.y, rect.position.y + rect.size.y):
		for x in range(rect.position.x, rect.position.x + rect.size.x):
			var cell := Vector2i(x, y)
			if ground.get_cell_source_id(cell) != GROUND_SOURCE_ID:
				details.erase_cell(cell)
				continue
			if not should_place_detail(cell, seed, density):
				details.erase_cell(cell)
				continue
			if _has_detail(details, cell + Vector2i.LEFT) and _has_detail(details, cell + Vector2i.UP):
				details.erase_cell(cell)
				continue
			details.set_cell(cell, DETAIL_SOURCE_ID, detail_atlas(cell, seed))


func paint_test_map(ground: TileMapLayer, details: TileMapLayer, seed: int = DEFAULT_SEED) -> void:
	var size: Vector2i = TEST_MAP_SIZE
	paint_ground_rect(ground, Rect2i(Vector2i.ZERO, size), seed)
	details.clear()
	for x in range(size.x):
		var density := 0.0
		if x >= TEST_STRESS_START_COLUMN:
			density = STRESS_DETAIL_DENSITY
		elif x >= TEST_NO_DETAIL_COLUMNS:
			density = NORMAL_DETAIL_DENSITY
		paint_details_rect(ground, details, Rect2i(Vector2i(x, 0), Vector2i(1, size.y)), seed, density)


func paint_world_rect(
	ground: TileMapLayer,
	details: TileMapLayer,
	pixel_size: Vector2,
	seed: int,
	density: float = NORMAL_DETAIL_DENSITY
) -> Vector2i:
	var cells := Vector2i(
		maxi(1, ceili(pixel_size.x / float(TILE_SIZE))),
		maxi(1, ceili(pixel_size.y / float(TILE_SIZE))),
	)
	paint_ground_rect(ground, Rect2i(Vector2i.ZERO, cells), seed)
	details.clear()
	paint_details_rect(ground, details, Rect2i(Vector2i.ZERO, cells), seed, density)
	return cells


static func seed_for_zone(zone_id: String) -> int:
	return DEFAULT_SEED ^ absi(zone_id.hash())


func clear_details_under_pixel_rect(details: TileMapLayer, rect: Rect2) -> void:
	if rect.size.x <= 0.0 or rect.size.y <= 0.0:
		return
	var start := Vector2i(floori(rect.position.x / float(TILE_SIZE)), floori(rect.position.y / float(TILE_SIZE)))
	var end := Vector2i(
		ceili((rect.position.x + rect.size.x) / float(TILE_SIZE)),
		ceili((rect.position.y + rect.size.y) / float(TILE_SIZE)),
	)
	clear_details_rect(details, Rect2i(start, end - start))


func clear_details_at(details: TileMapLayer, cell: Vector2i) -> void:
	details.erase_cell(cell)


func clear_details_rect(details: TileMapLayer, rect: Rect2i) -> void:
	for y in range(rect.position.y, rect.position.y + rect.size.y):
		for x in range(rect.position.x, rect.position.x + rect.size.x):
			details.erase_cell(Vector2i(x, y))


static func configure_layer(layer: TileMapLayer, tileset: TileSet) -> void:
	layer.tile_set = tileset
	layer.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	layer.y_sort_enabled = false
	layer.collision_enabled = false
	layer.navigation_enabled = false


static func peering_bits() -> Array[int]:
	return _PEERING


func _has_detail(details: TileMapLayer, cell: Vector2i) -> bool:
	return details.get_cell_source_id(cell) == DETAIL_SOURCE_ID
