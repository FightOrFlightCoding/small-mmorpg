class_name WorldHud
extends CanvasLayer

signal resync_pressed
signal logout_pressed
signal respawn_pressed

@onready var _status: Label = $Root/Margin/VBox/Status
@onready var _entities: Label = $Root/Margin/VBox/Entities
@onready var _health: Label = $Root/Margin/VBox/Health
@onready var _combat_state: Label = $Root/Margin/VBox/CombatState
@onready var _resync: Button = $Root/Margin/VBox/Buttons/ResyncButton
@onready var _logout: Button = $Root/Margin/VBox/Buttons/LogoutButton
@onready var _journal_body: Label = $Root/Journal/Margin/VBox/Body
@onready var _death: Label = $Root/Death
@onready var _respawn_button: Button = $Root/RespawnButton
@onready var _target_frame: PanelContainer = $Root/TargetFrame
@onready var _target_name: Label = $Root/TargetFrame/Margin/VBox/Name
@onready var _target_vitals: Label = $Root/TargetFrame/Margin/VBox/Vitals
@onready var _inventory_capacity: Label = $Root/Inventory/Margin/VBox/Capacity
@onready var _gold: Label = $Root/Inventory/Margin/VBox/Gold
@onready var _inventory_host: Control = $Root/Inventory/Margin/VBox/ListHost
@onready var _attack: Label = $Root/Inventory/Margin/VBox/Attack
@onready var _main_hand: Label = $Root/Inventory/Margin/VBox/MainHand
@onready var _slot_host: Control = $Root/Inventory/Margin/VBox/SlotHost
@onready var _equip: Button = $Root/Inventory/Margin/VBox/EquipRow/EquipButton
@onready var _unequip: Button = $Root/Inventory/Margin/VBox/EquipRow/UnequipButton
@onready var _slot_option: OptionButton = $Root/Inventory/Margin/VBox/EquipRow/SlotOption
@onready var _destroy: Button = $Root/Inventory/Margin/VBox/MutateRow/DestroyButton
@onready var _split: Button = $Root/Inventory/Margin/VBox/MutateRow/SplitButton
@onready var _notice: Label = $Root/Notice
@onready var _progression_summary: Label = $Root/Progression/Margin/VBox/Summary
@onready var _progression_xp: Label = $Root/Progression/Margin/VBox/Xp
@onready var _progression_points: Label = $Root/Progression/Margin/VBox/Points
@onready var _progression_skills: Label = $Root/Progression/Margin/VBox/Skills
@onready var _progression_unlocks: VBoxContainer = $Root/Progression/Margin/VBox/Unlocks
@onready var _progression_attributes: VBoxContainer = $Root/Progression/Margin/VBox/Attributes
@onready var _progression_derived: Label = $Root/Progression/Margin/VBox/Derived
@onready var _hotbar: HBoxContainer = $Root/Hotbar
@onready var _cast_bar: ProgressBar = $Root/CastBar
@onready var _resource_hint: Label = $Root/ResourceHint
@onready var _status_icons: HBoxContainer = $Root/StatusIcons

var _inventory_list: Control
var _slot_view: Control
var _attribute_row_fingerprint: String = ""


