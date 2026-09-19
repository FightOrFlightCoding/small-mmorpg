extends Node

## Project-owned GLoot adapter plus the 30-slot bag. Canonical inventory is server-owned.

signal inventory_changed
signal pending_changed
signal item_activated(instance_id: String)
signal request_started(request_id: String)
signal notice(message: String)

const PENDING_TIMEOUT_SEC := 8.0

var mirror: Inventory
var capacity: int = 30
var revision: int = 0
var items: Array = []
var overflow_items: Array = []
var selected_instance_id: String = ""
var selected_overflow_instance_id: String = ""
var last_request_id: String = ""
var last_reject_code: String = ""
var last_notice: String = ""
var pending: Dictionary = {}
var pending_timeout_sec: float = PENDING_TIMEOUT_SEC

var _constraint: ItemCountConstraint
var _applying: bool = false
var _canonical: Dictionary = {"capacity": 30, "items": [], "overflow": []}
var _has_revision: bool = false
var _pending_timer: Timer
var _split_dialog: SplitStackDialog
var _drop_dialog: GroundDropDialog
var _press_slot: Dictionary = {}


func _ready() -> void:
	_ensure_mirror()
	_ensure_timer()
	WindowManager.connect_once(AppState.zone_state_updated, _on_zone_state_updated)
	WindowManager.connect_once(AppState.logged_out, reset)
	WindowManager.connect_once(AppState.character_loaded, _on_character_loaded)
	WindowManager.connect_once(AppState.content_loaded, _on_content_loaded)
	WindowManager.connect_once(NetworkService.inventory_state_received, _on_inventory_state)
	WindowManager.connect_once(NetworkService.action_result_received, _on_action_result)
	if not ContentRegistry.get_content_hash().is_empty():
		configure_from_content()


func reset() -> void:
	_canonical = {"capacity": 30, "items": [], "overflow": []}
	items = []
	overflow_items = []
	capacity = 30
	revision = 0
	_has_revision = false
	selected_instance_id = ""
	selected_overflow_instance_id = ""
	clear_pending()
	last_reject_code = ""
	last_notice = ""
	_press_slot = {}
	_close_split_dialog()
	_close_drop_dialog()
	_ensure_mirror()
	_rebuild_mirror()
	inventory_changed.emit()


func reset_for_tests() -> void:
	pending_timeout_sec = PENDING_TIMEOUT_SEC
	reset()


func clear_presentation_state() -> void:
	selected_instance_id = ""
	selected_overflow_instance_id = ""
	clear_pending()
	_press_slot = {}
	_close_split_dialog()
	_close_drop_dialog()
	if DragDropService.active:
		DragDropService.cancel()
	TooltipService.hide_tooltip()
	pending_changed.emit()


func configure_from_content() -> void:
	_ensure_mirror()
	var proto := JSON.new()
	var data: Dictionary = {}
	for item_id in ContentRegistry.ids_of_kind("item"):
		var record: Dictionary = ContentRegistry.get_by_id(item_id)
		var entry: Dictionary = {
			"name": String(record.get("displayName", item_id)),
			"max_stack_size": int(record.get("maxStack", 1)),
		}
		var visual: Dictionary = ContentRegistry.resolve_visual(String(record.get("visualId", "")))
		var texture_path := String(visual.get("texture_path", ""))
		if not texture_path.is_empty():
			entry["image"] = texture_path
		data[item_id] = entry
	proto.data = data
	_applying = true
	mirror.protoset = proto
	_applying = false
	if _constraint != null:
		_constraint.capacity = maxi(1, capacity)
	_rebuild_mirror()


