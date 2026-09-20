class_name MerchantWindow
extends CanvasLayer

## Buy-only merchant presentation. Prices and balances stay server-authoritative.

signal buy_requested(stock_entry_id: String, quantity: int, preferred_slot: int)
signal sell_requested(instance_id: String, quantity: int)
signal back_requested

var npc_id: String = ""
var vendor_id: String = ""
var session_id: String = ""

var _root: PanelContainer
var _name_label: Label
var _stock_grid: GridContainer
var _icon: ColorRect
var _description: Label
var _price: Label
var _quantity: SpinBox
var _currency: Label
var _status: Label
var _buy: Button
var _sell: Button
var _back: Button
var _bag_host: Control
var _stock: Array = []
var _stock_slots: Array = []
var _selected_index: int = -1
var _loading: bool = false


func _ready() -> void:
	layer = 21
	_build()
	visible = false


func is_open() -> bool:
	return visible


func present(payload: Dictionary) -> void:
	_loading = false
	npc_id = String(payload.get("npc_id", npc_id))
	vendor_id = String(payload.get("vendor_id", vendor_id))
	session_id = String(payload.get("interaction_session_id", session_id))
	_name_label.text = String(payload.get("npc_name", npc_id))
	_stock = _normalized_stock(payload.get("stock", []))
	_rebuild_stock_slots()
	if _stock_slots.size() > 0:
		_select_stock(0)
	else:
		_selected_index = -1
		_refresh_selection()
	set_player_gold(int(payload.get("gold", WalletService.gold)))
	_status.text = ""
	_status.modulate = DesignTokens.TEXT
	_buy.disabled = false
	visible = true


func set_player_gold(gold: int) -> void:
	_currency.text = "Gold: %s" % str(gold)


func show_status(message: String, is_error: bool = false) -> void:
	_loading = false
	_buy.disabled = false
	_status.text = message
	_status.modulate = DesignTokens.ERROR if is_error else DesignTokens.SUCCESS


func show_busy(message: String = "Waiting for the server…") -> void:
	_loading = true
	_buy.disabled = true
	_status.text = message
	_status.modulate = DesignTokens.TEXT_MUTED


func close_window() -> void:
	visible = false
	_loading = false
	npc_id = ""
	vendor_id = ""
	session_id = ""
	_stock = []
	_selected_index = -1
	_clear_stock_slots()
	_status.text = ""


func selected_item_id() -> String:
	var entry := _selected_entry()
	if entry.is_empty():
		return ""
	return String(entry.get("itemId", ""))


func selected_stock_entry_id() -> String:
	var entry := _selected_entry()
	if entry.is_empty():
		return ""
	return String(entry.get("stockEntryId", ""))


func selected_quantity() -> int:
	return int(_quantity.value)


