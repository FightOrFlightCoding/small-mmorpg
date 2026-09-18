extends GdUnitTestSuite

## Residential house assets, scenes, placement, and starter-map integration.


func before_test() -> void:
	SceneRouter.reset_for_tests()
	AppState.reset_for_tests()
	assert_bool(ContentRegistry.load_bundle()).is_true()


func test_twelve_production_pngs_match_pixel_contract() -> void:
	for index in range(1, 7):
		var id := "%02d" % index
		_assert_exterior("res://assets/world/buildings/residential/res_house_%s_exterior.png" % id)
		_assert_shadow("res://assets/world/buildings/residential/res_house_%s_shadow.png" % id)


func test_house_scenes_and_stable_ids_are_unique() -> void:
	var ids: Dictionary = {}
	var manifest: Dictionary = ResidentialHousePlacer.load_manifest()
	var houses: Array = ResidentialHousePlacer.houses(manifest)
	assert_int(houses.size()).is_equal(6)
	for entry in houses:
		var row: Dictionary = entry
		var house_id := String(row.get("house_id", ""))
		assert_bool(ids.has(house_id)).is_false()
		ids[house_id] = true
		var scene: PackedScene = load(String(row.get("scene_path", "")))
		assert_object(scene).is_not_null()
		var node: ResidentialHouse2D = auto_free(scene.instantiate()) as ResidentialHouse2D
		add_child(node)
		await get_tree().process_frame
		assert_str(node.house_id).is_equal(house_id)
		assert_object(node.get_node_or_null("EntranceMarker")).is_not_null()
		assert_object(node.get_node_or_null("DoorArea")).is_not_null()
		assert_object(node.get_node_or_null("SolidBody/BuildingCollision")).is_not_null()
		var collision: CollisionPolygon2D = node.get_node("SolidBody/BuildingCollision")
		assert_int(collision.polygon.size()).is_greater_equal(3)
	assert_bool(ids.has("residence_01")).is_true()
	assert_bool(ids.has("residence_06")).is_true()


func test_houses_are_off_major_roads_and_reserved_lots() -> void:
	var painter := VillageRoadPainter.new()
	var plan: Dictionary = painter.load_plan()
	var occupied: Dictionary = {}
	for entry in plan.get("cells", []):
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		if int(entry.get("mask", 0)) == 15:
			occupied[Vector2i(int(entry.get("x", 0)), int(entry.get("y", 0)))] = true
	for rect in ResidentialHousePlacer.house_collision_rects():
		var start := Vector2i(floori(rect.position.x / 64.0), floori(rect.position.y / 64.0))
		var end := Vector2i(
			floori((rect.position.x + rect.size.x - 1.0) / 64.0),
			floori((rect.position.y + rect.size.y - 1.0) / 64.0),
		)
		for y in range(start.y, end.y + 1):
			for x in range(start.x, end.x + 1):
				assert_bool(occupied.has(Vector2i(x, y))).is_false()
	var reserved: PackedStringArray = PackedStringArray(
		ResidentialHousePlacer.load_manifest().get("reserved_special_building_zones_checked", [])
	)
	assert_bool(reserved.has("village_hall")).is_true()
	assert_bool(reserved.has("blacksmith")).is_true()
	assert_bool(reserved.has("stables_inn")).is_true()
	assert_bool(reserved.has("general_store")).is_true()


func test_every_entrance_path_reaches_a_road() -> void:
	var painter := VillageRoadPainter.new()
	var plan: Dictionary = painter.load_plan()
	var occupied: Dictionary = {}
	for entry in plan.get("cells", []):
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		if int(entry.get("mask", 0)) == 15:
			occupied[Vector2i(int(entry.get("x", 0)), int(entry.get("y", 0)))] = true
	for extra in ResidentialHousePlacer.access_path_cells():
		occupied[extra] = true
	for row in ResidentialHousePlacer.houses():
		var house: Dictionary = row
		var cells: Variant = house.get("entrance_path_cells", [])
		assert_int((cells as Array).size()).is_greater(0)
		var connected := false
		for entry in cells:
			var cell := Vector2i(int(entry.get("x", 0)), int(entry.get("y", 0)))
			if occupied.has(cell):
				connected = true
				break
		assert_bool(connected).is_true()
		assert_int(int(house.get("entrance_path_length_tiles", 99))).is_less_equal(6)