func _ready() -> void:
	_resync.pressed.connect(func() -> void: resync_pressed.emit())
	_logout.pressed.connect(func() -> void: logout_pressed.emit())
	if _respawn_button != null:
		_respawn_button.pressed.connect(func() -> void: respawn_pressed.emit())
	refresh_journal(QuestService.journal_view())
	_bind_inventory()
	refresh_inventory()
	refresh_equipment()
	refresh_wallet()
	refresh_progression()
	if _equip != null:
		_equip.pressed.connect(_on_equip_pressed)
	if _unequip != null:
		_unequip.pressed.connect(_on_unequip_pressed)
	if _destroy != null:
		_destroy.pressed.connect(_on_destroy_pressed)
	if _split != null:
		_split.pressed.connect(_on_split_pressed)
	_fill_slot_option()
	if _slot_option != null and not _slot_option.item_selected.is_connected(_on_slot_selected):
		_slot_option.item_selected.connect(_on_slot_selected)
	if not InventoryService.item_activated.is_connected(_on_item_activated):
		InventoryService.item_activated.connect(_on_item_activated)
	if not EquipmentService.equipment_changed.is_connected(refresh_equipment):
		EquipmentService.equipment_changed.connect(refresh_equipment)
	if not WalletService.wallet_changed.is_connected(refresh_wallet):
		WalletService.wallet_changed.connect(refresh_wallet)
	if not WalletService.notice_received.is_connected(_on_notice):
		WalletService.notice_received.connect(_on_notice)
	if not ProgressionService.progression_changed.is_connected(refresh_progression):
		ProgressionService.progression_changed.connect(refresh_progression)
	if not AbilityService.abilities_changed.is_connected(refresh_abilities):
		AbilityService.abilities_changed.connect(refresh_abilities)
	_bind_hotbar()
	refresh_abilities()


func refresh(state: Dictionary, names: PackedStringArray, snapshot_stale: bool = false) -> void:
	if state.is_empty():
		_status.text = "Waiting for authoritative zone state."
		_entities.text = ""
		if _health != null:
			_health.text = ""
		if _death != null:
			_death.visible = false
		if _respawn_button != null:
			_respawn_button.visible = false
		if _target_frame != null:
			_target_frame.visible = false
		if _combat_state != null:
			_combat_state.text = ""
		refresh_journal(QuestService.journal_view())
		return
	if snapshot_stale:
		_status.text = "Connection degraded. Remote movement is frozen."
	elif AppState.is_reconnecting:
		_status.text = "Reconnecting to the starter zone…"
	else:
		_status.text = "In %s as %s (you). Tick %s. Ack seq %s." % [
			String(state.get("zone_id", "zone.starter")),
			_local_name(state),
			str(state.get("tick", 0)),
			str(state.get("ack_seq", 0)),
		]
	_entities.text = "Present: %s" % ", ".join(names)
	_refresh_health(state)
	_refresh_target_frame(state)
	refresh_journal(QuestService.journal_view())
	refresh_equipment()
	refresh_wallet()
	refresh_progression()


func refresh_journal(view: Dictionary) -> void:
	if _journal_body == null:
		return
	if bool(view.get("empty", true)):
		_journal_body.text = "No active quest."
		return
	_journal_body.text = "\n".join(PackedStringArray([
		String(view.get("title", "")),
		"State: %s" % String(view.get("state", "")),
		"Objective: %s" % String(view.get("objective", "")),
		"Count: %s / %s" % [str(int(view.get("current", 0))), str(int(view.get("required", 0)))],
		"Turn-in: %s" % String(view.get("turn_in_npc", "")),
	]))


func refresh_inventory() -> void:
	if _inventory_capacity == null:
		return
	var occupied := InventoryService.item_count()
	_inventory_capacity.text = "%s / %s stacks" % [str(occupied), str(InventoryService.capacity)]


func refresh_equipment() -> void:
	if _attack != null:
		_attack.text = "Attack: %s" % str(EquipmentService.attack)
	if _main_hand != null:
		_main_hand.text = "Main hand: %s" % EquipmentService.equipped_display_name()
	_fill_slot_option()


func refresh_wallet() -> void:
	if _gold != null:
		_gold.text = "Gold: %s" % str(WalletService.gold)