func apply_canonical(state: Dictionary) -> void:
	_ensure_mirror()
	capacity = int(state.get("capacity", 30))
	var incoming: Array = []
	var raw: Variant = state.get("items", [])
	if typeof(raw) == TYPE_ARRAY:
		for entry in raw:
			if typeof(entry) != TYPE_DICTIONARY:
				continue
			var item: Dictionary = (entry as Dictionary).duplicate(true)
			if String(item.get("itemId", "")).is_empty():
				continue
			incoming.append(item)
	var overflow_incoming: Array = []
	var overflow_raw: Variant = state.get("overflow", {})
	if typeof(overflow_raw) == TYPE_DICTIONARY:
		var overflow_items_raw: Variant = (overflow_raw as Dictionary).get("items", [])
		if typeof(overflow_items_raw) == TYPE_ARRAY:
			for entry in overflow_items_raw:
				if typeof(entry) != TYPE_DICTIONARY:
					continue
				var overflow_item: Dictionary = (entry as Dictionary).duplicate(true)
				if String(overflow_item.get("itemId", "")).is_empty():
					continue
				overflow_incoming.append(overflow_item)
	revision = int(state.get("revision", 0))
	_has_revision = true
	_canonical = {"capacity": capacity, "items": incoming, "overflow": overflow_incoming, "revision": revision}
	items = incoming.duplicate(true)
	overflow_items = overflow_incoming.duplicate(true)
	if _constraint != null:
		_constraint.capacity = maxi(1, capacity)
	_rebuild_mirror()
	var followup := pending.duplicate(true)
	var request_id := String(state.get("request_id", state.get("requestId", "")))
	if not request_id.is_empty() and request_id == String(pending.get("request_id", "")):
		clear_pending()
	elif not pending.is_empty() and String(pending.get("kind", "")) != "unequip_to":
		clear_pending()
	inventory_changed.emit()
	_maybe_follow_unequip(followup)


func expected_revision() -> int:
	if not _has_revision:
		return -1
	return revision


func occupied_slot_count() -> int:
	return items.size()


func item_at_slot(slot_index: int) -> Dictionary:
	if slot_index < 0 or slot_index >= capacity:
		return {}
	var placed: Dictionary = _placed_items()
	if placed.has(slot_index):
		return (placed[slot_index] as Dictionary).duplicate(true)
	return {}


func _placed_items() -> Dictionary:
	var placed: Dictionary = {}
	var unplaced: Array = []
	for entry in items:
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		var item: Dictionary = entry
		var slot := int(item.get("slotIndex", -1))
		if slot >= 0 and slot < capacity and not placed.has(slot):
			placed[slot] = item
		else:
			unplaced.append(item)
	for item in unplaced:
		for slot in range(capacity):
			if placed.has(slot):
				continue
			var copy: Dictionary = (item as Dictionary).duplicate(true)
			copy["slotIndex"] = slot
			placed[slot] = copy
			break
	return placed


func item_by_instance(instance_id: String) -> Dictionary:
	if instance_id.is_empty():
		return {}
	for entry in items:
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		if String(entry.get("instanceId", "")) == instance_id:
			return (entry as Dictionary).duplicate(true)
	return {}


func first_empty_slot() -> int:
	var used := {}
	for entry in items:
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		var slot := int(entry.get("slotIndex", -1))
		if slot >= 0 and slot < capacity:
			used[slot] = true
	for slot in range(capacity):
		if not bool(used.get(slot, false)):
			return slot
	return -1


func slot_is_pending(slot_index: int) -> bool:
	if pending.is_empty():
		return false
	var slots: Variant = pending.get("slots", [])
	if typeof(slots) != TYPE_ARRAY:
		return false
	return (slots as Array).has(slot_index)


func request_pickup(loot_id: String) -> String:
	if loot_id.is_empty():
		return ""
	var request_id := MatchProtocol.new_request_id()
	NetworkService.send_pickup(loot_id, request_id, expected_revision())
	return request_id


func request_pickup_ground(ground_entity_id: String) -> String:
	if ground_entity_id.is_empty():
		return ""
	var request_id := MatchProtocol.new_request_id()
	NetworkService.send_pickup_ground_item(ground_entity_id, request_id, expected_revision())
	return request_id


func request_ground_drop(instance_id: String, quantity: int = -1, hint_dx: float = 0.0, hint_dy: float = 0.0) -> String:
	if instance_id.is_empty():
		return ""
	var item: Dictionary = item_by_instance(instance_id)
	if item.is_empty():
		_reject_local("item_not_found", "That item is not in the bag.")
		return ""
	if ItemPresentation.is_locked(item):
		_reject_local("item_locked", ItemPresentation.lock_reason(item))
		return ""
	var stack := int(item.get("quantity", 1))
	var drop_qty := quantity if quantity >= 1 else stack
	if drop_qty < 1 or drop_qty > stack:
		_reject_local("invalid_quantity", "Choose a drop quantity between 1 and the stack.")
		return ""
	var request_id := MatchProtocol.new_request_id()
	NetworkService.send_drop_item(instance_id, request_id, drop_qty, expected_revision(), hint_dx, hint_dy)
	_begin_pending(request_id, "drop", [instance_id], _slots_for_instance(instance_id))
	return request_id


