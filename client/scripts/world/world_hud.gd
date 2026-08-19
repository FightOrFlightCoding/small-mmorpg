class_name WorldHud
extends CanvasLayer

signal resync_pressed
signal logout_pressed
signal respawn_pressed

## Matches server TRADE_RANGE_PX. Nearby list and invite hints only; the match still enforces range.
const TRADE_RANGE_PX: float = 80.0

@onready var _status: Label = $Root/Margin/VBox/Status
@onready var _entities: Label = $Root/Margin/VBox/Entities
@onready var _health: Label = $Root/Margin/VBox/Health
@onready var _combat_state: Label = $Root/Margin/VBox/CombatState
@onready var _resync: Button = $Root/Margin/VBox/Buttons/ResyncButton
@onready var _logout: Button = $Root/Margin/VBox/Buttons/LogoutButton
@onready var _settings_button: Button = $Root/Margin/VBox/Buttons/SettingsButton
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
@onready var _progression_summary: Label = $Root/LeftColumn/Progression/Margin/VBox/Summary
@onready var _progression_xp: Label = $Root/LeftColumn/Progression/Margin/VBox/Xp
@onready var _progression_points: Label = $Root/LeftColumn/Progression/Margin/VBox/Points
@onready var _progression_skills: Label = $Root/LeftColumn/Progression/Margin/VBox/Skills
@onready var _progression_unlocks: VBoxContainer = $Root/LeftColumn/Progression/Margin/VBox/Unlocks
@onready var _progression_attributes: VBoxContainer = $Root/LeftColumn/Progression/Margin/VBox/Attributes
@onready var _progression_derived: Label = $Root/LeftColumn/Progression/Margin/VBox/Derived
@onready var _hotbar: HBoxContainer = $Root/Hotbar
@onready var _cast_bar: ProgressBar = $Root/CastBar
@onready var _resource_hint: Label = $Root/ResourceHint
@onready var _status_icons: HBoxContainer = $Root/StatusIcons
@onready var _party_members: ItemList = $Root/LeftColumn/Party/Margin/Scroll/VBox/Members
@onready var _party_status: Label = $Root/LeftColumn/Party/Margin/Scroll/VBox/Status
@onready var _party_invite_name: LineEdit = $Root/LeftColumn/Party/Margin/Scroll/VBox/InviteRow/InviteName
@onready var _party_invite_button: Button = $Root/LeftColumn/Party/Margin/Scroll/VBox/InviteRow/InviteButton
@onready var _party_create: Button = $Root/LeftColumn/Party/Margin/Scroll/VBox/ActionRow/CreateButton
@onready var _party_leave: Button = $Root/LeftColumn/Party/Margin/Scroll/VBox/ActionRow/LeaveButton
@onready var _party_kick: Button = $Root/LeftColumn/Party/Margin/Scroll/VBox/ActionRow/KickButton
@onready var _party_promote: Button = $Root/LeftColumn/Party/Margin/Scroll/VBox/ActionRow/PromoteButton
@onready var _party_disband: Button = $Root/LeftColumn/Party/Margin/Scroll/VBox/ActionRow/DisbandButton
@onready var _party_prompt: Label = $Root/LeftColumn/Party/Margin/Scroll/VBox/InvitePrompt/Prompt
@onready var _party_accept: Button = $Root/LeftColumn/Party/Margin/Scroll/VBox/InvitePrompt/AcceptButton
@onready var _party_decline: Button = $Root/LeftColumn/Party/Margin/Scroll/VBox/InvitePrompt/DeclineButton
@onready var _party_chat_history: Label = $Root/LeftColumn/Party/Margin/Scroll/VBox/ChatScroll/ChatHistory
@onready var _party_chat_input: LineEdit = $Root/LeftColumn/Party/Margin/Scroll/VBox/ChatRow/ChatInput
@onready var _party_chat_send: Button = $Root/LeftColumn/Party/Margin/Scroll/VBox/ChatRow/ChatSend

var _inventory_list: Control
var _slot_view: Control
var _attribute_row_fingerprint: String = ""
var _unlock_row_fingerprint: String = ""
var _vendor_panel: PanelContainer
var _vendor_list: ItemList
var _vendor_stock: Array = []
var _inn_panel: PanelContainer
var _cave_panel: PanelContainer
var _settings_panel: PanelContainer
var _settings_rebind_host: VBoxContainer
var _trade_panel: PanelContainer
var _gm_panel: PanelContainer
var _gm_command: OptionButton
var _gm_reason: LineEdit
var _gm_character: LineEdit
var _gm_extra: LineEdit
var _gm_result: Label
var _trade_status: Label
var _trade_mine: ItemList
var _trade_theirs: ItemList
var _trade_gold: LineEdit
var _trade_warning: Label
var _trade_result: Label
var _trade_hint: Label
var _trade_nearby: OptionButton
var _trade_name: LineEdit
var _trade_invite: Button
var _trade_session: VBoxContainer
var _trade_nearby_fingerprint: String = ""
var _last_player_target_id: String = ""


func _ready() -> void:
	_resync.pressed.connect(func() -> void: resync_pressed.emit())
	_logout.pressed.connect(func() -> void: logout_pressed.emit())
	if _settings_button != null:
		_settings_button.pressed.connect(_on_settings_pressed)
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
	_build_vendor_panel()
	_build_inn_panel()
	_build_cave_panel()
	ensure_settings_panel()
	if OS.is_debug_build():
		_build_gm_panel()
		_add_gm_button()
		if not GmService.command_finished.is_connected(_on_gm_finished):
			GmService.command_finished.connect(_on_gm_finished)
	if not VendorService.vendor_opened.is_connected(_on_vendor_opened):
		VendorService.vendor_opened.connect(_on_vendor_opened)
	if not VendorService.vendor_closed.is_connected(_hide_vendor):
		VendorService.vendor_closed.connect(_hide_vendor)
	if not InnService.inn_opened.is_connected(_on_inn_opened):
		InnService.inn_opened.connect(_on_inn_opened)
	if not InnService.inn_closed.is_connected(_hide_inn):
		InnService.inn_closed.connect(_hide_inn)
	if not CaveService.cave_opened.is_connected(_on_cave_opened):
		CaveService.cave_opened.connect(_on_cave_opened)
	if not CaveService.cave_closed.is_connected(_hide_cave):
		CaveService.cave_closed.connect(_hide_cave)
	_bind_party_panel()
	refresh_party()
	_build_trade_panel()
	if not TradeService.trade_changed.is_connected(refresh_trade):
		TradeService.trade_changed.connect(refresh_trade)
	if not TradeService.trade_notice.is_connected(_on_trade_notice):
		TradeService.trade_notice.connect(_on_trade_notice)
	refresh_trade()


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
		refresh_party()
		return
	if snapshot_stale:
		_status.text = "Connection degraded. Remote movement is frozen."
	elif AppState.is_reconnecting:
		_status.text = "Reconnecting…"
	else:
		_status.text = "In %s as %s (you). Tick %s. Ack seq %s." % [
			String(state.get("zone_id", "zone.starter")),
			_local_name(state),
			str(state.get("tick", 0)),
			str(state.get("ack_seq", 0)),
		]
		var instance: Variant = state.get("instance", {})
		if typeof(instance) == TYPE_DICTIONARY:
			var info: Dictionary = instance
			if String(info.get("type", "")) == "party_cave":
				var completion := String(info.get("completionState", "none"))
				var boss_alive := bool(info.get("bossAlive", false))
				if completion == "boss_defeated":
					_status.text += " Cave: boss defeated."
				elif boss_alive:
					_status.text += " Cave: defeat the boss."
				else:
					_status.text += " Cave: clear the instance."
	_entities.text = "Present: %s" % ", ".join(names)
	_refresh_health(state)
	_refresh_target_frame(state)
	refresh_journal(QuestService.journal_view())
	refresh_equipment()
	refresh_wallet()
	refresh_progression()
	refresh_party()
	_refresh_trade_nearby(state)
	refresh_trade()


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


