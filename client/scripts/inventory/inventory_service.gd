extends Node

## Project-owned GLoot adapter. Canonical inventory is server-owned.

signal inventory_changed
signal item_activated(instance_id: String)
signal request_started(request_id: String)

var mirror: Inventory
var capacity: int = 20
var items: Array = []
var selected_instance_id: String = ""

var _constraint: ItemCountConstraint
var _applying: bool = false
var _canonical: Dictionary = {"capacity": 20, "items": []}


func _ready() -> void:
	_ensure_mirror()
	if not AppState.zone_state_updated.is_connected(_on_zone_state_updated):
		AppState.zone_state_updated.connect(_on_zone_state_updated)
	if not AppState.logged_out.is_connected(reset):
		AppState.logged_out.connect(reset)
	if not AppState.content_loaded.is_connected(_on_content_loaded):
		AppState.content_loaded.connect(_on_content_loaded)
	if not NetworkService.inventory_state_received.is_connected(_on_inventory_state):
		NetworkService.inventory_state_received.connect(_on_inventory_state)
	if not ContentRegistry.get_content_hash().is_empty():
		configure_from_content()


func reset() -> void:
	_canonical = {"capacity": 20, "items": []}
	items = []
	capacity = 20
	selected_instance_id = ""
	_ensure_mirror()
	_rebuild_mirror()
	inventory_changed.emit()


func reset_for_tests() -> void:
	reset()


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
	capacity = int(state.get("capacity", 20))
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
	_canonical = {"capacity": capacity, "items": incoming}
	items = incoming.duplicate(true)
	if _constraint != null:
		_constraint.capacity = maxi(1, capacity)
	_rebuild_mirror()
	inventory_changed.emit()


func request_pickup(loot_id: String) -> String:
	if loot_id.is_empty():
		return ""
	var request_id := MatchProtocol.new_request_id()
	NetworkService.send_pickup(loot_id, request_id)
	return request_id


func request_destroy(instance_id: String, quantity: int = -1) -> String:
	if instance_id.is_empty():
		return ""
	var request_id := MatchProtocol.new_request_id()
	NetworkService.send_destroy_item(instance_id, request_id, quantity)
	request_started.emit(request_id)
	return request_id


func request_split(instance_id: String, quantity: int) -> String:
	if instance_id.is_empty() or quantity < 1:
		return ""
	var request_id := MatchProtocol.new_request_id()
	NetworkService.send_split_stack(instance_id, quantity, request_id)
	request_started.emit(request_id)
	return request_id


func request_move(instance_id: String, to_slot_index: int) -> String:
	if instance_id.is_empty():
		return ""
	var request_id := MatchProtocol.new_request_id()
	NetworkService.send_move_item(instance_id, to_slot_index, request_id)
	request_started.emit(request_id)
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


func quantity_of(item_id: String) -> int:
	var total := 0
	for entry in items:
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		if String(entry.get("itemId", "")) != item_id:
			continue
		total += int(entry.get("quantity", 0))
	return total


func _ensure_mirror() -> void:
	if mirror != null:
		return
	mirror = Inventory.new()
	mirror.name = "GLootInventory"
	add_child(mirror)
	_constraint = ItemCountConstraint.new()
	_constraint.capacity = 20
	mirror.add_child(_constraint)
	if not mirror.item_added.is_connected(_on_local_item_added):
		mirror.item_added.connect(_on_local_item_added)
	if not mirror.item_removed.is_connected(_on_local_item_removed):
		mirror.item_removed.connect(_on_local_item_removed)
	if not mirror.item_moved.is_connected(_on_local_item_moved):
		mirror.item_moved.connect(_on_local_item_moved)


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
	return ""


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


func _on_zone_state_updated() -> void:
	if not AppState.zone_view_is_full:
		return
	var inventory: Variant = AppState.zone_view.get("inventory", {})
	if typeof(inventory) == TYPE_DICTIONARY:
		apply_canonical(inventory)


func _on_inventory_state(payload: Dictionary) -> void:
	apply_canonical({
		"capacity": payload.get("capacity", 20),
		"items": payload.get("items", []),
	})
