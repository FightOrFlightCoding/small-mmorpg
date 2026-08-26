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


func test_client_mirrors_server_canonical_derived_floats_without_computing() -> void:
	ProgressionService.apply_canonical({
		"classId": "class.warrior",
		"classDisplayName": "Warrior",
		"level": 1,
		"currentXp": 0,
		"xpToNext": 50,
		"atMaxLevel": false,
		"baseAttributes": {},
		"allocatedAttributes": {},
		"derived": {
			"formula.hp_max": 110,
			"formula.crit_chance": 0.015,
			"formula.haste_mult": 1.03,
			"formula.damage_reduction": 0.015,
		},
		"unspentAttributePoints": 0,
		"unspentSkillPoints": 0,
		"unlockedAbilityIds": [],
	})
	assert_float(float(ProgressionService.derived["formula.hp_max"])).is_equal(110.0)
	assert_float(float(ProgressionService.derived["formula.crit_chance"])).is_equal_approx(0.015, 0.0001)
	assert_float(float(ProgressionService.derived["formula.haste_mult"])).is_equal_approx(1.03, 0.0001)
	assert_bool(ProgressionService.derived.has("formula.mana_max")).is_false()


func test_select_branch_and_auto_assign_send_opcodes_without_xp() -> void:
	var fake := FakeNetworkBackend.new()
	NetworkService.backend = fake
	NetworkService.match_id = "match-starter-shared"
	ProgressionService.apply_canonical({
		"classId": "class.warrior",
		"classDisplayName": "Warrior",
		"level": 5,
		"currentXp": 0,
		"xpToNext": 1120,
		"atMaxLevel": false,
		"baseAttributes": {"stat.strength": 20},
		"allocatedAttributes": {},
		"derived": {},
		"unspentAttributePoints": 12,
		"unspentFreeStatPoints": 12,
		"unspentSkillPoints": 0,
		"pendingBranchSelection": true,
		"autoAssignEnabled": false,
		"unlockedAbilityIds": ["ability.warrior.heavy_strike"],
	})
	var branch_id := ProgressionService.request_select_branch("branch.warrior.berserker")
	await get_tree().process_frame
	assert_str(branch_id).is_not_empty()
	assert_int(fake.last_send_opcode).is_equal(MatchProtocol.CLIENT_SELECT_BRANCH)
	var branch_payload: Dictionary = JSON.parse_string(fake.last_send_payload)
	assert_str(String(branch_payload.get("branchId", ""))).is_equal("branch.warrior.berserker")
	assert_bool(branch_payload.has("xp")).is_false()
	var flag_id := ProgressionService.request_set_auto_assign(true)
	await get_tree().process_frame
	assert_str(flag_id).is_not_empty()
	assert_int(fake.last_send_opcode).is_equal(MatchProtocol.CLIENT_SET_AUTO_ASSIGN)
	var flag_payload: Dictionary = JSON.parse_string(fake.last_send_payload)
	assert_bool(bool(flag_payload.get("enabled", false))).is_true()
	var spend_id := ProgressionService.request_auto_assign_unspent()
	await get_tree().process_frame
	assert_str(spend_id).is_not_empty()
	assert_int(fake.last_send_opcode).is_equal(MatchProtocol.CLIENT_AUTO_ASSIGN_UNSPENT_POINTS)
	var batch_id := ProgressionService.request_allocate_batch([
		{"statId": "stat.strength", "amount": 1},
		{"statId": "stat.intelligence", "amount": 1},
	])
	await get_tree().process_frame
	assert_str(batch_id).is_not_empty()
	assert_int(fake.last_send_opcode).is_equal(MatchProtocol.CLIENT_ALLOCATE_ATTRIBUTES_BATCH)
	var batch_payload: Dictionary = JSON.parse_string(fake.last_send_payload)
	assert_bool(batch_payload.has("xp")).is_false()
	assert_bool(batch_payload.has("level")).is_false()
	var respec_id := ProgressionService.request_respec("npc.test_innkeeper")
	await get_tree().process_frame
	assert_str(respec_id).is_not_empty()
	assert_int(fake.last_send_opcode).is_equal(MatchProtocol.CLIENT_TRAINER_RESPEC)
	var respec_payload: Dictionary = JSON.parse_string(fake.last_send_payload)
	assert_str(String(respec_payload.get("npcId", ""))).is_equal("npc.test_innkeeper")
	assert_bool(respec_payload.has("gold")).is_false()
	assert_bool(respec_payload.has("xp")).is_false()
	assert_bool(respec_payload.has("level")).is_false()