func has_party_input_focus() -> bool:
	if _party_invite_name != null and _party_invite_name.has_focus():
		return true
	if _party_chat_input != null and _party_chat_input.has_focus():
		return true
	if _trade_name != null and _trade_name.has_focus():
		return true
	if _trade_gold != null and _trade_gold.has_focus():
		return true
	return false


func refresh_party() -> void:
	if _party_status == null:
		return
	if _party_chat_history != null:
		_party_chat_history.text = "\n".join(PartyService.chat_lines)
	var invite: Dictionary = PartyService.pending_invite
	var has_invite := not String(invite.get("partyId", "")).is_empty()
	var invite_from := String(invite.get("fromDisplayName", invite.get("fromCharacterId", "a player")))
	if _party_prompt != null:
		if has_invite and PartyService.is_in_party():
			_party_prompt.text = "Accept will leave your party and join %s." % invite_from
		elif has_invite:
			_party_prompt.text = "Invite to party from %s." % invite_from
		else:
			_party_prompt.text = ""
	if _party_accept != null:
		_party_accept.visible = has_invite
	if _party_decline != null:
		_party_decline.visible = has_invite
	if not PartyService.is_in_party():
		_party_status.text = "No party. Create first, then type their character name to Invite."
		if PartyService.last_error == "party_full":
			_party_status.text = "The party is full (max 5)."
		if _party_members != null:
			_party_members.clear()
		if _party_create != null:
			_party_create.disabled = false
			_party_create.visible = true
		if _party_leave != null:
			_party_leave.disabled = true
		if _party_kick != null:
			_party_kick.disabled = true
		if _party_promote != null:
			_party_promote.disabled = true
		if _party_disband != null:
			_party_disband.disabled = true
			_party_disband.visible = false
		if _party_invite_button != null:
			_party_invite_button.disabled = true
		return
	if PartyService.is_full():
		_party_status.text = "Party full (5/5)."
	else:
		_party_status.text = "Party %s/%s." % [str(PartyService.member_count()), str(PartyService.MAX_SIZE)]
	if _party_members != null:
		_party_members.clear()
		for entry in PartyService.party.get("members", []):
			if typeof(entry) != TYPE_DICTIONARY:
				continue
			var member: Dictionary = entry
			var line := String(member.get("displayName", member.get("characterId", "member")))
			if bool(member.get("isLeader", false)):
				line = "* " + line
			var health := int(member.get("health", -1))
			var max_health := int(member.get("maxHealth", 0))
			if health >= 0 and max_health > 0:
				line += "  %s/%s" % [str(health), str(max_health)]
			var resources: Variant = member.get("resources", {})
			if typeof(resources) == TYPE_DICTIONARY:
				for resource_id in (resources as Dictionary).keys():
					var pool: Variant = resources[resource_id]
					if typeof(pool) != TYPE_DICTIONARY:
						continue
					line += "  %s %s/%s" % [
						String(resource_id),
						str(int(pool.get("current", 0))),
						str(int(pool.get("max", 0))),
					]
					break
			line += "  %s" % String(member.get("connectionState", "online"))
			_party_members.add_item(line)
			_party_members.set_item_metadata(_party_members.item_count - 1, String(member.get("characterId", "")))
	var leader := PartyService.is_leader()
	if _party_create != null:
		_party_create.disabled = true
		_party_create.visible = false
	if _party_leave != null:
		_party_leave.disabled = false
	if _party_kick != null:
		_party_kick.disabled = not leader
	if _party_promote != null:
		_party_promote.disabled = not leader
	if _party_disband != null:
		_party_disband.visible = true
		_party_disband.disabled = not leader
	if _party_invite_button != null:
		_party_invite_button.disabled = not leader or PartyService.is_full()


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


func _on_party_notice(message: String) -> void:
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
			if not (button as Button).mouse_entered.is_connected(_on_hotbar_hover):
				(button as Button).mouse_entered.connect(_on_hotbar_hover.bind(i))
				(button as Button).mouse_exited.connect(func() -> void: TooltipService.hide_tooltip())


func _on_hotbar_pressed(slot_index: int) -> void:
	AbilityService.try_hotbar(slot_index)


