extends Node

## Project-owned GLoot ItemSlot adapter. Canonical equipment and derived attack are server-owned.

signal equipment_changed
signal request_started(request_id: String)

const MAIN_HAND_SLOT := "main_hand"

var slot: ItemSlot
var attack: int = 4
var main_hand_instance_id: String = ""
var selected_slot: String = MAIN_HAND_SLOT
var slots: Dictionary = {"main_hand": ""}
var items: Array = []

var _applying: bool = false
var _ctrl: CtrlItemSlot
var _equip_view: ItemSlotView


func _ready() -> void:
	_ensure_slot()
	if not AppState.zone_state_updated.is_connected(_on_zone_state_updated):
		AppState.zone_state_updated.connect(_on_zone_state_updated)
	if not AppState.logged_out.is_connected(reset):
		AppState.logged_out.connect(reset)
	if not AppState.content_loaded.is_connected(_on_content_loaded):
		AppState.content_loaded.connect(_on_content_loaded)
	if not NetworkService.equipment_state_received.is_connected(_on_equipment_state):
		NetworkService.equipment_state_received.connect(_on_equipment_state)
	if not ContentRegistry.get_content_hash().is_empty():
		configure_from_content()


func reset() -> void:
	attack = 4
	main_hand_instance_id = ""
	selected_slot = MAIN_HAND_SLOT
	slots = {"main_hand": ""}
	items = []
	_ensure_slot()
	_rebuild_slot()
	equipment_changed.emit()


func reset_for_tests() -> void:
	reset()


func configure_from_content() -> void:
	_ensure_slot()
	if InventoryService.mirror != null and InventoryService.mirror.protoset != null:
		slot.protoset = InventoryService.mirror.protoset
	_rebuild_slot()


func apply_canonical(state: Dictionary) -> void:
	var incoming_slots: Dictionary = {}
	var raw_slots: Variant = state.get("slots", {})
	if typeof(raw_slots) == TYPE_DICTIONARY:
		incoming_slots = raw_slots
	var next_slots: Dictionary = {}
	for key in incoming_slots.keys():
		var raw_value: Variant = incoming_slots[key]
		if typeof(raw_value) == TYPE_STRING:
			next_slots[String(key)] = String(raw_value)
		else:
			next_slots[String(key)] = ""
	if not next_slots.has(MAIN_HAND_SLOT):
		next_slots[MAIN_HAND_SLOT] = ""
	slots = next_slots
	main_hand_instance_id = String(slots.get(MAIN_HAND_SLOT, ""))
	items = []
	var raw_items: Variant = state.get("items", [])
	if typeof(raw_items) == TYPE_ARRAY:
		for entry in raw_items:
			if typeof(entry) != TYPE_DICTIONARY:
				continue
			items.append((entry as Dictionary).duplicate(true))
	var derived: Variant = state.get("derived", {})
	if typeof(derived) == TYPE_DICTIONARY:
		attack = int((derived as Dictionary).get("attack", attack))
	_rebuild_slot()
	equipment_changed.emit()


func request_equip(instance_id: String, equip_slot: String = MAIN_HAND_SLOT) -> String:
	if instance_id.is_empty() or equip_slot.is_empty():
		return ""
	selected_slot = equip_slot
	var request_id := MatchProtocol.new_request_id()
	NetworkService.send_equip(instance_id, equip_slot, request_id, InventoryService.expected_revision())
	request_started.emit(request_id)
	return request_id


func request_unequip(equip_slot: String = MAIN_HAND_SLOT) -> String:
	if equip_slot.is_empty():
		return ""
	var request_id := MatchProtocol.new_request_id()
	NetworkService.send_equip("", equip_slot, request_id, InventoryService.expected_revision())
	request_started.emit(request_id)
	return request_id


func equipped_display_name(equip_slot: String = MAIN_HAND_SLOT) -> String:
	var instance_id := String(slots.get(equip_slot, ""))
	if instance_id.is_empty():
		return "Empty"
	var item_id := InventoryService.item_id_of_instance(instance_id)
	if item_id.is_empty():
		item_id = _equipped_item_id(instance_id)
	if item_id.is_empty():
		return "Empty"
	var record: Dictionary = ContentRegistry.get_by_id(item_id)
	var named := String(record.get("displayName", ""))
	if named.is_empty():
		return item_id
	return named


func slot_tags() -> PackedStringArray:
	var tags := PackedStringArray()
	for slot_id in ContentRegistry.ids_of_kind("equipment_slot"):
		var record: Dictionary = ContentRegistry.get_by_id(slot_id)
		var tag := String(record.get("tag", ""))
		if not tag.is_empty() and tags.find(tag) < 0:
			tags.append(tag)
	if tags.is_empty():
		tags.append(MAIN_HAND_SLOT)
	return tags


func item_by_instance(instance_id: String) -> Dictionary:
	if instance_id.is_empty():
		return {}
	for entry in items:
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		if String(entry.get("instanceId", "")) == instance_id:
			return (entry as Dictionary).duplicate(true)
	return {}


func item_id_of_equipped(instance_id: String) -> String:
	return _equipped_item_id(instance_id)


