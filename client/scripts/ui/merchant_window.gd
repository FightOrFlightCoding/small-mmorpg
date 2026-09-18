class_name MerchantWindow
extends CanvasLayer

## Reusable merchant presentation. Prices and balances stay server-authoritative.

signal buy_requested(item_id: String, quantity: int)
signal sell_requested(instance_id: String, quantity: int)
signal back_requested

var npc_id: String = ""
var vendor_id: String = ""
var session_id: String = ""

var _root: PanelContainer
var _name_label: Label
var _list: ItemList
var _icon: ColorRect
var _description: Label
var _price: Label
var _quantity: SpinBox
var _currency: Label
var _status: Label
var _buy: Button
var _sell: Button
var _back: Button
var _stock: Array = []
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
	_stock = payload.get("stock", [])
	_list.clear()
	for entry in _stock:
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		var item_id := String(entry.get("itemId", ""))
		var item: Dictionary = ContentRegistry.get_by_id(item_id)
		var label := String(item.get("displayName", item_id))
		_list.add_item("%s — %sg" % [label, str(int(entry.get("buyPrice", 0)))])
	if _list.item_count > 0:
		_list.select(0)
	_refresh_selection()
	set_player_gold(int(payload.get("gold", WalletService.gold)))
	_status.text = ""
	_status.modulate = DesignTokens.TEXT
	_buy.disabled = false
	_sell.disabled = false
	visible = true


func set_player_gold(gold: int) -> void:
	_currency.text = "Gold: %s" % str(gold)


func show_status(message: String, is_error: bool = false) -> void:
	_loading = false
	_buy.disabled = false
	_sell.disabled = false
	_status.text = message
	_status.modulate = DesignTokens.ERROR if is_error else DesignTokens.SUCCESS


func show_busy(message: String = "Waiting for the server…") -> void:
	_loading = true
	_buy.disabled = true
	_sell.disabled = true
	_status.text = message
	_status.modulate = DesignTokens.TEXT_MUTED


func close_window() -> void:
	visible = false
	_loading = false
	npc_id = ""
	vendor_id = ""
	session_id = ""
	_stock = []
	if _list != null:
		_list.clear()
	_status.text = ""


func selected_item_id() -> String:
	var entry := _selected_entry()
	if entry.is_empty():
		return ""
	return String(entry.get("itemId", ""))


func selected_quantity() -> int:
	return int(_quantity.value)


func _build() -> void:
	_root = PanelContainer.new()
	_root.name = "Panel"
	_root.set_anchors_preset(Control.PRESET_CENTER)
	_root.offset_left = -280.0
	_root.offset_top = -220.0
	_root.offset_right = 280.0
	_root.offset_bottom = 220.0
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

	_list = ItemList.new()
	_list.custom_minimum_size = Vector2(240, 220)
	_list.item_selected.connect(_on_item_selected)
	body.add_child(_list)

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

	var buttons := HBoxContainer.new()
	buttons.add_theme_constant_override("separation", DesignTokens.SPACE_SM)
	vbox.add_child(buttons)
	_buy = _make_button("Buy", false)
	_buy.pressed.connect(_on_buy)
	buttons.add_child(_buy)
	_sell = _make_button("Sell selected", true)
	_sell.pressed.connect(_on_sell)
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


func _on_item_selected(_index: int) -> void:
	_refresh_selection()


func _on_quantity_changed(_value: float) -> void:
	_refresh_selection()


func _refresh_selection() -> void:
	var entry := _selected_entry()
	if entry.is_empty():
		_description.text = ""
		_price.text = "Price: —"
		return
	var item_id := String(entry.get("itemId", ""))
	var item: Dictionary = ContentRegistry.get_by_id(item_id)
	_description.text = _item_description(item, item_id)
	var unit := int(entry.get("buyPrice", 0))
	var total := unit * selected_quantity()
	_price.text = "Price: %sg" % str(total)


func _item_description(item: Dictionary, item_id: String) -> String:
	var key := String(item.get("descriptionKey", ""))
	if not key.is_empty():
		var translated := tr(key)
		if not translated.is_empty() and translated != key:
			return translated
	var named := String(item.get("displayName", item_id))
	if named.is_empty():
		return item_id
	return named


func _selected_entry() -> Dictionary:
	if _list == null or _list.get_selected_items().is_empty():
		return {}
	var index := int(_list.get_selected_items()[0])
	if index < 0 or index >= _stock.size():
		return {}
	var entry: Variant = _stock[index]
	if typeof(entry) != TYPE_DICTIONARY:
		return {}
	return entry


func _on_buy() -> void:
	if _loading:
		return
	var item_id := selected_item_id()
	if item_id.is_empty():
		show_status("Select an item to buy.", true)
		return
	buy_requested.emit(item_id, selected_quantity())


func _on_sell() -> void:
	if _loading:
		return
	var instance_id := InventoryService.selected_instance_id
	if instance_id.is_empty():
		show_status("Select an inventory item to sell.", true)
		return
	sell_requested.emit(instance_id, 0)


func _on_back() -> void:
	back_requested.emit()