func _on_hotbar_hover(slot_index: int) -> void:
	var ability_id := ""
	if slot_index < AbilityService.hotbar.size():
		ability_id = String(AbilityService.hotbar[slot_index])
	if ability_id.is_empty():
		TooltipService.show_tooltip("Hotbar %s" % str(slot_index + 1))
		return
	var definition := AbilityService.ability_definition(ability_id)
	TooltipService.show_tooltip(String(definition.get("displayName", ability_id)))


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
	var shown: PackedStringArray = PackedStringArray()
	var parts := PackedStringArray()
	parts.append(str(ProgressionService.unspent_skill_points))
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
		var disabled := ProgressionService.unspent_skill_points < cost
		shown.append(ability_id)
		parts.append("%s:%s:%s:%s" % [ability_id, str(rank), str(int(unlocked)), str(int(disabled))])
	var fingerprint := "|".join(parts)
	if fingerprint == _unlock_row_fingerprint:
		return
	_unlock_row_fingerprint = fingerprint
	_trim_container(_progression_unlocks, shown.size())
	for i in shown.size():
		var ability_id := shown[i]
		var row := _row_at(_progression_unlocks, i)
		if row.get_child_count() < 2:
			continue
		row.set_meta("ability_id", ability_id)
		var definition := AbilityService.ability_definition(ability_id)
		var cost := int(definition.get("skillPointCost", 0))
		var label: Label = row.get_child(0)
		label.text = String(definition.get("displayName", ability_id))
		var button: Button = row.get_child(1)
		button.text = "Unlock %s" % str(cost)
		button.disabled = ProgressionService.unspent_skill_points < cost


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
	var ids := ProgressionService.attribute_ids()
	_trim_container(_progression_attributes, ids.size())
	for i in ids.size():
		var attribute_id := ids[i]
		var row := _row_at(_progression_attributes, i)
		if row.get_child_count() < 2:
			continue
		row.set_meta("attribute_id", attribute_id)
		var record: Dictionary = ContentRegistry.get_by_id(attribute_id)
		var label_name := String(record.get("displayName", attribute_id))
		var base_value := int(ProgressionService.base_attributes.get(attribute_id, 0))
		var allocated := int(ProgressionService.allocated_attributes.get(attribute_id, 0))
		var label: Label = row.get_child(0)
		label.text = "%s  base %s  alloc %s" % [label_name, str(base_value), str(allocated)]
		var button: Button = row.get_child(1)
		button.disabled = ProgressionService.unspent_attribute_points < 1


func _trim_container(host: VBoxContainer, keep: int) -> void:
	while host.get_child_count() > keep:
		var extra := host.get_child(host.get_child_count() - 1)
		host.remove_child(extra)
		extra.queue_free()


func _row_at(host: VBoxContainer, index: int) -> HBoxContainer:
	if index < host.get_child_count():
		return host.get_child(index)
	var row := HBoxContainer.new()
	row.mouse_filter = Control.MOUSE_FILTER_STOP
	var label := Label.new()
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var button := Button.new()
	button.mouse_filter = Control.MOUSE_FILTER_STOP
	button.focus_mode = Control.FOCUS_CLICK
	if host == _progression_unlocks:
		button.custom_minimum_size = Vector2(72, 28)
		button.pressed.connect(_on_unlock_row_pressed.bind(row))
	else:
		button.text = "+1"
		button.custom_minimum_size = Vector2(40, 28)
		button.pressed.connect(_on_allocate_row_pressed.bind(row))
	row.add_child(label)
	row.add_child(button)
	host.add_child(row)
	return row


func _on_allocate_row_pressed(row: Control) -> void:
	var attribute_id := String(row.get_meta("attribute_id", ""))
	if attribute_id.is_empty():
		return
	ProgressionService.request_allocate(attribute_id, 1)


func _on_unlock_row_pressed(row: Control) -> void:
	var ability_id := String(row.get_meta("ability_id", ""))
	if ability_id.is_empty():
		return
	AbilityService.request_unlock(ability_id)


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
		_last_player_target_id = target_id
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


func _build_vendor_panel() -> void:
	_vendor_panel = PanelContainer.new()
	_vendor_panel.name = "VendorPanel"
	_vendor_panel.visible = false
	_vendor_panel.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	_vendor_panel.offset_left = -280.0
	_vendor_panel.offset_top = -260.0
	_vendor_panel.offset_right = -16.0
	_vendor_panel.offset_bottom = -16.0
	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 8)
	margin.add_theme_constant_override("margin_top", 8)
	margin.add_theme_constant_override("margin_right", 8)
	margin.add_theme_constant_override("margin_bottom", 8)
	_vendor_panel.add_child(margin)
	var vbox := VBoxContainer.new()
	margin.add_child(vbox)
	var title := Label.new()
	title.text = "Vendor"
	vbox.add_child(title)
	_vendor_list = ItemList.new()
	_vendor_list.custom_minimum_size = Vector2(240, 140)
	vbox.add_child(_vendor_list)
	var buttons := HBoxContainer.new()
	vbox.add_child(buttons)
	var buy := Button.new()
	buy.text = "Buy"
	buy.pressed.connect(_on_vendor_buy)
	buttons.add_child(buy)
	var sell := Button.new()
	sell.text = "Sell selected"
	sell.pressed.connect(_on_vendor_sell)
	buttons.add_child(sell)
	var close := Button.new()
	close.text = "Close"
	close.pressed.connect(_hide_vendor)
	buttons.add_child(close)
	add_child(_vendor_panel)


func _on_vendor_opened(_npc_id: String, vendor_id: String) -> void:
	_vendor_stock = VendorService.stock_entries(vendor_id)
	if _vendor_list != null:
		_vendor_list.clear()
		for entry in _vendor_stock:
			if typeof(entry) != TYPE_DICTIONARY:
				continue
			var item_id := String(entry.get("itemId", ""))
			var item: Dictionary = ContentRegistry.get_by_id(item_id)
			var label := String(item.get("displayName", item_id))
			_vendor_list.add_item("%s — %sg" % [label, str(int(entry.get("buyPrice", 0)))])
	if _vendor_panel != null:
		_vendor_panel.visible = true
	WindowManager.open(WindowManager.VENDOR)


func _hide_vendor() -> void:
	if _vendor_panel != null:
		_vendor_panel.visible = false
	WindowManager.close(WindowManager.VENDOR)


func _on_vendor_buy() -> void:
	if _vendor_list == null or _vendor_list.get_selected_items().is_empty():
		return
	var index := int(_vendor_list.get_selected_items()[0])
	if index < 0 or index >= _vendor_stock.size():
		return
	var entry: Variant = _vendor_stock[index]
	if typeof(entry) != TYPE_DICTIONARY:
		return
	VendorService.request_buy(String(entry.get("itemId", "")), 1)


func _on_vendor_sell() -> void:
	var instance_id := InventoryService.selected_instance_id
	if instance_id.is_empty():
		return
	VendorService.request_sell(instance_id)