func prompt_ground_drop(instance_id: String, hint_dx: float = 0.0, hint_dy: float = 0.0) -> bool:
	var item: Dictionary = item_by_instance(instance_id)
	if item.is_empty():
		_reject_local("item_not_found", "That item is not in the bag.")
		return false
	if ItemPresentation.is_locked(item):
		_reject_local("item_locked", ItemPresentation.lock_reason(item))
		return false
	var quantity := int(item.get("quantity", 1))
	if quantity < 1:
		return false
	var definition: Dictionary = ItemPresentation.definition_for(ItemPresentation.item_id_of(item))
	var needs_confirm := ItemPresentation.requires_drop_confirm(definition)
	if quantity == 1 and not needs_confirm:
		return not request_ground_drop(instance_id, 1, hint_dx, hint_dy).is_empty()
	_ensure_drop_dialog()
	return _drop_dialog.open_for(instance_id, quantity, needs_confirm, hint_dx, hint_dy)


func request_destroy(instance_id: String, quantity: int = -1) -> String:
	if instance_id.is_empty():
		return ""
	var request_id := MatchProtocol.new_request_id()
	NetworkService.send_destroy_item(instance_id, request_id, quantity, expected_revision())
	_begin_pending(request_id, "destroy", [instance_id], _slots_for_instance(instance_id))
	return request_id


func request_split(instance_id: String, quantity: int) -> String:
	if instance_id.is_empty() or quantity < 1:
		_reject_local("invalid_split", "Choose a split quantity between 1 and the stack minus one.")
		return ""
	var item: Dictionary = item_by_instance(instance_id)
	if not item.is_empty():
		if ItemPresentation.is_locked(item):
			_reject_local("item_locked", ItemPresentation.lock_reason(item))
			return ""
		if quantity >= int(item.get("quantity", 0)):
			_reject_local("invalid_split", "Choose a split quantity between 1 and the stack minus one.")
			return ""
		if occupied_slot_count() >= capacity:
			_reject_local("inventory_full", "The bag is full.")
			return ""
	var request_id := MatchProtocol.new_request_id()
	NetworkService.send_split_stack(instance_id, quantity, request_id, expected_revision())
	_begin_pending(request_id, "split", [instance_id], _slots_for_instance(instance_id))
	return request_id


func request_recover_overflow(instance_id: String, to_slot_index: int = -1) -> String:
	if instance_id.is_empty():
		return ""
	var request_id := MatchProtocol.new_request_id()
	NetworkService.send_recover_overflow_item(instance_id, request_id, to_slot_index, expected_revision())
	_begin_pending(request_id, "recover", [instance_id], [])
	return request_id


func request_move(instance_id: String, to_slot_index: int) -> String:
	if instance_id.is_empty():
		return ""
	var request_id := MatchProtocol.new_request_id()
	NetworkService.send_move_item(instance_id, to_slot_index, request_id, expected_revision())
	var slots: Array = _slots_for_instance(instance_id)
	if not slots.has(to_slot_index):
		slots.append(to_slot_index)
	_begin_pending(request_id, "move", [instance_id], slots)
	return request_id


func item_count() -> int:
	if mirror == null:
		return 0
	return mirror.get_item_count()


func attach_list(host: Control) -> Control:
	_ensure_mirror()
	var existing := host.get_node_or_null("List")
	if existing != null:
		if existing is CtrlInventory:
			(existing as CtrlInventory).inventory = mirror
			_bind_list_signals(existing as CtrlInventory)
		return existing
	var list := CtrlInventory.new()
	list.name = "List"
	list.set_anchors_preset(Control.PRESET_FULL_RECT)
	list.offset_left = 0
	list.offset_top = 0
	list.offset_right = 0
	list.offset_bottom = 0
	list.mouse_filter = Control.MOUSE_FILTER_STOP
	host.add_child(list)
	list.inventory = mirror
	_bind_list_signals(list)
	return list


func attach_bag(host: Control) -> Control:
	if host == null:
		return null
	var existing := host.get_node_or_null("Bag")
	if existing != null:
		if existing is BagGrid:
			(existing as BagGrid).refresh()
		return existing
	var grid := BagGrid.new()
	grid.name = "Bag"
	grid.set_anchors_preset(Control.PRESET_FULL_RECT)
	host.add_child(grid)
	return grid


func quantity_of(item_id: String) -> int:
	var total := 0
	for entry in items:
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		if String(entry.get("itemId", "")) != item_id:
			continue
		total += int(entry.get("quantity", 0))
	return total