func refresh_progression() -> void:
	if _progression_summary != null:
		_progression_summary.text = "%s  Level %s" % [
			ProgressionService.class_display_name if not ProgressionService.class_display_name.is_empty() else "Class --",
			str(ProgressionService.level),
		]
	if _progression_xp != null:
		if ProgressionService.at_max_level:
			_progression_xp.text = "XP: max level"
		else:
			_progression_xp.text = "XP: %s / %s" % [str(ProgressionService.current_xp), str(ProgressionService.xp_to_next)]
	if _progression_points != null:
		_progression_points.text = "Attribute points: %s" % str(ProgressionService.unspent_attribute_points)
	if _progression_skills != null:
		_progression_skills.text = "Skill points: %s" % str(ProgressionService.unspent_skill_points)
	_rebuild_unlock_rows()
	_rebuild_attribute_rows()
	if _progression_derived != null:
		var lines := PackedStringArray(["Derived:"])
		for stat_id in ProgressionService.derived_ids():
			var record: Dictionary = ContentRegistry.get_by_id(stat_id)
			var label := String(record.get("displayName", stat_id))
			lines.append("%s %s" % [label, str(int(ProgressionService.derived.get(stat_id, 0)))])
		_progression_derived.text = "\n".join(lines)


func show_notice(message: String) -> void:
	if _notice == null:
		return
	_notice.text = message
	_notice.visible = not message.is_empty()


func _on_notice(_code: String, message: String) -> void:
	show_notice(message)


func _on_equip_pressed() -> void:
	var instance_id := InventoryService.selected_instance_id
	if instance_id.is_empty():
		return
	EquipmentService.request_equip(instance_id, EquipmentService.selected_slot)


func _on_unequip_pressed() -> void:
	EquipmentService.request_unequip(EquipmentService.selected_slot)


func _on_item_activated(instance_id: String) -> void:
	if instance_id.is_empty():
		return
	EquipmentService.request_equip(instance_id, EquipmentService.selected_slot)


func _on_destroy_pressed() -> void:
	var instance_id := InventoryService.selected_instance_id
	if instance_id.is_empty():
		return
	InventoryService.request_destroy(instance_id)


func _on_split_pressed() -> void:
	var instance_id := InventoryService.selected_instance_id
	if instance_id.is_empty():
		return
	var quantity := 0
	for entry in InventoryService.items:
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		if String(entry.get("instanceId", "")) != instance_id:
			continue
		quantity = int(entry.get("quantity", 0))
		break
	if quantity < 2:
		return
	InventoryService.request_split(instance_id, int(floor(float(quantity) / 2.0)))


func _on_slot_selected(index: int) -> void:
	if _slot_option == null or index < 0 or index >= _slot_option.item_count:
		return
	EquipmentService.selected_slot = _slot_option.get_item_text(index)


func _fill_slot_option() -> void:
	if _slot_option == null:
		return
	var tags := EquipmentService.slot_tags()
	var current := EquipmentService.selected_slot
	_slot_option.clear()
	var selected := 0
	for i in range(tags.size()):
		_slot_option.add_item(tags[i])
		if tags[i] == current:
			selected = i
	_slot_option.select(selected)


func refresh_abilities() -> void:
	_refresh_hotbar()
	_refresh_cast_bar()
	_refresh_status_icons()
	_rebuild_unlock_rows()
	if _resource_hint != null:
		var selected := ""
		if AbilityService.is_targeting():
			selected = AbilityService.targeting_ability_id
		elif not AbilityService.hotbar.is_empty():
			selected = String(AbilityService.hotbar[0])
		_resource_hint.text = AbilityService.resource_cost_text(selected)
		if not AbilityService.last_rejection_message.is_empty():
			show_notice(AbilityService.last_rejection_message)


func _bind_hotbar() -> void:
	if _hotbar == null:
		return
	for i in range(_hotbar.get_child_count()):
		var button := _hotbar.get_child(i)
		if button is Button and not (button as Button).pressed.is_connected(_on_hotbar_pressed):
			(button as Button).pressed.connect(_on_hotbar_pressed.bind(i))


func _on_hotbar_pressed(slot_index: int) -> void:
	AbilityService.try_hotbar(slot_index)


