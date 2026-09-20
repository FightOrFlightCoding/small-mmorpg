class_name TradeWindow
extends CanvasLayer

## Twenty-slot trade presentation. Offers stay server-authoritative until commit.

const OFFER_SLOTS := 20
const OFFER_COLUMNS := 5

signal gold_requested(amount: int)
signal accept_requested
signal cancel_requested
signal offer_requested(instance_id: String, quantity: int, slot_index: int)
signal remove_requested(instance_id: String)

var selected_offer_slot: int = -1

var _root: PanelContainer
var _title: Label
var _revision: Label
var _warning: Label
var _status: Label
var _mine_gold: LineEdit
var _theirs_gold: Label
var _mine_accept: Label
var _theirs_accept: Label
var _mine_grid: GridContainer
var _theirs_grid: GridContainer
var _bag_host: Control
var _accept: Button
var _cancel: Button
var _quantity: SpinBox
var _qty_dialog: ColorRect
var _qty_spin: SpinBox
var _qty_instance_id: String = ""
var _qty_slot: int = -1
var _mine_slots: Array = []
var _theirs_slots: Array = []


func _ready() -> void:
	layer = 23
	_build()
	visible = false


func is_open() -> bool:
	return visible


func present(payload: Dictionary) -> void:
	_refresh(payload)
	visible = true
	ItemContextRouter.set_context(ItemContextRouter.CONTEXT_TRADE)
	if WindowManager.has_method("open"):
		WindowManager.open(WindowManager.INVENTORY)


func close_window() -> void:
	visible = false
	selected_offer_slot = -1
	_hide_quantity()
	if ItemContextRouter.context == ItemContextRouter.CONTEXT_TRADE:
		ItemContextRouter.set_context(ItemContextRouter.CONTEXT_BAG)
	_status.text = ""
	_warning.visible = false


func show_status(message: String, is_error: bool = false) -> void:
	_status.text = message
	_status.modulate = DesignTokens.ERROR if is_error else DesignTokens.SUCCESS


func offer_quantity() -> int:
	return int(_quantity.value)


func prompt_quantity(instance_id: String, max_quantity: int, slot_index: int = -1) -> void:
	if instance_id.is_empty() or max_quantity < 1:
		return
	_qty_instance_id = instance_id
	_qty_slot = slot_index
	_qty_spin.min_value = 1
	_qty_spin.max_value = max_quantity
	_qty_spin.value = max_quantity
	_qty_dialog.visible = true
	_qty_spin.grab_focus()


func _refresh(payload: Dictionary) -> void:
	var named := String(payload.get("other_name", "the other player"))
	_title.text = "Trade with %s" % named
	_revision.text = "Revision %s" % str(int(payload.get("revision", 0)))
	_warning.visible = bool(payload.get("changed", false))
	_warning.text = "The trade has changed."
	_mine_gold.text = str(int(payload.get("mine_gold", 0)))
	_theirs_gold.text = "Their gold: %s" % str(int(payload.get("theirs_gold", 0)))
	_mine_accept.text = "You: %s" % ("accepted" if bool(payload.get("mine_accepted", false)) else "not accepted")
	_theirs_accept.text = "Them: %s" % ("accepted" if bool(payload.get("theirs_accepted", false)) else "not accepted")
	_fill_grid(_mine_slots, payload.get("mine_offers", []), true)
	_fill_grid(_theirs_slots, payload.get("theirs_offers", []), false)
	var notice := String(payload.get("status", ""))
	if not notice.is_empty():
		_status.text = notice
	_accept.disabled = String(payload.get("state", "")) != "open"