func handle_slot_pressed(slot: ItemSlotView) -> void:
	if slot == null:
		return
	if slot.origin_kind == "merchant":
		if slot.is_empty():
			return
		var quantity := VendorService.selected_quantity()
		_press_slot = {
			"kind": slot.origin_kind,
			"slot_index": slot.slot_index,
			"stock_entry_id": String(slot.instance.get("stockEntryId", slot.instance.get("instanceId", ""))),
		}
		DragDropService.begin({
			"kind": "merchant_item",
			"instanceId": String(slot.instance.get("stockEntryId", slot.instance.get("instanceId", ""))),
			"stockEntryId": String(slot.instance.get("stockEntryId", slot.instance.get("instanceId", ""))),
			"fromSlot": slot.slot_index,
			"fromKind": "merchant",
			"quantity": quantity,
			"itemId": ItemPresentation.item_id_of(slot.instance),
		})
		return
	if slot.origin_kind == "trade_theirs":
		return
	if slot.origin_kind == "trade_mine":
		if slot.is_empty():
			_press_slot = {"kind": slot.origin_kind, "slot_index": slot.slot_index}
			return
		DragDropService.begin({
			"kind": "trade_offer",
			"instanceId": String(slot.instance.get("instanceId", "")),
			"fromSlot": slot.slot_index,
			"fromKind": "trade_mine",
			"quantity": int(slot.instance.get("quantity", 1)),
			"itemId": ItemPresentation.item_id_of(slot.instance),
		})
		return
	if slot.origin_kind == "bag":
		var item: Dictionary = item_at_slot(slot.slot_index)
		selected_instance_id = String(item.get("instanceId", ""))
	elif slot.origin_kind == "equipment":
		selected_instance_id = String(slot.instance.get("instanceId", ""))
	if slot.is_empty():
		_press_slot = {"kind": slot.origin_kind, "slot_index": slot.slot_index, "equipment_tag": slot.equipment_tag}
		return
	var split := Input.is_key_pressed(KEY_SHIFT)
	_press_slot = {
		"kind": slot.origin_kind,
		"slot_index": slot.slot_index,
		"equipment_tag": slot.equipment_tag,
		"instance_id": String(slot.instance.get("instanceId", "")),
		"split": split,
	}
	DragDropService.begin({
		"kind": "equipment_item" if slot.origin_kind == "equipment" else "bag_item",
		"instanceId": String(slot.instance.get("instanceId", "")),
		"fromSlot": slot.slot_index,
		"fromKind": slot.origin_kind,
		"equipmentTag": slot.equipment_tag,
		"split": split,
		"quantity": int(slot.instance.get("quantity", 1)),
		"itemId": ItemPresentation.item_id_of(slot.instance),
	})


func handle_slot_activated(slot: ItemSlotView) -> void:
	if slot == null or slot.is_empty():
		return
	selected_instance_id = String(slot.instance.get("instanceId", ""))
	if not selected_instance_id.is_empty():
		item_activated.emit(selected_instance_id)


func handle_world_drop(payload: Dictionary, hint: Vector2 = Vector2.ZERO) -> String:
	var instance_id := String(payload.get("instanceId", ""))
	var from_kind := String(payload.get("fromKind", "bag"))
	if instance_id.is_empty() or from_kind != "bag":
		if from_kind == "equipment":
			_reject_local("item_equipped", "Unequip that item into the bag before dropping it.")
			DragDropService.reject("item_equipped")
			return ""
		DragDropService.cancel()
		return ""
	DragDropService.complete()
	if prompt_ground_drop(instance_id, hint.x, hint.y):
		return last_request_id
	return ""