func _bind_party_panel() -> void:
	if _party_create != null and not _party_create.pressed.is_connected(_on_party_create):
		_party_create.pressed.connect(_on_party_create)
	if _party_leave != null and not _party_leave.pressed.is_connected(_on_party_leave):
		_party_leave.pressed.connect(_on_party_leave)
	if _party_kick != null and not _party_kick.pressed.is_connected(_on_party_kick):
		_party_kick.pressed.connect(_on_party_kick)
	if _party_promote != null and not _party_promote.pressed.is_connected(_on_party_promote):
		_party_promote.pressed.connect(_on_party_promote)
	if _party_disband != null and not _party_disband.pressed.is_connected(_on_party_disband):
		_party_disband.pressed.connect(_on_party_disband)
	if _party_invite_button != null and not _party_invite_button.pressed.is_connected(_on_party_invite):
		_party_invite_button.pressed.connect(_on_party_invite)
	if _party_accept != null and not _party_accept.pressed.is_connected(_on_party_accept):
		_party_accept.pressed.connect(_on_party_accept)
	if _party_decline != null and not _party_decline.pressed.is_connected(_on_party_decline):
		_party_decline.pressed.connect(_on_party_decline)
	if _party_chat_send != null and not _party_chat_send.pressed.is_connected(_on_party_chat_send):
		_party_chat_send.pressed.connect(_on_party_chat_send)
	if _party_chat_input != null and not _party_chat_input.text_submitted.is_connected(_on_party_chat_submitted):
		_party_chat_input.text_submitted.connect(_on_party_chat_submitted)
	if _party_invite_name != null:
		_party_invite_name.max_length = 24
		_party_invite_name.placeholder_text = "Exact character name"
	if _party_chat_input != null:
		_party_chat_input.max_length = ZoneChat.MAX_CHARS
	if not PartyService.party_changed.is_connected(refresh_party):
		PartyService.party_changed.connect(refresh_party)
	if not PartyService.party_notice.is_connected(_on_party_notice):
		PartyService.party_notice.connect(_on_party_notice)


func _build_trade_panel() -> void:
	_trade_panel = PanelContainer.new()
	_trade_panel.name = "TradePanel"
	_trade_panel.clip_contents = true
	_trade_panel.mouse_filter = Control.MOUSE_FILTER_STOP
	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 8)
	margin.add_theme_constant_override("margin_top", 6)
	margin.add_theme_constant_override("margin_right", 8)
	margin.add_theme_constant_override("margin_bottom", 6)
	_trade_panel.add_child(margin)
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	margin.add_child(scroll)
	var vbox := VBoxContainer.new()
	vbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	vbox.add_theme_constant_override("separation", 4)
	scroll.add_child(vbox)
	var title := Label.new()
	title.text = "Trade"
	vbox.add_child(title)
	_trade_hint = Label.new()
	_trade_hint.name = "Hint"
	_trade_hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_trade_hint.text = "Must be within 80 pixels and out of combat. Type a name, pick Nearby, or click them. Not the Party box."
	vbox.add_child(_trade_hint)
	_trade_nearby = OptionButton.new()
	_trade_nearby.name = "Nearby"
	_trade_nearby.item_selected.connect(_on_trade_nearby_selected)
	vbox.add_child(_trade_nearby)
	var invite_row := HBoxContainer.new()
	invite_row.name = "InviteRow"
	vbox.add_child(invite_row)
	_trade_name = LineEdit.new()
	_trade_name.name = "TradeName"
	_trade_name.placeholder_text = "Character name"
	_trade_name.max_length = 24
	_trade_name.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_trade_name.text_submitted.connect(_on_trade_name_submitted)
	invite_row.add_child(_trade_name)
	_trade_invite = Button.new()
	_trade_invite.name = "InviteButton"
	_trade_invite.text = "Invite"
	_trade_invite.pressed.connect(_on_trade_invite)
	invite_row.add_child(_trade_invite)
	_trade_status = Label.new()
	_trade_status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	vbox.add_child(_trade_status)
	_trade_session = VBoxContainer.new()
	_trade_session.name = "Session"
	_trade_session.visible = false
	_trade_session.add_theme_constant_override("separation", 4)
	vbox.add_child(_trade_session)
	_trade_warning = Label.new()
	_trade_warning.visible = false
	_trade_warning.text = "Offer changed. Acceptances were cleared."
	_trade_session.add_child(_trade_warning)
	var columns := HBoxContainer.new()
	_trade_session.add_child(columns)
	var mine_box := VBoxContainer.new()
	mine_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	columns.add_child(mine_box)
	var mine_label := Label.new()
	mine_label.text = "You offer"
	mine_box.add_child(mine_label)
	_trade_mine = ItemList.new()
	_trade_mine.custom_minimum_size = Vector2(120, 72)
	mine_box.add_child(_trade_mine)
	var theirs_box := VBoxContainer.new()
	theirs_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	columns.add_child(theirs_box)
	var theirs_label := Label.new()
	theirs_label.text = "They offer"
	theirs_box.add_child(theirs_label)
	_trade_theirs = ItemList.new()
	_trade_theirs.custom_minimum_size = Vector2(120, 72)
	theirs_box.add_child(_trade_theirs)
	var gold_row := HBoxContainer.new()
	_trade_session.add_child(gold_row)
	var gold_label := Label.new()
	gold_label.text = "Gold"
	gold_row.add_child(gold_label)
	_trade_gold = LineEdit.new()
	_trade_gold.placeholder_text = "0"
	_trade_gold.custom_minimum_size = Vector2(60, 0)
	gold_row.add_child(_trade_gold)
	var set_gold := Button.new()
	set_gold.text = "Set gold"
	set_gold.pressed.connect(_on_trade_set_gold)
	gold_row.add_child(set_gold)
	var offer_row := HBoxContainer.new()
	_trade_session.add_child(offer_row)
	var offer := Button.new()
	offer.text = "Offer selected item"
	offer.pressed.connect(_on_trade_offer)
	offer_row.add_child(offer)
	var action_row := HBoxContainer.new()
	_trade_session.add_child(action_row)
	var accept := Button.new()
	accept.text = "Accept"
	accept.pressed.connect(_on_trade_accept)
	action_row.add_child(accept)
	var decline := Button.new()
	decline.text = "Decline"
	decline.pressed.connect(_on_trade_decline)
	action_row.add_child(decline)
	var cancel := Button.new()
	cancel.text = "Cancel"
	cancel.pressed.connect(_on_trade_cancel)
	action_row.add_child(cancel)
	_trade_result = Label.new()
	_trade_result.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	vbox.add_child(_trade_result)
	var column: Control = $Root/LeftColumn
	column.add_child(_trade_panel)
	column.move_child(_trade_panel, 1)
	_trade_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_trade_panel.size_flags_vertical = Control.SIZE_FILL
	_refresh_trade_nearby({})
	_layout_trade_panel()


