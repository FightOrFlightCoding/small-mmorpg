extends Node

## Client drag preview only. Canonical inventory stays on the server.

signal drag_started(payload: Dictionary)
signal drag_cancelled
signal drag_rejected(code: String)
signal drag_completed

var active: bool = false
var payload: Dictionary = {}
var last_reject_code: String = ""
var start_position: Vector2 = Vector2.ZERO

var _layer: CanvasLayer
var _ghost: ColorRect
var _ghost_icon: TextureRect
var _ghost_qty: Label


func _ready() -> void:
	_layer = CanvasLayer.new()
	_layer.layer = 45
	_layer.visible = false
	add_child(_layer)
	_ghost = ColorRect.new()
	_ghost.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_ghost.size = Vector2(ItemSlotView.SLOT_SIZE, ItemSlotView.SLOT_SIZE)
	_ghost.color = DesignTokens.SURFACE_RAISED
	_layer.add_child(_ghost)
	_ghost_icon = TextureRect.new()
	_ghost_icon.set_anchors_preset(Control.PRESET_FULL_RECT)
	_ghost_icon.offset_left = 3
	_ghost_icon.offset_top = 3
	_ghost_icon.offset_right = -3
	_ghost_icon.offset_bottom = -3
	_ghost_icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_ghost_icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_ghost_icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_ghost.add_child(_ghost_icon)
	_ghost_qty = Label.new()
	_ghost_qty.set_anchors_preset(Control.PRESET_FULL_RECT)
	_ghost_qty.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_ghost_qty.vertical_alignment = VERTICAL_ALIGNMENT_BOTTOM
	_ghost_qty.add_theme_font_size_override("font_size", 10)
	_ghost_qty.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_ghost.add_child(_ghost_qty)


func reset_for_tests() -> void:
	active = false
	payload = {}
	last_reject_code = ""
	start_position = Vector2.ZERO
	_hide_ghost()


func begin(next_payload: Dictionary) -> void:
	if next_payload.has("gold") or next_payload.has("damage") or next_payload.has("health"):
		reject("stat_injection")
		return
	active = true
	payload = next_payload.duplicate(true)
	last_reject_code = ""
	start_position = _cursor()
	_show_ghost()
	drag_started.emit(payload)


func cancel() -> void:
	if not active:
		return
	active = false
	payload = {}
	_hide_ghost()
	drag_cancelled.emit()


func reject(code: String) -> void:
	active = false
	payload = {}
	last_reject_code = code if not code.is_empty() else "rejected"
	_hide_ghost()
	drag_rejected.emit(last_reject_code)


func complete() -> void:
	if not active:
		return
	active = false
	payload = {}
	_hide_ghost()
	drag_completed.emit()


func slot_under_cursor() -> ItemSlotView:
	var viewport := get_viewport()
	if viewport == null:
		return null
	var hovered := viewport.gui_get_hovered_control()
	while hovered != null:
		if hovered is ItemSlotView:
			return hovered as ItemSlotView
		hovered = hovered.get_parent() as Control
	return null


func _input(event: InputEvent) -> void:
	if not active:
		return
	if event is InputEventMouseButton:
		var mouse := event as InputEventMouseButton
		if mouse.button_index != MOUSE_BUTTON_LEFT or mouse.pressed:
			return
		_finish_from_pointer()
		get_viewport().set_input_as_handled()


func _process(_delta: float) -> void:
	if active:
		_place_ghost(_cursor())


func _finish_from_pointer() -> void:
	if not active:
		return
	var current := payload.duplicate(true)
	var dest := slot_under_cursor()
	var moved := _cursor().distance_to(start_position) >= 6.0
	if dest == null:
		if moved:
			InventoryService.handle_world_drop(current, _cursor() - start_position)
		else:
			cancel()
		return
	if not moved and dest.origin_kind == String(current.get("fromKind", "bag")) and dest.slot_index == int(current.get("fromSlot", -1)):
		cancel()
		return
	InventoryService.handle_drop(current, dest)


func _show_ghost() -> void:
	if _layer == null or _ghost == null:
		return
	var item_id := String(payload.get("itemId", ""))
	var definition: Dictionary = ItemPresentation.definition_for(item_id)
	var texture := ItemPresentation.icon_texture(definition)
	_ghost_icon.texture = texture
	_ghost_icon.visible = texture != null
	_ghost.color = ItemPresentation.fallback_color(definition) if texture == null else DesignTokens.SURFACE_RAISED
	var quantity := int(payload.get("quantity", 1))
	_ghost_qty.text = str(quantity) if quantity > 1 else ""
	_layer.visible = true
	_place_ghost(_cursor())


func _hide_ghost() -> void:
	if _layer != null:
		_layer.visible = false
	if _ghost_icon != null:
		_ghost_icon.texture = null


func _cursor() -> Vector2:
	var tree := get_tree()
	if tree == null:
		return Vector2.ZERO
	return tree.root.get_mouse_position()


func _place_ghost(at: Vector2) -> void:
	if _ghost == null:
		return
	_ghost.position = at + Vector2(8, 8)