func handle_drop(payload: Dictionary, dest: ItemSlotView) -> String:
	if dest == null:
		DragDropService.cancel()
		return ""
	var instance_id := String(payload.get("instanceId", ""))
	var from_kind := String(payload.get("fromKind", "bag"))
	var from_slot := int(payload.get("fromSlot", -1))
	var split := bool(payload.get("split", false))
	if dest.origin_kind == "corpse" or dest.origin_kind == "merchant" or dest.origin_kind == "trade_theirs":
		_reject_local("destination_unavailable", "You cannot put items there.")
		DragDropService.reject("destination_unavailable")
		return ""
	if dest.origin_kind == "trade_mine":
		return _drop_bag_to_trade(payload, dest)
	if from_kind == "trade_mine":
		if dest.origin_kind == "bag":
			DragDropService.complete()
			TradeService.request_remove_offer(instance_id)
			return ""
		_reject_local("destination_unavailable", "You cannot put items there.")
		DragDropService.reject("destination_unavailable")
		return ""
	if from_kind == "corpse":
		return _drop_corpse_to_bag(payload, dest)
	if from_kind == "merchant":
		return _drop_merchant_to_bag(payload, dest)
	if instance_id.is_empty():
		DragDropService.cancel()
		return ""
	if dest.origin_kind == "bag" and dest.slot_index == from_slot and from_kind == "bag":
		DragDropService.cancel()
		return ""
	var source: Dictionary = item_by_instance(instance_id)
	if source.is_empty() and from_kind == "equipment":
		source = EquipmentService.item_by_instance(instance_id)
	if source.is_empty():
		DragDropService.reject("item_not_found")
		return ""
	if ItemPresentation.is_locked(source):
		var reason := ItemPresentation.lock_reason(source)
		_reject_local("item_locked", reason)
		DragDropService.reject("item_locked")
		return ""
	if split and from_kind == "bag":
		DragDropService.complete()
		var dest_index := dest.slot_index if dest.origin_kind == "bag" else -1
		prompt_split(instance_id, dest_index)
		return ""
	if dest.origin_kind == "equipment":
		DragDropService.complete()
		return _drop_onto_equipment(instance_id, source, dest)
	if from_kind == "equipment":
		DragDropService.complete()
		return _drop_equipment_into_bag(instance_id, dest)
	return _drop_bag_to_bag(instance_id, source, dest)


func prompt_split(instance_id: String, dest_slot: int = -1) -> bool:
	var item: Dictionary = item_by_instance(instance_id)
	if item.is_empty():
		_reject_local("invalid_split", "That stack is not in the bag.")
		return false
	if ItemPresentation.is_locked(item):
		_reject_local("item_locked", ItemPresentation.lock_reason(item))
		return false
	var quantity := int(item.get("quantity", 0))
	if quantity < 2:
		_reject_local("invalid_split", "Choose a split quantity between 1 and the stack minus one.")
		return false
	_ensure_split_dialog()
	return _split_dialog.open_for(instance_id, quantity - 1, dest_slot)


func retry_last_request() -> String:
	if last_request_id.is_empty():
		return ""
	return last_request_id


func request_canonical_refresh() -> void:
	var preserved := last_request_id
	NetworkService.request_resync()
	last_request_id = preserved
	if DragDropService.active:
		DragDropService.reject("resync")


func force_pending_timeout() -> void:
	_on_pending_timeout()


func clear_pending() -> void:
	if _pending_timer != null:
		_pending_timer.stop()
	var had := not pending.is_empty()
	pending = {}
	if had:
		pending_changed.emit()


func _drop_bag_to_trade(payload: Dictionary, dest: ItemSlotView) -> String:
	if dest.origin_kind != "trade_mine":
		_reject_local("destination_unavailable", "You cannot put items there.")
		DragDropService.reject("destination_unavailable")
		return ""
	var instance_id := String(payload.get("instanceId", ""))
	if instance_id.is_empty():
		DragDropService.cancel()
		return ""
	var source: Dictionary = item_by_instance(instance_id)
	if source.is_empty():
		source = payload
	if ItemPresentation.is_locked(source):
		var lock_reason := String(source.get("lockReason", source.get("lockType", "")))
		if lock_reason != "trade" and lock_reason != "TRADE":
			_reject_local("item_locked", ItemPresentation.lock_reason(source))
			DragDropService.reject("item_locked")
			return ""
	var quantity := int(payload.get("quantity", source.get("quantity", 0)))
	if bool(payload.get("split", false)) and quantity > 1:
		TradeService.offer_from_bag(source, dest.slot_index)
		DragDropService.complete()
		return ""
	DragDropService.complete()
	TradeService.request_set_offer(instance_id, quantity, dest.slot_index)
	return ""


func _drop_corpse_to_bag(payload: Dictionary, dest: ItemSlotView) -> String:
	if dest.origin_kind != "bag":
		_reject_local("invalid_slot", "Drop corpse loot into a bag slot.")
		DragDropService.reject("invalid_slot")
		return ""
	var entry_id := String(payload.get("entryId", payload.get("instanceId", "")))
	if entry_id.is_empty():
		DragDropService.cancel()
		return ""
	var dest_item: Dictionary = item_at_slot(dest.slot_index)
	if not dest_item.is_empty():
		var source: Dictionary = {
			"itemId": String(payload.get("itemId", "")),
			"quantity": int(payload.get("quantity", 1)),
			"instanceId": entry_id,
		}
		var definition: Dictionary = ItemPresentation.definition_for(ItemPresentation.item_id_of(source))
		if not ItemPresentation.stacks_compatible(source, dest_item, definition):
			_reject_local("invalid_slot", "That bag slot is occupied.")
			DragDropService.reject("invalid_slot")
			return ""
		if ItemPresentation.dest_stack_full(source, dest_item, definition):
			_reject_local("stack_full", "That stack is already full.")
			DragDropService.reject("stack_full")
			return ""
	DragDropService.complete()
	return CorpseService.request_claim_item(entry_id, dest.slot_index)