func _build() -> void:
	_root = PanelContainer.new()
	_root.name = "Panel"
	_root.set_anchors_preset(Control.PRESET_CENTER)
	_root.offset_left = -420.0
	_root.offset_top = -300.0
	_root.offset_right = 420.0
	_root.offset_bottom = 300.0
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

	_title = Label.new()
	_title.add_theme_font_size_override("font_size", DesignTokens.FONT_HEADING)
	vbox.add_child(_title)

	_revision = Label.new()
	_revision.add_theme_font_size_override("font_size", DesignTokens.FONT_CAPTION)
	_revision.add_theme_color_override("font_color", DesignTokens.TEXT_MUTED)
	vbox.add_child(_revision)

	_warning = Label.new()
	_warning.text = "The trade has changed."
	_warning.visible = false
	_warning.add_theme_color_override("font_color", DesignTokens.WARNING)
	vbox.add_child(_warning)

	var offers := HBoxContainer.new()
	offers.add_theme_constant_override("separation", DesignTokens.SPACE_MD)
	vbox.add_child(offers)

	var mine_col := VBoxContainer.new()
	mine_col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	offers.add_child(mine_col)
	var mine_label := Label.new()
	mine_label.text = "Your offer"
	mine_col.add_child(mine_label)
	_mine_grid = _make_grid()
	mine_col.add_child(_mine_grid)
	_mine_slots = _fill_offer_slots(_mine_grid, "trade_mine")
	_mine_gold = LineEdit.new()
	_mine_gold.placeholder_text = "Your gold"
	_mine_gold.text = "0"
	mine_col.add_child(_mine_gold)
	_mine_accept = Label.new()
	mine_col.add_child(_mine_accept)

	var theirs_col := VBoxContainer.new()
	theirs_col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	offers.add_child(theirs_col)
	var theirs_label := Label.new()
	theirs_label.text = "Their offer"
	theirs_col.add_child(theirs_label)
	_theirs_grid = _make_grid()
	theirs_col.add_child(_theirs_grid)
	_theirs_slots = _fill_offer_slots(_theirs_grid, "trade_theirs")
	_theirs_gold = Label.new()
	theirs_col.add_child(_theirs_gold)
	_theirs_accept = Label.new()
	theirs_col.add_child(_theirs_accept)

	var qty_row := HBoxContainer.new()
	vbox.add_child(qty_row)
	var qty_label := Label.new()
	qty_label.text = "Offer quantity"
	qty_row.add_child(qty_label)
	_quantity = SpinBox.new()
	_quantity.min_value = 0
	_quantity.max_value = 99
	_quantity.value = 0
	_quantity.tooltip_text = "0 offers the whole stack"
	qty_row.add_child(_quantity)
	var set_gold := Button.new()
	set_gold.text = "Set gold"
	set_gold.pressed.connect(_on_set_gold)
	qty_row.add_child(set_gold)

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

	_status = Label.new()
	_status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_status.add_theme_font_size_override("font_size", DesignTokens.FONT_CAPTION)
	vbox.add_child(_status)

	var buttons := HBoxContainer.new()
	buttons.add_theme_constant_override("separation", DesignTokens.SPACE_SM)
	vbox.add_child(buttons)
	_accept = Button.new()
	_accept.text = "Accept trade"
	_accept.pressed.connect(func() -> void: accept_requested.emit())
	ShellTheme.style_primary(_accept)
	buttons.add_child(_accept)
	_cancel = Button.new()
	_cancel.text = "Cancel"
	_cancel.pressed.connect(func() -> void: cancel_requested.emit())
	ShellTheme.style_secondary(_cancel)
	buttons.add_child(_cancel)

	_build_quantity_dialog()


func _make_grid() -> GridContainer:
	var grid := GridContainer.new()
	grid.columns = OFFER_COLUMNS
	grid.add_theme_constant_override("h_separation", 2)
	grid.add_theme_constant_override("v_separation", 2)
	grid.custom_minimum_size = Vector2(
		OFFER_COLUMNS * (ItemSlotView.SLOT_SIZE + 2),
		4 * (ItemSlotView.SLOT_SIZE + 2)
	)
	return grid


