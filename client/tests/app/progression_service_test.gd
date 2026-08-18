extends GdUnitTestSuite

## Progression mirror, allocate intent, and server overwrite of previews.


func before_test() -> void:
	SceneRouter.reset_for_tests()
	AppState.reset_for_tests()
	NetworkService.reset_for_tests()
	ProgressionService.reset_for_tests()
	AbilityService.reset_for_tests()


func test_allocate_uses_allocate_opcode_without_xp_amount() -> void:
	var fake := FakeNetworkBackend.new()
	NetworkService.backend = fake
	NetworkService.match_id = "match-starter-shared"
	ProgressionService.unspent_attribute_points = 2
	ProgressionService.base_attributes = {"attr.one": 1}
	ProgressionService.allocated_attributes = {"attr.one": 0}
	var request_id := ProgressionService.request_allocate("attr.one", 1)
	await get_tree().process_frame
	assert_str(request_id).is_not_empty()
	assert_int(fake.last_send_opcode).is_equal(MatchProtocol.CLIENT_ALLOCATE_ATTRIBUTES)
	var payload: Dictionary = JSON.parse_string(fake.last_send_payload)
	assert_str(String(payload.get("attributeId", ""))).is_equal("attr.one")
	assert_int(int(payload.get("amount", 0))).is_equal(1)
	assert_str(String(payload.get("requestId", ""))).is_equal(request_id)
	assert_bool(payload.has("xp")).is_false()
	assert_bool(payload.has("currentXp")).is_false()
	assert_bool(payload.has("level")).is_false()
	assert_int(ProgressionService.unspent_attribute_points).is_equal(1)
	assert_int(int(ProgressionService.allocated_attributes["attr.one"])).is_equal(1)


func test_canonical_progression_replaces_preview() -> void:
	ProgressionService.unspent_attribute_points = 3
	ProgressionService.apply_canonical({
		"classId": "class.one",
		"classDisplayName": "One",
		"level": 2,
		"currentXp": 10,
		"xpToNext": 75,
		"atMaxLevel": false,
		"baseAttributes": {"attr.one": 6},
		"allocatedAttributes": {"attr.one": 1},
		"derived": {"stat.one": 12},
		"unspentAttributePoints": 0,
		"unspentSkillPoints": 1,
		"unlockedAbilityIds": [],
	})
	assert_int(ProgressionService.level).is_equal(2)
	assert_int(ProgressionService.current_xp).is_equal(10)
	assert_int(ProgressionService.unspent_attribute_points).is_equal(0)
	assert_int(ProgressionService.unspent_skill_points).is_equal(1)
	assert_int(int(ProgressionService.allocated_attributes["attr.one"])).is_equal(1)


func test_hud_allocate_buttons_are_enabled_and_skill_points_are_display_only() -> void:
	ProgressionService.apply_canonical({
		"classId": "class.one",
		"classDisplayName": "Test Vanguard",
		"level": 2,
		"currentXp": 0,
		"xpToNext": 75,
		"atMaxLevel": false,
		"baseAttributes": {"attr.one": 7},
		"allocatedAttributes": {"attr.one": 0},
		"derived": {"stat.one": 7},
		"unspentAttributePoints": 1,
		"unspentSkillPoints": 1,
		"unlockedAbilityIds": [],
	})
	var hud: WorldHud = auto_free(preload("res://scenes/world/world_hud.tscn").instantiate())
	add_child(hud)
	await get_tree().process_frame
	var points: Label = hud.get_node("Root/LeftColumn/Progression/Margin/VBox/Points")
	var skills: Label = hud.get_node("Root/LeftColumn/Progression/Margin/VBox/Skills")
	assert_str(points.text).is_equal("Attribute points: 1")
	assert_str(skills.text).contains("Skill points: 1")
	assert_bool(skills.text.contains("unlock later")).is_false()
	var attributes: VBoxContainer = hud.get_node("Root/LeftColumn/Progression/Margin/VBox/Attributes")
	assert_int(attributes.get_child_count()).is_equal(1)
	var button: Button = attributes.get_child(0).get_child(1)
	assert_str(button.text).is_equal("+1")
	assert_bool(button.disabled).is_false()
	assert_float(button.custom_minimum_size.x).is_greater_equal(40.0)
	assert_float(button.custom_minimum_size.y).is_greater_equal(28.0)


