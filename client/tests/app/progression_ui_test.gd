extends GdUnitTestSuite

## PROG-13 character sheet, trees, hotbar, respec, and class cards.

var _level_up_count: int = 0


func before_test() -> void:
	_level_up_count = 0
	SceneRouter.reset_for_tests()
	AppState.reset_for_tests()
	NetworkService.reset_for_tests()
	ProgressionService.reset_for_tests()
	AbilityService.reset_for_tests()
	WalletService.reset_for_tests()
	InnService.reset_for_tests()
	WindowManager.reset_for_tests()
	HudController.reset_for_tests()
	DragDropService.reset_for_tests()
	NotificationService.reset_for_tests()
	UiStateService.reset_for_tests()
	assert_bool(ContentRegistry.load_bundle()).is_true()


func after_test() -> void:
	if ProgressionService.level_up_events.is_connected(_count_level_up):
		ProgressionService.level_up_events.disconnect(_count_level_up)
	WindowManager.reset_for_tests()
	HudController.reset_for_tests()
	ProgressionService.reset_for_tests()
	AbilityService.reset_for_tests()
	DragDropService.reset_for_tests()


func test_four_class_cards_show_resource_and_cannot_change() -> void:
	var fake := FakeNetworkBackend.new()
	NetworkService.backend = fake
	AppState.is_authenticated = true
	var scene: Node = load("res://scenes/character/character.tscn").instantiate()
	add_child(scene)
	await await_idle_frame()
	await await_idle_frame()
	var class_row: Node = scene.get_node("Root/VBox/CreatePanel/ClassRow")
	assert_int(class_row.get_child_count()).is_equal(4)
	var seen := PackedStringArray()
	for child in class_row.get_children():
		if not (child is Button):
			continue
		var card := child as Button
		seen.append(String(card.get_meta("class_id", "")))
		var resource := card.find_child("ResourceType", true, false)
		var cannot_change := card.find_child("CannotChange", true, false)
		assert_object(resource).is_not_null()
		assert_object(cannot_change).is_not_null()
		assert_str((cannot_change as Label).text).contains("cannot currently be changed")
		assert_str(card.tooltip_text).contains("cannot currently be changed")
	assert_bool(seen.has("class.warrior")).is_true()
	assert_bool(seen.has("class.mage")).is_true()
	assert_bool(seen.has("class.marksman")).is_true()
	assert_bool(seen.has("class.mystic")).is_true()
	assert_str(ClassPresentation.for_id("class.warrior").get("resource_type", "")).contains("None")
	assert_str(ClassPresentation.for_id("class.mage").get("resource_type", "")).contains("Mana")
	assert_str(ClassPresentation.selected_summary("class.warrior")).contains("cannot currently be changed")
	scene.queue_free()


func test_physical_versus_caster_resource_display() -> void:
	_apply_warrior_sheet()
	var window := _window()
	window.refresh()
	assert_str((window.find_ui("NoMana") as Label).text).contains("not used")
	assert_object(window.find_ui("formula_mana_max")).is_null()
	window.queue_free()
	ProgressionService.apply_canonical({
		"classId": "class.mage",
		"classDisplayName": "Mage",
		"level": 2,
		"currentXp": 10,
		"xpToNext": 280,
		"lifetimeXp": 110,
		"atMaxLevel": false,
		"baseAttributes": {"stat.intelligence": 8},
		"allocatedAttributes": {},
		"freeStatAllocations": {},
		"derived": {
			"stat.intelligence": 8,
			"formula.hp_max": 80,
			"formula.mana_max": 60,
			"formula.mana_regen": 1.2,
			"formula.crit_chance": 0.02,
			"formula.crit_mult": 1.5,
			"formula.haste_mult": 1.03,
			"formula.damage_reduction": 0.01,
		},
		"unspentFreeStatPoints": 3,
		"unspentClassPoints": 0,
		"unspentBranchPoints": 0,
		"unlockedAbilityIds": [],
	})
	window = _window()
	window.refresh()
	assert_object(window.find_ui("formula_mana_max")).is_not_null()
	assert_str((window.find_ui("formula_mana_max") as Label).text).contains("Mana")
	assert_str((window.find_ui("formula_mana_regen") as Label).text).contains("regeneration")
	assert_object(window.find_ui("NoMana")).is_null()
	window.queue_free()