func _drop_merchant_to_bag(payload: Dictionary, dest: ItemSlotView) -> String:
	if dest.origin_kind != "bag":
		_reject_local("invalid_slot", "Drop merchant stock into a bag slot.")
		DragDropService.reject("invalid_slot")
		return ""
	var stock_entry_id := String(payload.get("stockEntryId", payload.get("instanceId", "")))
	if stock_entry_id.is_empty():
		DragDropService.cancel()
		return ""
	var dest_item: Dictionary = item_at_slot(dest.slot_index)
	if not dest_item.is_empty():
		var source: Dictionary = {
			"itemId": String(payload.get("itemId", "")),
			"quantity": int(payload.get("quantity", 1)),
			"instanceId": stock_entry_id,
		}
		var definition: Dictionary = ItemPresentation.definition_for(ItemPresentation.item_id_of(source))
		if not ItemPresentation.stacks_compatible(source, dest_item, definition):
			_reject_local("stack_incompatible", "That bag slot is occupied.")
			DragDropService.reject("stack_incompatible")
			return ""
		if ItemPresentation.dest_stack_full(source, dest_item, definition):
			_reject_local("stack_full", "That stack is already full.")
			DragDropService.reject("stack_full")
			return ""
	DragDropService.complete()
	VendorService.request_buy(stock_entry_id, int(payload.get("quantity", 1)), dest.slot_index)
	return VendorService.last_request_id


func _drop_bag_to_bag(instance_id: String, source: Dictionary, dest: ItemSlotView) -> String:
	var dest_item: Dictionary = item_at_slot(dest.slot_index)
	if dest_item.is_empty():
		DragDropService.complete()
		return request_move(instance_id, dest.slot_index)
	if String(dest_item.get("instanceId", "")) == instance_id:
		DragDropService.cancel()
		return ""
	if ItemPresentation.is_locked(dest_item):
		var reason := ItemPresentation.lock_reason(dest_item)
		_reject_local("item_locked", reason)
		DragDropService.reject("item_locked")
		return ""
	var definition: Dictionary = ItemPresentation.definition_for(ItemPresentation.item_id_of(source))
	if ItemPresentation.dest_stack_full(source, dest_item, definition):
		_reject_local("stack_full", "That stack is already full.")
		DragDropService.reject("stack_full")
		return ""
	DragDropService.complete()
	return request_move(instance_id, dest.slot_index)


func _drop_onto_equipment(instance_id: String, source: Dictionary, dest: ItemSlotView) -> String:
	var definition: Dictionary = ItemPresentation.definition_for(ItemPresentation.item_id_of(source))
	if not bool(definition.get("equippable", false)):
		_reject_local("not_equippable", "That item cannot be equipped.")
		return ""
	var tag := dest.equipment_tag if not dest.equipment_tag.is_empty() else EquipmentService.selected_slot
	var tags: Variant = definition.get("equipmentSlotTags", [])
	var allowed := false
	if typeof(tags) == TYPE_ARRAY:
		for entry in tags:
			if String(entry) == tag:
				allowed = true
				break
	if not allowed and String(definition.get("equipSlot", "")) == tag:
		allowed = true
	if not allowed:
		_reject_local("invalid_slot", "That item does not fit that equipment slot.")
		return ""
	var request_id := EquipmentService.request_equip(instance_id, tag)
	if request_id.is_empty():
		return ""
	pending = {
		"request_id": request_id,
		"kind": "equip",
		"instance_ids": [instance_id],
		"slots": _slots_for_instance(instance_id),
	}
	last_request_id = request_id
	_arm_pending_timer()
	pending_changed.emit()
	return request_id


func _drop_equipment_into_bag(instance_id: String, dest: ItemSlotView) -> String:
	if first_empty_slot() < 0:
		_reject_local("inventory_full", "The bag is full.")
		return ""
	var tag := _equipment_tag_for_instance(instance_id)
	if tag.is_empty():
		tag = EquipmentService.selected_slot
	var request_id := EquipmentService.request_unequip(tag)
	if request_id.is_empty():
		return ""
	pending = {
		"request_id": request_id,
		"kind": "unequip_to",
		"instance_id": instance_id,
		"dest_slot": dest.slot_index,
		"slots": [dest.slot_index],
	}
	last_request_id = request_id
	_arm_pending_timer()
	pending_changed.emit()
	return request_id