func _refresh_hotbar() -> void:
	if _hotbar == null:
		return
	for i in range(_hotbar.get_child_count()):
		var button := _hotbar.get_child(i)
		if not (button is Button):
			continue
		var ability_id := ""
		if i < AbilityService.hotbar.size():
			ability_id = String(AbilityService.hotbar[i])
		var label := str(i + 1)
		if not ability_id.is_empty():
			var definition := AbilityService.ability_definition(ability_id)
			label = String(definition.get("displayName", ability_id))
			var remaining := AbilityService.cooldown_remaining(ability_id)
			if remaining > 0:
				label = "%s\n%s" % [label, str(remaining)]
			if not AbilityService.can_afford(ability_id):
				label = "%s\n--" % label
		(button as Button).text = label
		(button as Button).disabled = ability_id.is_empty()


func _refresh_cast_bar() -> void:
	if _cast_bar == null:
		return
	if AbilityService.active_cast.is_empty():
		_cast_bar.visible = false
		_cast_bar.value = 0.0
		return
	_cast_bar.visible = true
	var start_tick := float(AbilityService.active_cast.get("startTick", 0))
	var complete_tick := float(AbilityService.active_cast.get("completionTick", start_tick))
	var now := float(AppState.zone_view.get("tick", complete_tick))
	var span := complete_tick - start_tick
	if span <= 0.0:
		_cast_bar.value = 1.0
	else:
		_cast_bar.value = clampf((now - start_tick) / span, 0.0, 1.0)


func _refresh_status_icons() -> void:
	if _status_icons == null:
		return
	while _status_icons.get_child_count() > AbilityService.effects.size():
		_status_icons.get_child(_status_icons.get_child_count() - 1).queue_free()
	for i in range(AbilityService.effects.size()):
		var effect: Variant = AbilityService.effects[i]
		if typeof(effect) != TYPE_DICTIONARY:
			continue
		var data: Dictionary = effect
		var icon: ColorRect
		if i < _status_icons.get_child_count():
			icon = _status_icons.get_child(i)
		else:
			icon = ColorRect.new()
			icon.custom_minimum_size = Vector2(18, 18)
			_status_icons.add_child(icon)
		var effect_type := String(data.get("type", ""))
		if effect_type == "stun":
			icon.color = Color(0.85, 0.75, 0.2)
		elif effect_type == "root":
			icon.color = Color(0.55, 0.35, 0.15)
		elif effect_type.find("heal") != -1:
			icon.color = Color(0.3, 0.75, 0.4)
		elif effect_type.find("damage") != -1:
			icon.color = Color(0.75, 0.25, 0.2)
		else:
			icon.color = Color(0.45, 0.55, 0.85)
		icon.tooltip_text = "%s x%s" % [String(data.get("effectId", effect_type)), str(int(data.get("stacks", 1)))]


func _rebuild_unlock_rows() -> void:
	if _progression_unlocks == null:
		return
	for child in _progression_unlocks.get_children():
		child.queue_free()
	for ability_id in AbilityService.catalog_ability_ids():
		var definition := AbilityService.ability_definition(ability_id)
		if definition.is_empty():
			continue
		var cost := int(definition.get("skillPointCost", 0))
		if cost <= 0:
			continue
		var unlocked := AbilityService.unlocked_ability_ids.has(ability_id)
		var max_rank := int(definition.get("maxRank", 1))
		var rank := int(AbilityService.ability_ranks.get(ability_id, 0))
		if unlocked and rank >= max_rank:
			continue
		var row := HBoxContainer.new()
		var label := Label.new()
		label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		label.text = String(definition.get("displayName", ability_id))
		var button := Button.new()
		button.text = "Unlock %s" % str(cost)
		button.disabled = ProgressionService.unspent_skill_points < cost
		button.pressed.connect(func() -> void: AbilityService.request_unlock(ability_id))
		row.add_child(label)
		row.add_child(button)
		_progression_unlocks.add_child(row)


func _bind_inventory() -> void:
	if _inventory_host == null or _inventory_list != null:
		return
	_inventory_list = InventoryService.attach_list(_inventory_host)
	if not InventoryService.inventory_changed.is_connected(refresh_inventory):
		InventoryService.inventory_changed.connect(refresh_inventory)
	if _slot_host != null and _slot_view == null:
		_slot_view = EquipmentService.attach_slot(_slot_host)