func _build() -> void:
	_root = PanelContainer.new()
	_root.name = "Panel"
	_root.set_anchors_preset(Control.PRESET_CENTER)
	_root.offset_left = -360.0
	_root.offset_top = -280.0
	_root.offset_right = 360.0
	_root.offset_bottom = 280.0
	var style := StyleBoxFlat.new()
	style.bg_color = DesignTokens.SURFACE
	style.border_color = DesignTokens.BORDER
	style.set_border_width_all(1)
	style.set_corner_radius_all(6)
	style.content_margin_left = DesignTokens.SPACE_LG
	style.content_margin_right = DesignTokens.SPACE_LG
	style.content_margin_top = DesignTokens.SPACE_MD
	style.content_margin_bottom = DesignTokens.SPACE_MD
	_root.add_theme_stylebox_override("panel", style)
	add_child(_root)

	var vbox := VBoxContainer.new()
	vbox.add_theme_constant_override("separation", DesignTokens.SPACE_SM)
	_root.add_child(vbox)

	_name_label = Label.new()
	_name_label.add_theme_font_size_override("font_size", DesignTokens.FONT_HEADING)
	_name_label.add_theme_color_override("font_color", DesignTokens.TEXT)
	vbox.add_child(_name_label)

	var body := HBoxContainer.new()
	body.add_theme_constant_override("separation", DesignTokens.SPACE_MD)
	vbox.add_child(body)

	_stock_grid = GridContainer.new()
	_stock_grid.name = "Stock"
	_stock_grid.columns = 5
	_stock_grid.add_theme_constant_override("h_separation", 2)
	_stock_grid.add_theme_constant_override("v_separation", 2)
	body.add_child(_stock_grid)

	var detail := VBoxContainer.new()
	detail.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	detail.add_theme_constant_override("separation", DesignTokens.SPACE_SM)
	body.add_child(detail)

	_icon = ColorRect.new()
	_icon.custom_minimum_size = Vector2(48, 48)
	_icon.color = DesignTokens.SURFACE_RAISED
	detail.add_child(_icon)

	_description = Label.new()
	_description.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_description.add_theme_font_size_override("font_size", DesignTokens.FONT_BODY)
	_description.add_theme_color_override("font_color", DesignTokens.TEXT)
	detail.add_child(_description)

	_price = Label.new()
	_price.add_theme_font_size_override("font_size", DesignTokens.FONT_BODY)
	_price.add_theme_color_override("font_color", DesignTokens.TEXT)
	detail.add_child(_price)

	var qty_row := HBoxContainer.new()
	detail.add_child(qty_row)
	var qty_label := Label.new()
	qty_label.text = "Quantity"
	qty_row.add_child(qty_label)
	_quantity = SpinBox.new()
	_quantity.min_value = 1
	_quantity.max_value = 99
	_quantity.step = 1
	_quantity.value = 1
	_quantity.value_changed.connect(_on_quantity_changed)
	qty_row.add_child(_quantity)

	_currency = Label.new()
	_currency.add_theme_font_size_override("font_size", DesignTokens.FONT_BODY)
	_currency.add_theme_color_override("font_color", DesignTokens.TEXT)
	detail.add_child(_currency)

	_status = Label.new()
	_status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_status.add_theme_font_size_override("font_size", DesignTokens.FONT_CAPTION)
	detail.add_child(_status)

	var bag_label := Label.new()
	bag_label.text = "Your bag"
	bag_label.add_theme_font_size_override("font_size", DesignTokens.FONT_CAPTION)
	bag_label.add_theme_color_override("font_color", DesignTokens.TEXT_MUTED)
	vbox.add_child(bag_label)
	_bag_host = Control.new()
	_bag_host.name = "BagHost"
	_bag_host.custom_minimum_size = Vector2(6 * (ItemSlotView.SLOT_SIZE + 2), 5 * (ItemSlotView.SLOT_SIZE + 2))
	vbox.add_child(_bag_host)
	InventoryService.attach_bag(_bag_host)

	var buttons := HBoxContainer.new()
	buttons.add_theme_constant_override("separation", DesignTokens.SPACE_SM)
	vbox.add_child(buttons)
	_buy = _make_button("Buy", false)
	_buy.pressed.connect(_on_buy)
	buttons.add_child(_buy)
	_sell = _make_button("Sell selected", true)
	_sell.visible = false
	_sell.disabled = true
	buttons.add_child(_sell)
	_back = _make_button("Back to dialogue", true)
	_back.pressed.connect(_on_back)
	buttons.add_child(_back)


func _make_button(text: String, secondary: bool) -> Button:
	var button := Button.new()
	button.text = text
	button.custom_minimum_size = Vector2(0, 28)
	if secondary:
		ShellTheme.style_secondary(button)
	else:
		ShellTheme.style_primary(button)
	return button


func _normalized_stock(raw: Variant) -> Array:
	var rows: Array = []
	if typeof(raw) != TYPE_ARRAY:
		return rows
	var index := 0
	for entry in raw:
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		var copy: Dictionary = (entry as Dictionary).duplicate(true)
		var item_id := String(copy.get("itemId", ""))
		if String(copy.get("stockEntryId", "")).is_empty() and not vendor_id.is_empty() and not item_id.is_empty():
			copy["stockEntryId"] = "%s:%s" % [vendor_id, item_id]
		if not copy.has("displayOrder"):
			copy["displayOrder"] = index
		rows.append(copy)
		index += 1
	rows.sort_custom(func(a, b): return int((a as Dictionary).get("displayOrder", 0)) < int((b as Dictionary).get("displayOrder", 0)))
	return rows