func refresh_trade() -> void:
	if _trade_status == null:
		return
	if _trade_result != null:
		if not TradeService.last_error.is_empty():
			_trade_result.text = "Error: %s" % TradeService.message_for_code(TradeService.last_error)
		elif not TradeService.last_result.is_empty():
			_trade_result.text = TradeService.last_result
		else:
			_trade_result.text = ""
	if _trade_warning != null:
		_trade_warning.visible = TradeService.offer_changed
	_layout_trade_panel()
	if not TradeService.is_trading() and String(TradeService.trade.get("state", "")).is_empty():
		_trade_status.text = "No active trade."
		if _trade_session != null:
			_trade_session.visible = false
		if _trade_mine != null:
			_trade_mine.clear()
		if _trade_theirs != null:
			_trade_theirs.clear()
		return
	if _trade_session != null:
		_trade_session.visible = true
	var state := String(TradeService.trade.get("state", ""))
	_trade_status.text = "Trade %s  revision %s" % [state, str(TradeService.revision())]
	_fill_trade_offers()


func _fill_trade_offers() -> void:
	if _trade_mine == null or _trade_theirs == null:
		return
	_trade_mine.clear()
	_trade_theirs.clear()
	var local_id := String(AppState.character_view.get("character_id", ""))
	var participant_a: Variant = TradeService.trade.get("participantA", {})
	var participant_b: Variant = TradeService.trade.get("participantB", {})
	var id_a := ""
	var id_b := ""
	if typeof(participant_a) == TYPE_DICTIONARY:
		id_a = String((participant_a as Dictionary).get("characterId", ""))
	if typeof(participant_b) == TYPE_DICTIONARY:
		id_b = String((participant_b as Dictionary).get("characterId", ""))
	var offers: Variant = TradeService.trade.get("offers", {})
	var offer_map: Dictionary = offers if typeof(offers) == TYPE_DICTIONARY else {}
	var gold_offers: Variant = TradeService.trade.get("goldOffers", {})
	var gold_map: Dictionary = gold_offers if typeof(gold_offers) == TYPE_DICTIONARY else {}
	_fill_offer_list(_trade_mine, local_id, offer_map, gold_map)
	var other_id := id_b if local_id == id_a else id_a
	_fill_offer_list(_trade_theirs, other_id, offer_map, gold_map)
	var accepted: Variant = TradeService.trade.get("acceptanceRevisionByParticipant", {})
	if typeof(accepted) == TYPE_DICTIONARY:
		var revision := TradeService.revision()
		var mine_rev := int((accepted as Dictionary).get(local_id, 0))
		var theirs_rev := int((accepted as Dictionary).get(other_id, 0))
		_trade_status.text += "  you:%s  them:%s" % [
			"accepted" if mine_rev == revision and revision > 0 else "not accepted",
			"accepted" if theirs_rev == revision and revision > 0 else "not accepted",
		]


func _fill_offer_list(target: ItemList, character_id: String, offer_map: Dictionary, gold_map: Dictionary) -> void:
	if character_id.is_empty():
		return
	var lines: Variant = offer_map.get(character_id, [])
	if typeof(lines) == TYPE_ARRAY:
		for line in lines:
			if typeof(line) != TYPE_DICTIONARY:
				continue
			target.add_item("%s x%s" % [String(line.get("itemId", "")), str(int(line.get("quantity", 0)))])
	var gold := int(gold_map.get(character_id, 0))
	if gold > 0:
		target.add_item("%sg" % str(gold))


func _layout_trade_panel() -> void:
	if _trade_panel == null:
		return
	_trade_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	if TradeService.is_trading():
		_trade_panel.custom_minimum_size = Vector2(0, 220)
	else:
		_trade_panel.custom_minimum_size = Vector2(0, 148)


func _player_record(user_id: String, state: Dictionary) -> Dictionary:
	if user_id.is_empty():
		return {}
	for entry in state.get("players", []):
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		var record: Dictionary = entry
		var found := String(record.get("userId", record.get("user_id", "")))
		if found == user_id:
			return record
	return {}


func _player_position(record: Dictionary) -> Vector2:
	return Vector2(float(record.get("x", 0.0)), float(record.get("y", 0.0)))


func _in_trade_range(a: Dictionary, b: Dictionary) -> bool:
	return _player_position(a).distance_squared_to(_player_position(b)) <= TRADE_RANGE_PX * TRADE_RANGE_PX


func _trade_invite_block_reason(target_id: String) -> String:
	var zone: Dictionary = AppState.zone_view
	var self_id := String(zone.get("self_id", ""))
	var self_record := _player_record(self_id, zone)
	var other := _player_record(target_id, zone)
	if other.is_empty():
		return ""
	if int(other.get("health", 1)) <= 0:
		return "They have to be alive to trade."
	if bool(self_record.get("inCombat", false)) or bool(other.get("inCombat", false)):
		return "Leave combat first (a few seconds after the last hit), then Invite."
	if not self_record.is_empty() and not _in_trade_range(self_record, other):
		return "Walk next to them (within 80 pixels), then Invite."
	return ""


func _refresh_trade_nearby(state: Dictionary) -> void:
	if _trade_nearby == null:
		return
	var self_id := String(state.get("self_id", ""))
	var self_record := _player_record(self_id, state)
	var ids: PackedStringArray = PackedStringArray()
	var names: PackedStringArray = PackedStringArray()
	var others := 0
	for entry in state.get("players", []):
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		var record: Dictionary = entry
		var user_id := String(record.get("userId", record.get("user_id", "")))
		if user_id.is_empty() or user_id == self_id:
			continue
		if record.has("alive") and not bool(record.get("alive", true)):
			continue
		if int(record.get("health", 1)) <= 0:
			continue
		others += 1
		if not self_record.is_empty() and not _in_trade_range(self_record, record):
			continue
		var named := String(record.get("name", ""))
		if named.is_empty():
			named = user_id
		ids.append(user_id)
		names.append(named)
	var fingerprint := "%s#%d" % [",".join(ids), others]
	if fingerprint == _trade_nearby_fingerprint and _trade_nearby.item_count == ids.size() + 1:
		return
	var keep := _last_player_target_id
	_trade_nearby_fingerprint = fingerprint
	_trade_nearby.clear()
	_trade_nearby.add_item("Nearby players")
	_trade_nearby.set_item_metadata(0, "")
	for i in range(ids.size()):
		_trade_nearby.add_item(names[i])
		_trade_nearby.set_item_metadata(i + 1, ids[i])
	if ids.is_empty():
		if _trade_hint != null and others > 0:
			_trade_hint.text = "Nobody in trade range. Walk within 80 pixels, then Invite."
		return
	if ids.size() == 1:
		_trade_nearby.select(1)
		_last_player_target_id = ids[0]
		if _trade_name != null and _trade_name.text.strip_edges().is_empty():
			_trade_name.text = names[0]
		if _trade_hint != null:
			_trade_hint.text = "Selected %s. Stay within 80 pixels and out of combat, then Invite." % names[0]
		return
	_select_nearby_user(keep)