func item_at_tag(equip_slot: String) -> Dictionary:
	var instance_id := String(slots.get(equip_slot, ""))
	if instance_id.is_empty():
		return {}
	var found := item_by_instance(instance_id)
	if not found.is_empty():
		return found
	var item_id := _equipped_item_id(instance_id)
	if item_id.is_empty():
		return {}
	return {"instanceId": instance_id, "itemId": item_id, "quantity": 1}


func attach_slot(host: Control) -> Control:
	_ensure_slot()
	var existing := host.get_node_or_null("Slot")
	if existing != null:
		if existing is CtrlItemSlot:
			(existing as CtrlItemSlot).item_slot = slot
			_ctrl = existing as CtrlItemSlot
		return existing
	var view := CtrlItemSlot.new()
	view.name = "Slot"
	view.set_anchors_preset(Control.PRESET_FULL_RECT)
	view.mouse_filter = Control.MOUSE_FILTER_STOP
	host.add_child(view)
	view.item_slot = slot
	_ctrl = view
	return view


func attach_equipment_slot(host: Control, equip_slot: String = MAIN_HAND_SLOT) -> Control:
	if host == null:
		return null
	var existing := host.get_node_or_null("EquipSlot")
	if existing is ItemSlotView:
		_bind_equipment_view(existing as ItemSlotView, equip_slot)
		return existing
	var view := ItemSlotView.new()
	view.name = "EquipSlot"
	view.set_anchors_preset(Control.PRESET_FULL_RECT)
	host.add_child(view)
	_bind_equipment_view(view, equip_slot)
	WindowManager.connect_once(equipment_changed, _refresh_attached_equipment)
	return view


func _bind_equipment_view(view: ItemSlotView, equip_slot: String) -> void:
	_equip_view = view
	view.origin_kind = "equipment"
	view.slot_index = -1
	view.equipment_tag = equip_slot if not equip_slot.is_empty() else selected_slot
	WindowManager.connect_once(view.slot_pressed, InventoryService.handle_slot_pressed)
	WindowManager.connect_once(view.slot_drag_begun, InventoryService.handle_slot_drag_begun)
	WindowManager.connect_once(view.slot_activated, InventoryService.handle_slot_activated)
	WindowManager.connect_once(view.slot_right_clicked, ItemContextRouter.handle_slot)
	view.refresh(item_at_tag(view.equipment_tag), false)
	WindowManager.connect_once(equipment_changed, _refresh_attached_equipment)


func _refresh_attached_equipment() -> void:
	if _equip_view == null or not is_instance_valid(_equip_view):
		return
	var tag := _equip_view.equipment_tag if not _equip_view.equipment_tag.is_empty() else selected_slot
	_equip_view.refresh(item_at_tag(tag), false)


func _ensure_slot() -> void:
	if slot != null:
		return
	slot = ItemSlot.new()
	slot.name = "MainHandSlot"
	add_child(slot)
	if not slot.item_equipped.is_connected(_on_local_equipped):
		slot.item_equipped.connect(_on_local_equipped)
	if not slot.cleared.is_connected(_on_local_cleared):
		slot.cleared.connect(_on_local_cleared)


func _rebuild_slot() -> void:
	if slot == null:
		return
	_applying = true
	if slot.get_item() != null:
		slot.clear()
	var item_id := InventoryService.item_id_of_instance(main_hand_instance_id)
	if item_id.is_empty():
		item_id = _equipped_item_id(main_hand_instance_id)
	if not item_id.is_empty() and slot.protoset != null:
		var holder := Inventory.new()
		holder.protoset = slot.protoset
		var created: InventoryItem = holder.create_and_add_item(item_id)
		if created != null:
			slot.equip(created)
		holder.free()
	_applying = false


func _on_local_equipped() -> void:
	_revert_unsupported_mutation()


func _on_local_cleared(_item: InventoryItem) -> void:
	_revert_unsupported_mutation()


func _revert_unsupported_mutation() -> void:
	if _applying:
		return
	call_deferred("_rebuild_slot")


func _on_content_loaded(_content_hash: String) -> void:
	configure_from_content()


func _equipped_item_id(instance_id: String) -> String:
	if instance_id.is_empty():
		return ""
	for entry in items:
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		if String(entry.get("instanceId", "")) == instance_id:
			var item_id := String(entry.get("itemId", ""))
			if item_id.is_empty():
				return String(entry.get("definitionId", ""))
			return item_id
	return ""


func _on_zone_state_updated() -> void:
	if not AppState.zone_view_is_full:
		return
	var equipment: Variant = AppState.zone_view.get("equipment", {})
	var derived: Variant = AppState.zone_view.get("derived", {})
	var payload: Dictionary = {}
	if typeof(equipment) == TYPE_DICTIONARY:
		payload = (equipment as Dictionary).duplicate(true)
	if payload.is_empty() and not items.is_empty():
		return
	if typeof(derived) == TYPE_DICTIONARY:
		payload["derived"] = derived
	if payload.is_empty():
		return
	apply_canonical(payload)


func _on_equipment_state(payload: Dictionary) -> void:
	apply_canonical({
		"slots": payload.get("slots", {}),
		"items": payload.get("items", []),
		"derived": payload.get("derived", {}),
	})