func test_xp_bar_and_sheet_fields() -> void:
	_apply_warrior_sheet()
	var window := _window()
	window.refresh()
	var bar: ProgressBar = window.find_ui("XpBar")
	assert_float(bar.value).is_greater(0.0)
	assert_float(bar.value).is_less(1.0)
	assert_float(bar.value).is_equal_approx(ProgressionCatalog.xp_ratio(10, 280, false), 0.001)
	assert_str((window.find_ui("XpCurrent") as Label).text).contains("10")
	assert_str((window.find_ui("XpToNext") as Label).text).contains("280")
	assert_str((window.find_ui("LifetimeXp") as Label).text).contains("110")
	assert_str((window.find_ui("UnspentPoints") as Label).text).contains("Unspent free")
	assert_str((window.find_ui("UnspentPoints") as Label).text).contains("class points")
	assert_str((window.find_ui("Header") as Label).text).contains("Warrior")
	assert_str((window.find_ui("Stat_stat_strength").find_child("Automatic", true, false) as Label).text).contains("Automatic growth")
	assert_str((window.find_ui("Stat_stat_strength").find_child("Free", true, false) as Label).text).contains("Free allocations")
	assert_str((window.find_ui("Stat_stat_strength").find_child("Equipment", true, false) as Label).text).contains("Equipment")
	assert_str((window.find_ui("Stat_stat_strength").find_child("Temporary", true, false) as Label).text).contains("Temporary")
	assert_str((window.find_ui("Stat_stat_strength").find_child("Total", true, false) as Label).text).contains("Final total")
	window.queue_free()


func test_allocation_preview_confirm_and_rejection() -> void:
	var fake := FakeNetworkBackend.new()
	NetworkService.backend = fake
	NetworkService.match_id = "match-starter-shared"
	_apply_warrior_sheet()
	var window := _window()
	window.refresh()
	assert_int(ProgressionService.remaining_preview()).is_equal(3)
	assert_bool(ProgressionService.queue_pending_stat("stat.strength", 1)).is_true()
	assert_int(ProgressionService.remaining_preview()).is_equal(2)
	assert_int(int(ProgressionService.free_stat_allocations.get("stat.strength", 0))).is_equal(0)
	assert_str((window.find_ui("RemainingPreview") as Label).text).contains("2")
	var request_id := ProgressionService.confirm_pending_allocations()
	assert_str(request_id).is_not_empty()
	var blocked := ProgressionService.confirm_pending_allocations()
	assert_str(blocked).is_empty()
	await await_idle_frame()
	assert_int(fake.last_send_opcode).is_equal(MatchProtocol.CLIENT_ALLOCATE_ATTRIBUTES_BATCH)
	var payload: Dictionary = JSON.parse_string(fake.last_send_payload)
	assert_bool(payload.has("xp")).is_false()
	assert_bool(payload.has("level")).is_false()
	NetworkService.action_result_received.emit({
		"request_id": request_id,
		"result_ok": false,
		"code": "insufficient_points",
	})
	assert_int(ProgressionService.unspent_stat_points()).is_equal(3)
	assert_int(int(ProgressionService.pending_allocations.get("stat.strength", 0))).is_equal(1)
	assert_str(ProgressionService.last_rejection_code).is_equal("insufficient_points")
	assert_str((window.find_ui("ErrorBanner") as Label).text).contains("unspent")
	var retry := ProgressionService.confirm_pending_allocations()
	assert_str(retry).is_not_empty()
	assert_str(retry).is_not_equal(request_id)
	window.queue_free()


func test_auto_assign_toggle_and_current_unspent() -> void:
	var fake := FakeNetworkBackend.new()
	NetworkService.backend = fake
	NetworkService.match_id = "match-starter-shared"
	_apply_warrior_sheet()
	var window := _window()
	window.refresh()
	var toggle: CheckBox = window.find_ui("AutoAssignToggle")
	toggle.button_pressed = true
	toggle.toggled.emit(true)
	await await_idle_frame()
	assert_int(fake.last_send_opcode).is_equal(MatchProtocol.CLIENT_SET_AUTO_ASSIGN)
	(window.find_ui("AssignUnspentAutomatically") as Button).pressed.emit()
	await await_idle_frame()
	assert_int(fake.last_send_opcode).is_equal(MatchProtocol.CLIENT_AUTO_ASSIGN_UNSPENT_POINTS)
	window.queue_free()