func _exit_tree() -> void:
	if InventoryService.inventory_changed.is_connected(refresh_inventory):
		InventoryService.inventory_changed.disconnect(refresh_inventory)
	if InventoryService.item_activated.is_connected(_on_item_activated):
		InventoryService.item_activated.disconnect(_on_item_activated)
	if EquipmentService.equipment_changed.is_connected(refresh_equipment):
		EquipmentService.equipment_changed.disconnect(refresh_equipment)
	if WalletService.wallet_changed.is_connected(refresh_wallet):
		WalletService.wallet_changed.disconnect(refresh_wallet)
	if WalletService.notice_received.is_connected(_on_notice):
		WalletService.notice_received.disconnect(_on_notice)
	if ProgressionService.progression_changed.is_connected(refresh_progression):
		ProgressionService.progression_changed.disconnect(refresh_progression)
	if AbilityService.abilities_changed.is_connected(refresh_abilities):
		AbilityService.abilities_changed.disconnect(refresh_abilities)


func _rebuild_attribute_rows() -> void:
	if _progression_attributes == null:
		return
	var fingerprint := "%s|%s|%s" % [
		",".join(ProgressionService.attribute_ids()),
		str(ProgressionService.allocated_attributes),
		str(ProgressionService.unspent_attribute_points),
	]
	if fingerprint == _attribute_row_fingerprint:
		return
	_attribute_row_fingerprint = fingerprint
	while _progression_attributes.get_child_count() > 0:
		var child := _progression_attributes.get_child(0)
		_progression_attributes.remove_child(child)
		child.free()
	for attribute_id in ProgressionService.attribute_ids():
		var record: Dictionary = ContentRegistry.get_by_id(attribute_id)
		var label_name := String(record.get("displayName", attribute_id))
		var base_value := int(ProgressionService.base_attributes.get(attribute_id, 0))
		var allocated := int(ProgressionService.allocated_attributes.get(attribute_id, 0))
		var row := HBoxContainer.new()
		row.mouse_filter = Control.MOUSE_FILTER_STOP
		var label := Label.new()
		label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		label.mouse_filter = Control.MOUSE_FILTER_IGNORE
		label.text = "%s  base %s  alloc %s" % [label_name, str(base_value), str(allocated)]
		var button := Button.new()
		button.text = "+1"
		button.custom_minimum_size = Vector2(40, 28)
		button.mouse_filter = Control.MOUSE_FILTER_STOP
		button.disabled = ProgressionService.unspent_attribute_points < 1
		button.pressed.connect(_on_allocate_pressed.bind(attribute_id))
		row.add_child(label)
		row.add_child(button)
		_progression_attributes.add_child(row)


func _on_allocate_pressed(attribute_id: String) -> void:
	ProgressionService.request_allocate(attribute_id, 1)


func _refresh_health(state: Dictionary) -> void:
	var self_id := String(state.get("self_id", ""))
	var player_hp := "You: --"
	var local_dead := false
	var in_combat := false
	var dead_until := 0
	for entry in state.get("players", []):
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		if String(entry.get("userId", "")) != self_id:
			continue
		var health := int(entry.get("health", 0))
		var max_health := int(entry.get("maxHealth", health))
		player_hp = "You: %s / %s" % [str(health), str(max_health)]
		var resource_text := _resource_summary(entry)
		if not resource_text.is_empty():
			player_hp += "  %s" % resource_text
		local_dead = health <= 0
		in_combat = bool(entry.get("inCombat", false))
		dead_until = int(entry.get("deadUntilTick", 0))
		break
	var slime_hp := "Slime: --"
	for entry in state.get("enemies", []):
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		var enemy: Dictionary = entry
		if String(enemy.get("enemyId", "")).find("slime") == -1 and String(enemy.get("id", "")).find("slime") == -1:
			continue
		slime_hp = "Slime: %s / %s" % [str(int(enemy.get("health", 0))), str(int(enemy.get("maxHealth", 0)))]
		if enemy.has("state") and String(enemy["state"]) != "":
			slime_hp += " (%s)" % String(enemy["state"])
		break
	if _health != null:
		_health.text = "%s    %s    Atk %s    Attack: Space    Pickup: F" % [player_hp, slime_hp, str(EquipmentService.attack)]
	if _combat_state != null:
		if local_dead:
			_combat_state.text = "Defeated"
		elif in_combat:
			_combat_state.text = "In combat"
		else:
			_combat_state.text = "Out of combat"
	if _death != null:
		_death.visible = local_dead
		if local_dead:
			var tick := int(state.get("tick", 0))
			var remaining := maxi(dead_until - tick, 0)
			var seconds := ceili(float(remaining) / 10.0)
			if seconds > 0:
				_death.text = "Defeated. Respawning in %ss..." % str(seconds)
			else:
				_death.text = "Defeated. Release to respawn."
	if _respawn_button != null:
		_respawn_button.visible = local_dead