func _rebuild_stock_slots() -> void:
	_clear_stock_slots()
	var index := 0
	for entry in _stock:
		var slot := ItemSlotView.new()
		slot.name = "MerchantSlot%s" % str(index)
		slot.origin_kind = "merchant"
		slot.slot_index = index
		slot.slot_pressed.connect(_on_stock_pressed)
		slot.slot_drag_begun.connect(_on_stock_drag_begun)
		slot.slot_activated.connect(_on_stock_activated)
		slot.slot_right_clicked.connect(_on_stock_right_clicked)
		_stock_grid.add_child(slot)
		slot.refresh(_stock_instance(entry as Dictionary))
		_stock_slots.append(slot)
		index += 1


func _stock_instance(entry: Dictionary) -> Dictionary:
	var item_id := String(entry.get("itemId", ""))
	var stock_entry_id := String(entry.get("stockEntryId", ""))
	return {
		"instanceId": stock_entry_id,
		"stockEntryId": stock_entry_id,
		"itemId": item_id,
		"quantity": 1,
		"buyPrice": int(entry.get("buyPrice", 0)),
		"displayOrder": int(entry.get("displayOrder", 0)),
	}


func _clear_stock_slots() -> void:
	for child in _stock_grid.get_children():
		_stock_grid.remove_child(child)
		child.free()
	_stock_slots.clear()


func _on_stock_pressed(slot: ItemSlotView) -> void:
	if slot == null:
		return
	_select_stock(slot.slot_index)


func _on_stock_drag_begun(slot: ItemSlotView) -> void:
	if slot == null:
		return
	_select_stock(slot.slot_index)
	InventoryService.handle_slot_drag_begun(slot)


func _on_stock_activated(slot: ItemSlotView) -> void:
	if slot == null or _loading:
		return
	_select_stock(slot.slot_index)
	_emit_buy(1, -1)


func _on_stock_right_clicked(slot: ItemSlotView) -> void:
	if slot == null:
		return
	_select_stock(slot.slot_index)
	ItemContextRouter.handle_slot(slot)


func _select_stock(index: int) -> void:
	_selected_index = index
	for i in range(_stock_slots.size()):
		var view: ItemSlotView = _stock_slots[i]
		view.modulate = Color(1.08, 1.08, 1.02, 1) if i == index else Color.WHITE
	_refresh_selection()


func _on_quantity_changed(_value: float) -> void:
	_refresh_selection()


func _refresh_selection() -> void:
	var entry := _selected_entry()
	if entry.is_empty():
		_description.text = ""
		_price.text = "Price: —"
		_icon.color = DesignTokens.SURFACE_RAISED
		return
	var item_id := String(entry.get("itemId", ""))
	var item: Dictionary = ContentRegistry.get_by_id(item_id)
	_description.text = ItemPresentation.description_text(item, item_id)
	var unit := int(entry.get("buyPrice", 0))
	var total := unit * selected_quantity()
	_price.text = "Price: %sg" % str(total)
	var constraints: Variant = entry.get("quantityConstraints", {})
	if typeof(constraints) == TYPE_DICTIONARY:
		_quantity.min_value = maxi(1, int((constraints as Dictionary).get("min", 1)))
		_quantity.max_value = mini(99, int((constraints as Dictionary).get("max", 99)))
	var texture := ItemPresentation.icon_texture(item)
	if texture != null:
		_icon.color = Color(0, 0, 0, 0)
	else:
		_icon.color = ItemPresentation.fallback_color(item)


func _selected_entry() -> Dictionary:
	if _selected_index < 0 or _selected_index >= _stock.size():
		return {}
	var entry: Variant = _stock[_selected_index]
	if typeof(entry) != TYPE_DICTIONARY:
		return {}
	return entry


func _on_buy() -> void:
	if _loading:
		return
	_emit_buy(selected_quantity(), -1)


func _emit_buy(quantity: int, preferred_slot: int) -> void:
	var stock_entry_id := selected_stock_entry_id()
	if stock_entry_id.is_empty():
		show_status("Select an item to buy.", true)
		return
	buy_requested.emit(stock_entry_id, quantity, preferred_slot)


func _on_back() -> void:
	back_requested.emit()