func test_level_up_notification_is_skippable() -> void:
	var hud: WorldHud = auto_free(preload("res://scenes/world/world_hud.tscn").instantiate())
	add_child(hud)
	await get_tree().process_frame
	ProgressionService.apply_canonical(_warrior_state({
		"level": 3,
		"events": [
			{"type": "level_gained"},
			{"type": "free_points_gained"},
			{"type": "class_point_gained"},
			{"type": "basic_unlocked"},
		],
	}))
	await get_tree().process_frame
	assert_bool(hud.level_up_toast.visible).is_true()
	assert_str(hud.level_up_toast.presented_text()).contains("level 3")
	assert_str(hud.level_up_toast.presented_text()).contains("free stat")
	assert_str(hud.level_up_toast.presented_text()).contains("Automatic growth")
	hud.level_up_toast.dismiss()
	assert_bool(hud.level_up_toast.visible).is_false()


func test_branch_modal_requires_confirmation_and_can_close() -> void:
	ProgressionService.apply_canonical(_warrior_state({
		"level": 5,
		"pendingBranchSelection": true,
		"branchId": "",
		"unspentBranchPoints": 1,
		"unspentFreeStatPoints": 12,
	}))
	var window := _window()
	window.show_window()
	assert_bool(window.branch_modal.visible).is_true()
	assert_int(window.branch_modal.find_child("Cards", true, false).get_child_count()).is_equal(2)
	assert_str((window.branch_modal.find_child("Help", true, false) as Label).text).contains("permanent until a trainer respec")
	assert_str(window.branch_modal.selected_branch_id()).is_empty()
	window.branch_modal.find_child("CloseWithoutChoice", true, false).pressed.emit()
	assert_bool(window.branch_modal.visible).is_false()
	assert_bool(ProgressionService.pending_branch_selection).is_true()
	assert_str(ProgressionService.branch_id).is_empty()
	assert_str((window.find_ui("StatusBanner") as Label).text).contains("branchless")
	window.queue_free()


func test_class_tree_and_branch_tree_and_tier_locks() -> void:
	ProgressionService.apply_canonical(_warrior_state({
		"level": 5,
		"branchId": "branch.warrior.bulwark",
		"pendingBranchSelection": false,
		"unspentClassPoints": 1,
		"unspentBranchPoints": 1,
		"purchasedClassNodeIds": ["talent.warrior.heavy_strike_r2"],
		"purchasedBranchNodeRanks": {},
		"unlockedAbilityIds": ["ability.warrior.heavy_strike", "ability.warrior.challenge"],
	}))
	var window := _window()
	window.refresh()
	assert_str((window.find_ui("ClassTreeMeta") as Label).text).contains("two total earned")
	assert_int(window.find_ui("ClassTreeHost").get_child_count()).is_equal(3)
	assert_str((window.find_ui("BranchTreeMeta") as Label).text).contains("point-slots")
	assert_str((window.find_ui("BranchTreeMeta") as Label).text).contains("level 9")
	assert_str((window.find_ui("Tier3") as Label).text).contains("Tier 3")
	var last_stand := window.find_ui("Node_talent_warrior_bulwark_last_stand")
	assert_object(last_stand).is_not_null()
	assert_str((last_stand.find_child("Detail", true, false) as Label).text).contains("level")
	assert_bool((last_stand.find_child("Purchase", true, false) as Button).disabled).is_true()
	var iron := window.find_ui("Node_talent_warrior_bulwark_iron_thorns")
	assert_bool((iron.find_child("Purchase", true, false) as Button).disabled).is_false()
	window.queue_free()