func _resource_summary(entry: Dictionary) -> String:
	var resources: Variant = entry.get("resources", {})
	if typeof(resources) != TYPE_DICTIONARY:
		resources = AbilityService.resources
	if typeof(resources) != TYPE_DICTIONARY:
		return ""
	var data: Dictionary = resources
	if data.is_empty():
		data = AbilityService.resources
	if data.is_empty():
		return ""
	var parts: PackedStringArray = PackedStringArray()
	for key in data.keys():
		var label := String(key)
		var bits := label.split(".")
		if bits.size() > 0:
			label = bits[bits.size() - 1]
		parts.append("%s %s" % [label, str(int(data[key]))])
	return "  ".join(parts)


func _refresh_target_frame(state: Dictionary) -> void:
	if _target_frame == null:
		return
	var self_id := String(state.get("self_id", ""))
	var hostile_id := ""
	var friendly_id := ""
	for entry in state.get("players", []):
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		if String(entry.get("userId", "")) != self_id:
			continue
		hostile_id = String(entry.get("hostileTargetId", ""))
		friendly_id = String(entry.get("friendlyTargetId", ""))
		break
	var shown := _fill_target_from_enemies(state, hostile_id)
	if not shown:
		shown = _fill_target_from_players(state, friendly_id, self_id)
	_target_frame.visible = shown


func _fill_target_from_enemies(state: Dictionary, target_id: String) -> bool:
	if target_id.is_empty():
		return false
	for entry in state.get("enemies", []):
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		if String(entry.get("id", "")) != target_id:
			continue
		if _target_name != null:
			_target_name.text = String(entry.get("enemyId", target_id))
		if _target_vitals != null:
			var ai_state := String(entry.get("state", ""))
			if ai_state.is_empty():
				_target_vitals.text = "%s / %s" % [str(int(entry.get("health", 0))), str(int(entry.get("maxHealth", 0)))]
			else:
				_target_vitals.text = "%s / %s (%s)" % [
					str(int(entry.get("health", 0))),
					str(int(entry.get("maxHealth", 0))),
					ai_state,
				]
		return true
	return false


func _fill_target_from_players(state: Dictionary, target_id: String, self_id: String) -> bool:
	if target_id.is_empty() or target_id == self_id:
		return false
	for entry in state.get("players", []):
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		if String(entry.get("userId", "")) != target_id:
			continue
		if _target_name != null:
			_target_name.text = String(entry.get("name", target_id))
		if _target_vitals != null:
			_target_vitals.text = "%s / %s" % [str(int(entry.get("health", 0))), str(int(entry.get("maxHealth", 0)))]
		return true
	return false


func _local_name(state: Dictionary) -> String:
	var self_id := String(state.get("self_id", ""))
	for entry in state.get("players", []):
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		if String(entry.get("userId", "")) != self_id:
			continue
		var named := String(entry.get("name", ""))
		if not named.is_empty():
			return named
	if not AppState.character_view.is_empty():
		var from_character := String(AppState.character_view.get("name", ""))
		if not from_character.is_empty():
			return from_character
	return self_id if not self_id.is_empty() else "unknown"