func test_zone_view_keeps_visual_collision_count_and_places_houses() -> void:
	var zone_view: ZoneView = auto_free(ZoneView.new())
	add_child(zone_view)
	zone_view.render_zone(ContentRegistry.get_by_id("zone.starter"))
	assert_int(zone_view.collision_count()).is_equal(6)
	var registry: EntityRegistry = auto_free(EntityRegistry.new())
	add_child(registry)
	ResidentialHousePlacer.sync_into(registry)
	assert_object(registry.get_node_or_null("residence_01")).is_not_null()
	assert_object(registry.get_node_or_null("residence_06")).is_not_null()
	ResidentialHousePlacer.sync_into(registry)
	var count := 0
	for child in registry.get_children():
		if String(child.name).begins_with("residence_"):
			count += 1
	assert_int(count).is_equal(6)
	var collisions: Variant = ContentRegistry.get_by_id("zone.starter").get("collisions", [])
	assert_int((collisions as Array).size()).is_equal(12)


func test_neighbor_gaps_and_reserved_lots_are_recorded() -> void:
	var manifest: Dictionary = ResidentialHousePlacer.load_manifest()
	for entry in ResidentialHousePlacer.houses(manifest):
		var house: Dictionary = entry
		assert_float(float(house.get("neighbor_gap_tiles", 0.0))).is_greater_equal(2.0)
		assert_int(int(house.get("entrance_path_length_tiles", 99))).is_less_equal(6)
		assert_object(house.get("future_interior_id")).is_null()
		assert_object(house.get("resident_assignment")).is_null()
	var reserved: PackedStringArray = PackedStringArray(manifest.get("reserved_special_building_zones_checked", []))
	assert_bool(reserved.has("village_square_monument")).is_true()
	assert_bool(reserved.has("watermill")).is_true()
	assert_bool(reserved.has("barn_livestock")).is_true()


func _assert_exterior(path: String) -> void:
	var image := _load_image(path)
	assert_int(image.get_width()).is_equal(512)
	assert_int(image.get_height()).is_equal(448)
	var opaque := 0
	var bad := 0
	for y in image.get_height():
		for x in image.get_width():
			var pixel: Color = image.get_pixel(x, y)
			var alpha := int(round(pixel.a * 255.0))
			if alpha != 0 and alpha != 255:
				bad += 1
				continue
			if alpha == 0:
				if pixel.r != 0.0 or pixel.g != 0.0 or pixel.b != 0.0:
					bad += 1
			else:
				opaque += 1
				if x < 16 or y < 16 or x >= 496 or y >= 432:
					bad += 1
	assert_int(bad).is_equal(0)
	assert_int(opaque).is_greater(8000)


func _assert_shadow(path: String) -> void:
	var image := _load_image(path)
	assert_int(image.get_width()).is_equal(512)
	assert_int(image.get_height()).is_equal(448)
	var shaded := 0
	var bad := 0
	for y in image.get_height():
		for x in image.get_width():
			var pixel: Color = image.get_pixel(x, y)
			var alpha := int(round(pixel.a * 255.0))
			if alpha != 0 and alpha != 96:
				bad += 1
				continue
			if alpha == 0:
				if pixel.r != 0.0 or pixel.g != 0.0 or pixel.b != 0.0:
					bad += 1
			else:
				shaded += 1
	assert_int(bad).is_equal(0)
	assert_int(shaded).is_greater(400)
	var loaded: Texture2D = load(path)
	assert_object(loaded).is_not_null()


func _load_image(path: String) -> Image:
	var texture: Texture2D = load(path)
	assert_object(texture).is_not_null()
	var image: Image = texture.get_image()
	assert_object(image).is_not_null()
	return image