func _equipment_tag_for_instance(instance_id: String) -> String:
	for key in EquipmentService.slots.keys():
		if String(EquipmentService.slots[key]) == instance_id:
			return String(key)
	return ""


func _maybe_follow_unequip(followup: Dictionary) -> void:
	if String(followup.get("kind", "")) != "unequip_to":
		return
	var instance_id := String(followup.get("instance_id", ""))
	var dest_slot := int(followup.get("dest_slot", -1))
	if instance_id.is_empty() or dest_slot < 0:
		return
	var item: Dictionary = item_by_instance(instance_id)
	if item.is_empty():
		pending = followup
		_arm_pending_timer()
		pending_changed.emit()
		return
	if int(item.get("slotIndex", -1)) == dest_slot:
		return
	request_move(instance_id, dest_slot)


func _begin_pending(request_id: String, kind: String, instance_ids: Array, slots: Array) -> void:
	last_request_id = request_id
	pending = {
		"request_id": request_id,
		"kind": kind,
		"instance_ids": instance_ids.duplicate(),
		"slots": slots.duplicate(),
	}
	_arm_pending_timer()
	request_started.emit(request_id)
	pending_changed.emit()


func _arm_pending_timer() -> void:
	_ensure_timer()
	_pending_timer.stop()
	_pending_timer.wait_time = maxf(0.05, pending_timeout_sec)
	_pending_timer.start()


func _slots_for_instance(instance_id: String) -> Array:
	var item: Dictionary = item_by_instance(instance_id)
	if item.is_empty():
		return []
	return [int(item.get("slotIndex", -1))]


func _reject_local(code: String, message: String) -> void:
	last_reject_code = code
	last_notice = message
	notice.emit(message)
	AppState.report_recoverable(code, message)


func _ensure_mirror() -> void:
	if mirror != null:
		return
	mirror = Inventory.new()
	mirror.name = "GLootInventory"
	add_child(mirror)
	_constraint = ItemCountConstraint.new()
	_constraint.capacity = 30
	mirror.add_child(_constraint)
	if not mirror.item_added.is_connected(_on_local_item_added):
		mirror.item_added.connect(_on_local_item_added)
	if not mirror.item_removed.is_connected(_on_local_item_removed):
		mirror.item_removed.connect(_on_local_item_removed)
	if not mirror.item_moved.is_connected(_on_local_item_moved):
		mirror.item_moved.connect(_on_local_item_moved)


func _ensure_timer() -> void:
	if _pending_timer != null:
		return
	_pending_timer = Timer.new()
	_pending_timer.name = "PendingTimeout"
	_pending_timer.one_shot = true
	add_child(_pending_timer)
	_pending_timer.timeout.connect(_on_pending_timeout)


func _ensure_split_dialog() -> void:
	if _split_dialog != null:
		return
	_split_dialog = SplitStackDialog.new()
	_split_dialog.name = "SplitStackDialog"
	add_child(_split_dialog)
	_split_dialog.confirmed.connect(_on_split_confirmed)


func _close_split_dialog() -> void:
	if _split_dialog != null:
		_split_dialog.visible = false


func _on_split_confirmed(quantity: int) -> void:
	if _split_dialog == null:
		return
	request_split(_split_dialog.instance_id, quantity)


func _ensure_drop_dialog() -> void:
	if _drop_dialog != null:
		return
	_drop_dialog = GroundDropDialog.new()
	_drop_dialog.name = "GroundDropDialog"
	add_child(_drop_dialog)
	_drop_dialog.confirmed.connect(_on_drop_confirmed)


func _close_drop_dialog() -> void:
	if _drop_dialog != null:
		_drop_dialog.visible = false


func _on_drop_confirmed(quantity: int) -> void:
	if _drop_dialog == null:
		return
	request_ground_drop(_drop_dialog.instance_id, quantity, _drop_dialog.hint_dx, _drop_dialog.hint_dy)


func _rebuild_mirror() -> void:
	if mirror == null:
		return
	_applying = true
	mirror.clear()
	for entry in items:
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		var item_id := String(entry.get("itemId", ""))
		if item_id.is_empty() or mirror.protoset == null:
			continue
		var created: InventoryItem = mirror.create_and_add_item(item_id)
		if created == null:
			continue
		var quantity := maxi(1, int(entry.get("quantity", 1)))
		var max_stack := created.get_max_stack_size()
		if quantity > max_stack:
			created.set_max_stack_size(quantity)
		created.set_stack_size(quantity)
		var instance_id := String(entry.get("instanceId", ""))
		if not instance_id.is_empty():
			created.set_property("instanceId", instance_id)
	_applying = false