func _select_nearby_user(user_id: String) -> void:
	if _trade_nearby == null or user_id.is_empty():
		return
	for i in range(_trade_nearby.item_count):
		if String(_trade_nearby.get_item_metadata(i)) != user_id:
			continue
		_trade_nearby.select(i)
		return


func resolve_trade_target_id(query: String = "", state: Dictionary = {}) -> String:
	var zone: Dictionary = state
	if zone.is_empty():
		zone = AppState.zone_view
	var self_id := String(zone.get("self_id", ""))
	var trimmed := query.strip_edges()
	if not trimmed.is_empty():
		var exact := ""
		var prefix_id := ""
		var prefix_count := 0
		var needle := trimmed.to_lower()
		for entry in zone.get("players", []):
			if typeof(entry) != TYPE_DICTIONARY:
				continue
			var record: Dictionary = entry
			var user_id := String(record.get("userId", record.get("user_id", "")))
			if user_id.is_empty() or user_id == self_id:
				continue
			var named := String(record.get("name", "")).to_lower()
			if named.is_empty():
				continue
			if named == needle:
				exact = user_id
				break
			if named.begins_with(needle):
				prefix_count += 1
				prefix_id = user_id
		if not exact.is_empty():
			return exact
		if prefix_count == 1:
			return prefix_id
		return ""
	if _trade_nearby != null:
		var idx := _trade_nearby.selected
		if idx >= 0 and idx < _trade_nearby.item_count:
			var from_list := String(_trade_nearby.get_item_metadata(idx))
			if not from_list.is_empty():
				return from_list
	return _last_player_target_id


func select_player_for_trade(user_id: String, display_name: String = "") -> void:
	if user_id.is_empty():
		return
	_last_player_target_id = user_id
	if _trade_name != null and not display_name.is_empty():
		_trade_name.text = display_name
	_select_nearby_user(user_id)
	if _trade_hint != null and not display_name.is_empty():
		_trade_hint.text = "Selected %s. Stay within 80 pixels and out of combat, then Invite." % display_name


func _on_trade_nearby_selected(index: int) -> void:
	if _trade_nearby == null or index < 0 or index >= _trade_nearby.item_count:
		return
	var user_id := String(_trade_nearby.get_item_metadata(index))
	if user_id.is_empty():
		return
	select_player_for_trade(user_id, _trade_nearby.get_item_text(index))


func _on_trade_name_submitted(_text: String) -> void:
	_on_trade_invite()


func _on_trade_invite() -> void:
	var typed := ""
	if _trade_name != null:
		typed = _trade_name.text
	var target := resolve_trade_target_id(typed)
	if target.is_empty():
		show_notice("Type a nearby character name, pick Nearby, or click them, then Invite.")
		return
	var blocked := _trade_invite_block_reason(target)
	if not blocked.is_empty():
		show_notice(blocked)
		return
	_last_player_target_id = target
	TradeService.request_invite(target)


func _on_trade_offer() -> void:
	var instance_id := InventoryService.selected_instance_id
	if instance_id.is_empty():
		show_notice("Select an inventory item, then Offer selected item.")
		return
	if not TradeService.is_trading():
		show_notice("Start a trade before offering items.")
		return
	TradeService.request_set_offer(instance_id)


func _on_trade_set_gold() -> void:
	if _trade_gold == null:
		return
	TradeService.request_set_gold(int(_trade_gold.text))


func _on_trade_accept() -> void:
	var state := String(TradeService.trade.get("state", ""))
	if state == "inviting":
		TradeService.request_accept_invite()
		return
	TradeService.request_accept_revision()


func _on_trade_decline() -> void:
	TradeService.request_decline_invite()


func _on_trade_cancel() -> void:
	TradeService.request_cancel()


func _on_trade_notice(message: String) -> void:
	show_notice(message)


func _selected_party_character_id() -> String:
	if _party_members == null:
		return ""
	var selected: PackedInt32Array = _party_members.get_selected_items()
	if selected.is_empty():
		return ""
	return String(_party_members.get_item_metadata(selected[0]))


func _on_party_create() -> void:
	PartyService.request_create()


func _on_party_leave() -> void:
	PartyService.request_leave()


func _on_party_kick() -> void:
	PartyService.request_kick(_selected_party_character_id())


func _on_party_promote() -> void:
	PartyService.request_promote(_selected_party_character_id())


func _on_party_disband() -> void:
	PartyService.request_disband()


func _on_party_invite() -> void:
	if not PartyService.is_in_party():
		show_notice("Create a party first, then type their character name and Invite.")
		return
	if not PartyService.is_leader():
		show_notice("Only the party leader can invite.")
		return
	var named := ""
	if _party_invite_name != null:
		named = _party_invite_name.text.strip_edges()
	if named.is_empty():
		show_notice("Type the other character's exact name, then Invite.")
		return
	PartyService.request_invite(named)


func _on_party_accept() -> void:
	PartyService.request_accept()


func _on_party_decline() -> void:
	PartyService.request_decline()


func _on_party_chat_submitted(_text: String) -> void:
	_on_party_chat_send()


func _on_party_chat_send() -> void:
	if _party_chat_input == null:
		return
	var text := _party_chat_input.text
	_party_chat_input.clear()
	await PartyService.send_chat(text)


func set_panel_visible(window_id: String, visible: bool) -> void:
	var node := _panel_node(window_id)
	if node != null:
		node.visible = visible