func test_hotbar_assigns_owned_actives_only() -> void:
	var fake := FakeNetworkBackend.new()
	NetworkService.backend = fake
	NetworkService.match_id = "match-starter-shared"
	ProgressionService.apply_canonical(_warrior_state({
		"level": 5,
		"branchId": "branch.warrior.bulwark",
		"unlockedAbilityIds": ["ability.warrior.heavy_strike", "ability.warrior.challenge"],
	}))
	AbilityService.apply_canonical({
		"unlockedAbilityIds": ["ability.warrior.heavy_strike", "ability.warrior.challenge", "ability.warrior.auto_attack"],
		"hotbar": ["", "", "", ""],
		"abilityRanks": {"ability.warrior.heavy_strike": 1},
		"cooldowns": {"ability.warrior.heavy_strike": 2},
	})
	var window := _window()
	window.refresh()
	assert_str((window.find_ui("AutoAttack") as Label).text).contains("Auto-attack")
	var slot0: OptionButton = window.find_ui("Slot0").get_node("Assign")
	var found_auto := false
	var found_heavy := false
	for i in range(slot0.item_count):
		var id := String(slot0.get_item_metadata(i))
		if id == "ability.warrior.auto_attack":
			found_auto = true
		if id == "ability.warrior.heavy_strike":
			found_heavy = true
			slot0.select(i)
			slot0.item_selected.emit(i)
	assert_bool(found_auto).is_false()
	assert_bool(found_heavy).is_true()
	await await_idle_frame()
	assert_int(fake.last_send_opcode).is_equal(MatchProtocol.CLIENT_ASSIGN_HOTBAR)
	var payload: Dictionary = JSON.parse_string(fake.last_send_payload)
	assert_str(String(payload.get("abilityId", ""))).is_equal("ability.warrior.heavy_strike")
	assert_bool(payload.has("damage")).is_false()
	window.queue_free()


func test_respec_dialog_shows_cost_and_blocks_insufficient_gold() -> void:
	var fake := FakeNetworkBackend.new()
	NetworkService.backend = fake
	NetworkService.match_id = "match-starter-shared"
	InnService.last_npc_id = "npc.test_innkeeper"
	WalletService.apply_gold(10)
	ProgressionService.apply_canonical(_warrior_state({"level": 5, "unspentFreeStatPoints": 12}))
	var hud: WorldHud = auto_free(preload("res://scenes/world/world_hud.tscn").instantiate())
	add_child(hud)
	await get_tree().process_frame
	hud._on_inn_respec_pressed()
	var dialog: RespecConfirmDialog = hud.progression_window.respec_dialog
	assert_bool(dialog.visible).is_true()
	assert_str(dialog.cost_label.text).contains("250")
	assert_str(dialog.resets_label.text).contains("Resets")
	assert_str(dialog.remains_label.text).contains("Remains")
	assert_str(dialog.error_label.text).contains("Not enough gold")
	assert_bool(dialog.confirm_button.disabled).is_true()
	assert_int(fake.last_send_opcode).is_not_equal(MatchProtocol.CLIENT_TRAINER_RESPEC)
	WalletService.apply_gold(500)
	dialog.present_summary()
	assert_bool(dialog.confirm_button.disabled).is_false()
	assert_str(dialog.unspent_label.text).contains("unspent free")
	assert_str(dialog.branch_label.text).contains("branchless")
	dialog.confirm_button.pressed.emit()
	await await_idle_frame()
	assert_int(fake.last_send_opcode).is_equal(MatchProtocol.CLIENT_TRAINER_RESPEC)
	var payload: Dictionary = JSON.parse_string(fake.last_send_payload)
	assert_bool(payload.has("gold")).is_false()
	assert_bool(payload.has("xp")).is_false()


func test_reconnect_restores_window_and_clears_pending() -> void:
	WindowManager.open(WindowManager.CHARACTER)
	ProgressionService.apply_canonical(_warrior_state({}))
	ProgressionService.queue_pending_stat("stat.strength", 1)
	assert_int(ProgressionService.pending_total()).is_equal(1)
	AppState.notify_reconnecting(true)
	assert_int(ProgressionService.pending_total()).is_equal(0)
	assert_bool(WindowManager.is_open(WindowManager.RECONNECT)).is_true()
	AppState.notify_reconnecting(false)
	assert_bool(WindowManager.is_open(WindowManager.CHARACTER)).is_true()
	assert_str(NotificationService.last_message).is_equal("Reconnected.")