func instance_id_of(item: InventoryItem) -> String:
	if item == null:
		return ""
	return String(item.get_property("instanceId", ""))


func item_id_of_instance(instance_id: String) -> String:
	if instance_id.is_empty():
		return ""
	for entry in items:
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		if String(entry.get("instanceId", "")) == instance_id:
			return String(entry.get("itemId", ""))
	for entry in overflow_items:
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		if String(entry.get("instanceId", "")) == instance_id:
			return String(entry.get("itemId", ""))
	return EquipmentService.item_id_of_equipped(instance_id)


func _bind_list_signals(list: CtrlInventory) -> void:
	if not list.inventory_item_selected.is_connected(_on_item_selected):
		list.inventory_item_selected.connect(_on_item_selected)
	if not list.inventory_item_activated.is_connected(_on_item_activated):
		list.inventory_item_activated.connect(_on_item_activated)


func _on_item_selected(item: InventoryItem) -> void:
	selected_instance_id = instance_id_of(item)


func _on_item_activated(item: InventoryItem) -> void:
	selected_instance_id = instance_id_of(item)
	if not selected_instance_id.is_empty():
		item_activated.emit(selected_instance_id)


func _on_local_item_added(_item: InventoryItem) -> void:
	_revert_unsupported_mutation()


func _on_local_item_removed(_item: InventoryItem) -> void:
	_revert_unsupported_mutation()


func _on_local_item_moved(_item: InventoryItem) -> void:
	_revert_unsupported_mutation()


func _revert_unsupported_mutation() -> void:
	if _applying:
		return
	if DragDropService.active:
		DragDropService.reject("client_cannot_mutate")
	call_deferred("_rebuild_mirror")


func _on_content_loaded(_content_hash: String) -> void:
	configure_from_content()


func _on_character_loaded(_created: bool) -> void:
	reset()


func _on_zone_state_updated() -> void:
	if not AppState.zone_view_is_full:
		return
	var inventory: Variant = AppState.zone_view.get("inventory", {})
	if typeof(inventory) == TYPE_DICTIONARY:
		apply_canonical(inventory)


func _on_inventory_state(payload: Dictionary) -> void:
	apply_canonical({
		"capacity": payload.get("capacity", 30),
		"items": payload.get("items", []),
		"overflow": payload.get("overflow", {}),
		"revision": payload.get("revision", 0),
		"request_id": payload.get("request_id", payload.get("requestId", "")),
	})


func _on_action_result(payload: Dictionary) -> void:
	var request_id := String(payload.get("request_id", payload.get("requestId", "")))
	if request_id.is_empty() or request_id != String(pending.get("request_id", last_request_id)):
		return
	var result_ok := bool(payload.get("result_ok", payload.get("ok", false)))
	if result_ok:
		return
	var code := String(payload.get("code", "action_failed"))
	var message := String(payload.get("message", ""))
	if message.is_empty():
		message = _message_for(code)
	clear_pending()
	if DragDropService.active:
		DragDropService.reject(code)
	_reject_local(code, message)
	if code == "inventory_stale":
		request_canonical_refresh()


func _on_pending_timeout() -> void:
	if pending.is_empty():
		return
	var preserved := last_request_id
	clear_pending()
	if DragDropService.active:
		DragDropService.reject("request_timeout")
	last_request_id = preserved
	_reject_local("request_timeout", "The bag request timed out. Refreshing from the server.")
	request_canonical_refresh()


func _message_for(code: String) -> String:
	match code:
		"item_locked":
			return "That item is locked."
		"stack_full":
			return "That stack is already full."
		"inventory_full":
			return "The bag is full."
		"invalid_split":
			return "Choose a split quantity between 1 and the stack minus one."
		"invalid_slot":
			return "That bag slot is not valid."
		"inventory_stale":
			return "Inventory changed. Refreshing."
		"destination_unavailable":
			return "You cannot put items on the corpse."
		"item_equipped":
			return "Unequip that item into the bag before dropping it."
		"invalid_quantity":
			return "Choose a drop quantity between 1 and the stack."
		"ground_drop_limit":
			return "You already have too many items on the ground."
		"ground_item_no_longer_available":
			return "That ground item is gone."
		"not_equippable":
			return "That item cannot be equipped."
		_:
			return "The bag action failed."