func ensure_settings_panel() -> void:
	if _settings_panel != null:
		_refresh_settings_panel()
		return
	_settings_panel = PanelContainer.new()
	_settings_panel.name = "SettingsPanel"
	_settings_panel.visible = false
	_settings_panel.set_anchors_preset(Control.PRESET_CENTER)
	_settings_panel.offset_left = -220.0
	_settings_panel.offset_top = -240.0
	_settings_panel.offset_right = 220.0
	_settings_panel.offset_bottom = 240.0
	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 10)
	margin.add_theme_constant_override("margin_top", 8)
	margin.add_theme_constant_override("margin_right", 10)
	margin.add_theme_constant_override("margin_bottom", 8)
	_settings_panel.add_child(margin)
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	margin.add_child(scroll)
	var vbox := VBoxContainer.new()
	vbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(vbox)
	var title := Label.new()
	title.text = "Settings"
	vbox.add_child(title)
	vbox.add_child(_labeled_slider("Master", AudioSettingsService.master_volume, func(v: float) -> void: AudioSettingsService.set_master_volume(v)))
	vbox.add_child(_labeled_slider("Music", AudioSettingsService.music_volume, func(v: float) -> void: AudioSettingsService.set_music_volume(v)))
	vbox.add_child(_labeled_slider("Effects", AudioSettingsService.effects_volume, func(v: float) -> void: AudioSettingsService.set_effects_volume(v)))
	var mute := CheckBox.new()
	mute.text = "Mute"
	mute.button_pressed = AudioSettingsService.muted
	mute.toggled.connect(func(on: bool) -> void: AudioSettingsService.set_muted(on))
	vbox.add_child(mute)
	var mode := OptionButton.new()
	mode.add_item("Windowed")
	mode.add_item("Fullscreen")
	mode.select(1 if AudioSettingsService.window_mode == "fullscreen" else 0)
	mode.item_selected.connect(func(index: int) -> void: AudioSettingsService.set_window_mode("fullscreen" if index == 1 else "windowed"))
	vbox.add_child(mode)
	var resolution := OptionButton.new()
	resolution.add_item("1280 x 720")
	resolution.add_item("1920 x 1080")
	resolution.select(1 if AudioSettingsService.resolution.x >= 1920 else 0)
	resolution.item_selected.connect(func(index: int) -> void:
		AudioSettingsService.set_resolution(Vector2i(1920, 1080) if index == 1 else Vector2i(1280, 720))
	)
	vbox.add_child(resolution)
	vbox.add_child(_labeled_slider("UI scale", (UiStateService.ui_scale - 0.75) / 0.75, func(v: float) -> void: UiStateService.set_ui_scale(0.75 + v * 0.75)))
	var text_size := OptionButton.new()
	text_size.add_item("Text 12")
	text_size.add_item("Text 16")
	text_size.add_item("Text 22")
	text_size.select(0 if UiStateService.text_size <= 12 else (2 if UiStateService.text_size >= 22 else 1))
	text_size.item_selected.connect(func(index: int) -> void:
		UiStateService.set_text_size(12 if index == 0 else (22 if index == 2 else 16))
	)
	vbox.add_child(text_size)
	_settings_rebind_host = VBoxContainer.new()
	vbox.add_child(_settings_rebind_host)
	var defaults := Button.new()
	defaults.text = "Restore defaults"
	defaults.pressed.connect(func() -> void:
		InputSettingsService.restore_defaults()
		AudioSettingsService.restore_defaults()
		_refresh_settings_panel()
	)
	vbox.add_child(defaults)
	var close := Button.new()
	close.text = "Close"
	close.pressed.connect(func() -> void:
		WindowManager.close(WindowManager.SETTINGS)
		HudController.sync_windows()
	)
	vbox.add_child(close)
	add_child(_settings_panel)
	if not InputSettingsService.bindings_changed.is_connected(_refresh_settings_panel):
		InputSettingsService.bindings_changed.connect(_refresh_settings_panel)
	_refresh_settings_panel()


func _on_settings_pressed() -> void:
	ensure_settings_panel()
	HudController.toggle_panel(WindowManager.SETTINGS)
	if _settings_panel != null:
		_settings_panel.visible = WindowManager.is_open(WindowManager.SETTINGS)


func _labeled_slider(label_text: String, value: float, setter: Callable) -> Control:
	var row := VBoxContainer.new()
	var label := Label.new()
	label.text = label_text
	row.add_child(label)
	var slider := HSlider.new()
	slider.min_value = 0.0
	slider.max_value = 1.0
	slider.step = 0.05
	slider.value = clampf(value, 0.0, 1.0)
	slider.value_changed.connect(func(v: float) -> void: setter.call(v))
	row.add_child(slider)
	return row


func _refresh_settings_panel() -> void:
	if _settings_rebind_host == null:
		return
	for child in _settings_rebind_host.get_children():
		child.queue_free()
	for action in InputSettingsService.bindable_actions():
		var row := HBoxContainer.new()
		var label := Label.new()
		label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		label.text = "%s: %s" % [action, _binding_label(action)]
		row.add_child(label)
		var button := Button.new()
		button.text = "Rebind"
		button.pressed.connect(_on_rebind_pressed.bind(action))
		row.add_child(button)
		_settings_rebind_host.add_child(row)


func _on_rebind_pressed(action: String) -> void:
	InputSettingsService.start_rebind(action)


func _binding_label(action: String) -> String:
	if not InputMap.has_action(action):
		return "unbound"
	var events := InputMap.action_get_events(action)
	if events.is_empty():
		return "unbound"
	var event: InputEvent = events[0]
	if event is InputEventKey:
		return OS.get_keycode_string((event as InputEventKey).physical_keycode)
	return event.as_text()


func _panel_node(window_id: String) -> Control:
	match window_id:
		WindowManager.INVENTORY, WindowManager.EQUIPMENT:
			return get_node_or_null("Root/Inventory")
		WindowManager.CHARACTER, WindowManager.ATTRIBUTES, WindowManager.SKILLS:
			return get_node_or_null("Root/LeftColumn/Progression")
		WindowManager.QUEST_JOURNAL:
			return get_node_or_null("Root/Journal")
		WindowManager.PARTY, WindowManager.PARTY_CHAT:
			return get_node_or_null("Root/LeftColumn/Party")
		WindowManager.TRADE:
			return _trade_panel
		WindowManager.GM:
			return _gm_panel
		WindowManager.SETTINGS:
			return _settings_panel
		WindowManager.VENDOR:
			return _vendor_panel
		WindowManager.INN:
			return _inn_panel
		WindowManager.CAVE:
			return _cave_panel
		_:
			return null


func _add_gm_button() -> void:
	if _settings_button == null:
		return
	var host := _settings_button.get_parent()
	if host == null:
		return
	if host.get_node_or_null("GmButton") != null:
		return
	var button := Button.new()
	button.name = "GmButton"
	button.text = "GM"
	button.pressed.connect(_on_gm_pressed)
	host.add_child(button)


func _on_gm_pressed() -> void:
	if not OS.is_debug_build():
		return
	HudController.toggle_panel(WindowManager.GM)
	if _gm_panel != null:
		_gm_panel.visible = WindowManager.is_open(WindowManager.GM)


