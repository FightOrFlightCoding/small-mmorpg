class_name WorldHud
extends CanvasLayer

signal resync_pressed
signal logout_pressed

@onready var _status: Label = $Root/Margin/VBox/Status
@onready var _entities: Label = $Root/Margin/VBox/Entities
@onready var _health: Label = $Root/Margin/VBox/Health
@onready var _resync: Button = $Root/Margin/VBox/Buttons/ResyncButton
@onready var _logout: Button = $Root/Margin/VBox/Buttons/LogoutButton
@onready var _journal_body: Label = $Root/Journal/Margin/VBox/Body
@onready var _death: Label = $Root/Death
@onready var _inventory_capacity: Label = $Root/Inventory/Margin/VBox/Capacity
@onready var _gold: Label = $Root/Inventory/Margin/VBox/Gold
@onready var _inventory_host: Control = $Root/Inventory/Margin/VBox/ListHost
@onready var _attack: Label = $Root/Inventory/Margin/VBox/Attack
@onready var _main_hand: Label = $Root/Inventory/Margin/VBox/MainHand
@onready var _slot_host: Control = $Root/Inventory/Margin/VBox/SlotHost
@onready var _equip: Button = $Root/Inventory/Margin/VBox/EquipRow/EquipButton
@onready var _unequip: Button = $Root/Inventory/Margin/VBox/EquipRow/UnequipButton
@onready var _notice: Label = $Root/Notice

var _inventory_list: Control
var _slot_view: Control


func _ready() -> void:
	_resync.pressed.connect(func() -> void: resync_pressed.emit())
	_logout.pressed.connect(func() -> void: logout_pressed.emit())
	refresh_journal(QuestService.journal_view())
	_bind_inventory()
	refresh_inventory()
	refresh_equipment()
	refresh_wallet()
	if _equip != null:
		_equip.pressed.connect(_on_equip_pressed)
	if _unequip != null:
		_unequip.pressed.connect(_on_unequip_pressed)
	if not InventoryService.item_activated.is_connected(_on_item_activated):
		InventoryService.item_activated.connect(_on_item_activated)
	if not EquipmentService.equipment_changed.is_connected(refresh_equipment):
		EquipmentService.equipment_changed.connect(refresh_equipment)
	if not WalletService.wallet_changed.is_connected(refresh_wallet):
		WalletService.wallet_changed.connect(refresh_wallet)
	if not WalletService.notice_received.is_connected(_on_notice):
		WalletService.notice_received.connect(_on_notice)


func refresh(state: Dictionary, names: PackedStringArray, snapshot_stale: bool = false) -> void:
	if state.is_empty():
		_status.text = "Waiting for authoritative zone state."
		_entities.text = ""
		if _health != null:
			_health.text = ""
		if _death != null:
			_death.visible = false
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
	refresh_journal(QuestService.journal_view())
	refresh_equipment()
	refresh_wallet()


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


func refresh_wallet() -> void:
	if _gold != null:
		_gold.text = "Gold: %s" % str(WalletService.gold)


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
	EquipmentService.request_equip(instance_id, EquipmentService.MAIN_HAND_SLOT)


func _on_unequip_pressed() -> void:
	EquipmentService.request_unequip(EquipmentService.MAIN_HAND_SLOT)


func _on_item_activated(instance_id: String) -> void:
	if instance_id.is_empty():
		return
	EquipmentService.request_equip(instance_id, EquipmentService.MAIN_HAND_SLOT)


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


func _refresh_health(state: Dictionary) -> void:
	var self_id := String(state.get("self_id", ""))
	var player_hp := "You: --"
	var local_dead := false
	for entry in state.get("players", []):
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		if String(entry.get("userId", "")) != self_id:
			continue
		var health := int(entry.get("health", 0))
		var max_health := int(entry.get("maxHealth", health))
		player_hp = "You: %s / %s" % [str(health), str(max_health)]
		local_dead = health <= 0
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
	if _death != null:
		_death.visible = local_dead
		if local_dead:
			_death.text = "Defeated. Respawning..."


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