func _fill_offer_slots(grid: GridContainer, kind: String) -> Array:
	var slots: Array = []
	for index in range(OFFER_SLOTS):
		var slot := ItemSlotView.new()
		slot.name = "%s%s" % [kind, str(index)]
		slot.origin_kind = kind
		slot.slot_index = index
		slot.slot_pressed.connect(_on_offer_pressed)
		slot.slot_drag_begun.connect(_on_offer_drag_begun)
		slot.slot_right_clicked.connect(_on_offer_right_clicked)
		grid.add_child(slot)
		slot.refresh({})
		slots.append(slot)
	return slots


func _fill_grid(slots: Array, offers: Variant, selectable: bool) -> void:
	var rows: Array = offers if typeof(offers) == TYPE_ARRAY else []
	for index in range(slots.size()):
		var view: ItemSlotView = slots[index]
		var instance := {}
		if index < rows.size() and typeof(rows[index]) == TYPE_DICTIONARY:
			instance = rows[index]
			if String(instance.get("instanceId", "")).is_empty():
				instance = {}
		view.refresh(instance)
		if selectable and index == selected_offer_slot:
			view.modulate = Color(1.08, 1.08, 1.02, 1)
		else:
			view.modulate = Color.WHITE


func _on_offer_pressed(slot: ItemSlotView) -> void:
	if slot == null or slot.origin_kind != "trade_mine":
		return
	selected_offer_slot = slot.slot_index
	for index in range(_mine_slots.size()):
		var view: ItemSlotView = _mine_slots[index]
		view.modulate = Color(1.08, 1.08, 1.02, 1) if index == selected_offer_slot else Color.WHITE
	InventoryService.handle_slot_pressed(slot)


func _on_offer_drag_begun(slot: ItemSlotView) -> void:
	if slot == null:
		return
	InventoryService.handle_slot_drag_begun(slot)


func _on_offer_right_clicked(slot: ItemSlotView) -> void:
	if slot == null or slot.origin_kind != "trade_mine" or slot.is_empty():
		return
	remove_requested.emit(String(slot.instance.get("instanceId", "")))


func _on_set_gold() -> void:
	gold_requested.emit(int(_mine_gold.text))


func _build_quantity_dialog() -> void:
	_qty_dialog = ColorRect.new()
	_qty_dialog.color = Color(0, 0, 0, 0.55)
	_qty_dialog.set_anchors_preset(Control.PRESET_FULL_RECT)
	_qty_dialog.mouse_filter = Control.MOUSE_FILTER_STOP
	_qty_dialog.visible = false
	add_child(_qty_dialog)
	var panel := PanelContainer.new()
	panel.set_anchors_preset(Control.PRESET_CENTER)
	panel.offset_left = -140
	panel.offset_top = -80
	panel.offset_right = 140
	panel.offset_bottom = 80
	var body := VBoxContainer.new()
	var title := Label.new()
	title.text = "Offer quantity"
	body.add_child(title)
	_qty_spin = SpinBox.new()
	_qty_spin.min_value = 1
	_qty_spin.max_value = 1
	_qty_spin.step = 1
	body.add_child(_qty_spin)
	var row := HBoxContainer.new()
	var confirm := Button.new()
	confirm.text = "Offer"
	confirm.pressed.connect(_on_qty_confirm)
	row.add_child(confirm)
	var cancel := Button.new()
	cancel.text = "Cancel"
	cancel.pressed.connect(_hide_quantity)
	row.add_child(cancel)
	body.add_child(row)
	panel.add_child(body)
	_qty_dialog.add_child(panel)


func _on_qty_confirm() -> void:
	var instance_id := _qty_instance_id
	var slot := _qty_slot
	var quantity := int(_qty_spin.value)
	_hide_quantity()
	if instance_id.is_empty():
		return
	offer_requested.emit(instance_id, quantity, slot)


func _hide_quantity() -> void:
	_qty_dialog.visible = false
	_qty_instance_id = ""
	_qty_slot = -1