func _build_gm_panel() -> void:
	if _gm_panel != null:
		return
	_gm_panel = PanelContainer.new()
	_gm_panel.name = "GmPanel"
	_gm_panel.visible = false
	_gm_panel.set_anchors_preset(Control.PRESET_CENTER_RIGHT)
	_gm_panel.offset_left = -360.0
	_gm_panel.offset_top = -220.0
	_gm_panel.offset_right = -16.0
	_gm_panel.offset_bottom = 220.0
	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 8)
	margin.add_theme_constant_override("margin_top", 8)
	margin.add_theme_constant_override("margin_right", 8)
	margin.add_theme_constant_override("margin_bottom", 8)
	_gm_panel.add_child(margin)
	var vbox := VBoxContainer.new()
	margin.add_child(vbox)
	var title := Label.new()
	title.text = "GM (debug, server-authorized)"
	vbox.add_child(title)
	_gm_command = OptionButton.new()
	var names := [
		"inspect_character",
		"teleport_character",
		"repair_invalid_location",
		"grant_test_item",
		"remove_test_item",
		"grant_test_gold",
		"grant_test_xp",
		"reset_attribute_allocation",
		"reset_skill_allocation",
		"set_quest_state",
		"reset_quest",
		"spawn_enemy",
		"kill_enemy",
		"open_cave",
		"inspect_party",
		"cancel_trade",
		"view_recent_transaction_audit",
	]
	for command_name in names:
		_gm_command.add_item(String(command_name))
	vbox.add_child(_gm_command)
	_gm_reason = LineEdit.new()
	_gm_reason.placeholder_text = "Reason (required)"
	vbox.add_child(_gm_reason)
	_gm_character = LineEdit.new()
	_gm_character.placeholder_text = "Character id"
	vbox.add_child(_gm_character)
	_gm_extra = LineEdit.new()
	_gm_extra.placeholder_text = "itemId / amount / spawnId / x,y"
	vbox.add_child(_gm_extra)
	var run := Button.new()
	run.text = "Run command"
	run.pressed.connect(_on_gm_run)
	vbox.add_child(run)
	_gm_result = Label.new()
	_gm_result.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	vbox.add_child(_gm_result)
	add_child(_gm_panel)


func _on_gm_run() -> void:
	if not OS.is_debug_build() or _gm_command == null:
		return
	var command := _gm_command.get_item_text(_gm_command.selected)
	var extra: Dictionary = {}
	var character_id := _gm_character.text.strip_edges()
	if not character_id.is_empty():
		extra["characterId"] = character_id
	var extra_text := _gm_extra.text.strip_edges()
	if command == "grant_test_item" or command == "remove_test_item":
		extra["itemId"] = extra_text
	elif command == "grant_test_gold" or command == "grant_test_xp":
		extra["amount"] = int(extra_text)
	elif command == "spawn_enemy":
		extra["spawnId"] = extra_text
	elif command == "kill_enemy":
		extra["enemyInstanceId"] = extra_text
	elif command == "set_quest_state" or command == "reset_quest":
		extra["questId"] = extra_text
	elif command == "open_cave" and not extra_text.is_empty():
		extra["zoneTemplateId"] = extra_text
	elif command == "teleport_character":
		var parts := extra_text.split(",")
		if parts.size() >= 2:
			extra["x"] = float(parts[0])
			extra["y"] = float(parts[1])
	GmService.run_command(command, _gm_reason.text, extra)


func _on_gm_finished(payload: Dictionary) -> void:
	if _gm_result == null:
		return
	_gm_result.text = JSON.stringify(payload)


func _build_inn_panel() -> void:
	_inn_panel = PanelContainer.new()
	_inn_panel.name = "InnPanel"
	_inn_panel.visible = false
	_inn_panel.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	_inn_panel.offset_left = -140.0
	_inn_panel.offset_top = -140.0
	_inn_panel.offset_right = 140.0
	_inn_panel.offset_bottom = -16.0
	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 8)
	margin.add_theme_constant_override("margin_top", 8)
	margin.add_theme_constant_override("margin_right", 8)
	margin.add_theme_constant_override("margin_bottom", 8)
	_inn_panel.add_child(margin)
	var vbox := VBoxContainer.new()
	margin.add_child(vbox)
	var title := Label.new()
	title.text = "Inn"
	vbox.add_child(title)
	var rest := Button.new()
	rest.text = "Rest"
	rest.pressed.connect(func() -> void: InnService.request_rest())
	vbox.add_child(rest)
	var heal := Button.new()
	heal.text = "Heal"
	heal.pressed.connect(func() -> void: InnService.request_heal())
	vbox.add_child(heal)
	var close := Button.new()
	close.text = "Close"
	close.pressed.connect(_hide_inn)
	vbox.add_child(close)
	add_child(_inn_panel)


func _on_inn_opened(_npc_id: String) -> void:
	if _inn_panel != null:
		_inn_panel.visible = true
	WindowManager.open(WindowManager.INN)


func _hide_inn() -> void:
	if _inn_panel != null:
		_inn_panel.visible = false
	WindowManager.close(WindowManager.INN)


func _build_cave_panel() -> void:
	_cave_panel = PanelContainer.new()
	_cave_panel.name = "CavePanel"
	_cave_panel.visible = false
	_cave_panel.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	_cave_panel.offset_left = -160.0
	_cave_panel.offset_top = -140.0
	_cave_panel.offset_right = 160.0
	_cave_panel.offset_bottom = -16.0
	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 8)
	margin.add_theme_constant_override("margin_top", 8)
	margin.add_theme_constant_override("margin_right", 8)
	margin.add_theme_constant_override("margin_bottom", 8)
	_cave_panel.add_child(margin)
	var vbox := VBoxContainer.new()
	margin.add_child(vbox)
	var title := Label.new()
	title.text = "Cave"
	vbox.add_child(title)
	var enter := Button.new()
	enter.text = "Enter"
	enter.pressed.connect(func() -> void: CaveService.request_enter())
	vbox.add_child(enter)
	var leave := Button.new()
	leave.text = "Exit"
	leave.pressed.connect(func() -> void: CaveService.request_exit())
	vbox.add_child(leave)
	var close := Button.new()
	close.text = "Close"
	close.pressed.connect(_hide_cave)
	vbox.add_child(close)
	add_child(_cave_panel)


func _on_cave_opened(_npc_id: String, _mode: String) -> void:
	if _cave_panel != null:
		_cave_panel.visible = true
	WindowManager.open(WindowManager.CAVE)


func _hide_cave() -> void:
	if _cave_panel != null:
		_cave_panel.visible = false
	WindowManager.close(WindowManager.CAVE)