func test_no_duplicate_level_up_signals() -> void:
	_level_up_count = 0
	WindowManager.connect_once(ProgressionService.level_up_events, _count_level_up)
	WindowManager.connect_once(ProgressionService.level_up_events, _count_level_up)
	var payload := _warrior_state({
		"level": 2,
		"events": [{"type": "level_gained"}, {"type": "basic_unlocked"}],
	})
	ProgressionService.apply_canonical(payload)
	ProgressionService.apply_canonical(payload)
	assert_int(_level_up_count).is_equal(1)


func _count_level_up(_lines: PackedStringArray) -> void:
	_level_up_count += 1


func test_character_switch_clears_pending_and_sheet() -> void:
	AppState.notify_character_loaded({"character_id": "char-a", "name": "Alice"}, false)
	ProgressionService.apply_canonical(_warrior_state({}))
	ProgressionService.queue_pending_stat("stat.vitality", 2)
	var window := _window()
	window.show_window()
	WindowManager.open(WindowManager.CHARACTER)
	AppState.notify_character_loaded({"character_id": "char-b", "name": "Bob", "playBlockedReason": "link_dead"}, false)
	assert_int(ProgressionService.pending_total()).is_equal(0)
	assert_str(ProgressionService.class_id).is_empty()
	assert_bool(ProgressionService.is_link_dead()).is_true()
	assert_str(ProgressionService.confirm_pending_allocations()).is_empty()
	window.refresh()
	assert_str((window.find_ui("StatusBanner") as Label).text).contains("Link-dead")
	window.queue_free()


func test_reference_builds_are_nonbinding() -> void:
	ProgressionService.apply_canonical(_warrior_state({"branchId": "branch.warrior.bulwark"}))
	var window := _window()
	window.refresh()
	var fortress: Label = window.find_ui("build_bulwark_fortress")
	assert_object(fortress).is_not_null()
	assert_str(fortress.text).contains("Fortress")
	assert_str(fortress.text).contains("VIT")
	assert_str(fortress.text).contains("optional guidance")
	assert_int(ProgressionService.pending_total()).is_equal(0)
	window.queue_free()


func _window() -> ProgressionWindow:
	var window := ProgressionWindow.new()
	auto_free(window)
	add_child(window)
	window.show_window()
	return window


func _apply_warrior_sheet() -> void:
	ProgressionService.apply_canonical(_warrior_state({}))


func _warrior_state(overrides: Dictionary) -> Dictionary:
	var state := {
		"classId": "class.warrior",
		"classDisplayName": "Warrior",
		"level": 2,
		"currentXp": 10,
		"xpToNext": 280,
		"lifetimeXp": 110,
		"atMaxLevel": false,
		"baseAttributes": {
			"stat.strength": 11,
			"stat.agility": 4,
			"stat.intelligence": 2,
			"stat.spirit": 3,
			"stat.vitality": 10,
			"stat.precision": 3,
			"stat.haste": 3,
			"stat.endurance": 4,
		},
		"allocatedAttributes": {},
		"freeStatAllocations": {},
		"derived": {
			"stat.strength": 11,
			"stat.agility": 4,
			"stat.intelligence": 2,
			"stat.spirit": 3,
			"stat.vitality": 10,
			"stat.precision": 3,
			"stat.haste": 3,
			"stat.endurance": 4,
			"formula.hp_max": 120,
			"formula.crit_chance": 0.015,
			"formula.crit_mult": 1.5,
			"formula.haste_mult": 1.03,
			"formula.damage_reduction": 0.02,
		},
		"unspentAttributePoints": 3,
		"unspentFreeStatPoints": 3,
		"unspentClassPoints": 0,
		"unspentBranchPoints": 0,
		"unspentSkillPoints": 0,
		"autoAssignEnabled": false,
		"pendingBranchSelection": false,
		"branchId": "",
		"purchasedClassNodeIds": [],
		"purchasedBranchNodeRanks": {},
		"hotbarAssignments": ["", "", "", ""],
		"unlockedAbilityIds": ["ability.warrior.heavy_strike"],
	}
	for key in overrides.keys():
		state[key] = overrides[key]
	return state
