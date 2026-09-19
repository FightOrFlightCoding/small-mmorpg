class_name BagGrid
extends GridContainer

## Fixed 6×5 bag squares. Slot indices 0–29 never compact.

const COLUMNS := 6
const ROWS := 5
const CAPACITY := 30

var slots: Array = []


func _ready() -> void:
	columns = COLUMNS
	add_theme_constant_override("h_separation", 2)
	add_theme_constant_override("v_separation", 2)
	mouse_filter = Control.MOUSE_FILTER_PASS
	custom_minimum_size = Vector2(COLUMNS * (ItemSlotView.SLOT_SIZE + 2), ROWS * (ItemSlotView.SLOT_SIZE + 2))
	_ensure_slots()
	refresh()
	WindowManager.connect_once(InventoryService.inventory_changed, refresh)
	WindowManager.connect_once(InventoryService.pending_changed, refresh)


func _exit_tree() -> void:
	if InventoryService.inventory_changed.is_connected(refresh):
		InventoryService.inventory_changed.disconnect(refresh)
	if InventoryService.pending_changed.is_connected(refresh):
		InventoryService.pending_changed.disconnect(refresh)


func slot_at(index: int) -> ItemSlotView:
	_ensure_slots()
	if index < 0 or index >= slots.size():
		return null
	return slots[index]


func refresh() -> void:
	_ensure_slots()
	for index in range(CAPACITY):
		var view: ItemSlotView = slots[index]
		var item: Dictionary = InventoryService.item_at_slot(index)
		view.refresh(item, InventoryService.slot_is_pending(index))
		if not item.is_empty() and String(item.get("instanceId", "")) == InventoryService.selected_instance_id:
			view.modulate = Color(1.08, 1.08, 1.02, 1)
		else:
			view.modulate = Color.WHITE


func _ensure_slots() -> void:
	if slots.size() == CAPACITY:
		return
	for child in get_children():
		remove_child(child)
		child.queue_free()
	slots.clear()
	for index in range(CAPACITY):
		var view := ItemSlotView.new()
		view.name = "Slot%s" % str(index)
		view.origin_kind = "bag"
		view.slot_index = index
		view.slot_pressed.connect(_on_slot_pressed)
		view.slot_activated.connect(_on_slot_activated)
		view.slot_right_clicked.connect(_on_slot_right_clicked)
		add_child(view)
		slots.append(view)


func _on_slot_pressed(slot: ItemSlotView) -> void:
	InventoryService.handle_slot_pressed(slot)


func _on_slot_activated(slot: ItemSlotView) -> void:
	InventoryService.handle_slot_activated(slot)


func _on_slot_right_clicked(slot: ItemSlotView) -> void:
	ItemContextRouter.handle_slot(slot)