func test_hud_unlock_buttons_survive_repeated_snapshot_refresh() -> void:
	assert_bool(ContentRegistry.load_bundle()).is_true()
	ProgressionService.apply_canonical({
		"classId": "class.one",
		"classDisplayName": "Test Vanguard",
		"level": 4,
		"currentXp": 0,
		"xpToNext": 150,
		"atMaxLevel": false,
		"baseAttributes": {"attr.one": 7},
		"allocatedAttributes": {"attr.one": 0},
		"derived": {"stat.one": 7},
		"unspentAttributePoints": 1,
		"unspentSkillPoints": 1,
		"unlockedAbilityIds": ["test.ability.basic_melee"],
	})
	var fake := FakeNetworkBackend.new()
	NetworkService.backend = fake
	NetworkService.match_id = "match-starter-shared"
	var hud: WorldHud = auto_free(preload("res://scenes/world/world_hud.tscn").instantiate())
	add_child(hud)
	await get_tree().process_frame
	var unlocks: VBoxContainer = hud.get_node("Root/LeftColumn/Progression/Margin/VBox/Unlocks")
	assert_int(unlocks.get_child_count()).is_greater(0)
	var button: Button = unlocks.get_child(0).get_child(1)
	assert_str(button.text).contains("Unlock")
	assert_bool(button.disabled).is_false()
	var first := button
	hud.refresh_progression()
	hud.refresh_abilities()
	hud.refresh({
		"self_id": "user-alice",
		"zone_id": "zone.starter",
		"tick": 12,
		"ack_seq": 4,
		"players": [{"userId": "user-alice", "name": "Alice", "x": 240, "y": 384, "health": 40}],
	}, PackedStringArray(["Alice"]))
	assert_object(unlocks.get_child(0).get_child(1)).is_same(first)
	first.pressed.emit()
	await get_tree().process_frame
	assert_int(fake.last_send_opcode).is_equal(MatchProtocol.CLIENT_UNLOCK_ABILITY)


func test_hud_allocate_button_survives_preview_refresh() -> void:
	assert_bool(ContentRegistry.load_bundle()).is_true()
	ProgressionService.apply_canonical({
		"classId": "class.one",
		"classDisplayName": "Test Vanguard",
		"level": 4,
		"currentXp": 0,
		"xpToNext": 150,
		"atMaxLevel": false,
		"baseAttributes": {"attr.one": 7},
		"allocatedAttributes": {"attr.one": 0},
		"derived": {"stat.one": 7},
		"unspentAttributePoints": 2,
		"unspentSkillPoints": 0,
		"unlockedAbilityIds": ["test.ability.basic_melee"],
	})
	var fake := FakeNetworkBackend.new()
	NetworkService.backend = fake
	NetworkService.match_id = "match-starter-shared"
	var hud: WorldHud = auto_free(preload("res://scenes/world/world_hud.tscn").instantiate())
	add_child(hud)
	await get_tree().process_frame
	var attributes: VBoxContainer = hud.get_node("Root/LeftColumn/Progression/Margin/VBox/Attributes")
	assert_int(attributes.get_child_count()).is_greater(0)
	var button: Button = attributes.get_child(0).get_child(1)
	var first := button
	button.pressed.emit()
	assert_object(attributes.get_child(0).get_child(1)).is_same(first)
	assert_int(ProgressionService.unspent_attribute_points).is_equal(1)
	assert_bool(first.disabled).is_false()
