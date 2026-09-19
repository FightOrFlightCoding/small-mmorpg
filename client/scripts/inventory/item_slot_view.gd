class_name ItemSlotView
extends PanelContainer

## One bag or equipment square. Presentation only; drops are intentions.

signal slot_pressed(slot: ItemSlotView)
signal slot_activated(slot: ItemSlotView)
signal slot_right_clicked(slot: ItemSlotView)

const SLOT_SIZE := 40

var origin_kind: String = "bag"
var slot_index: int = -1
var equipment_tag: String = ""
var instance: Dictionary = {}
var pending: bool = false

var _fallback: ColorRect
var _icon: TextureRect
var _quantity: Label
var _lock: ColorRect
var _lock_label: Label
var _pending: ColorRect
var _frame: StyleBoxFlat


func _ready() -> void:
	custom_minimum_size = Vector2(SLOT_SIZE, SLOT_SIZE)
	mouse_filter = Control.MOUSE_FILTER_STOP
	mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	_frame = StyleBoxFlat.new()
	_frame.bg_color = DesignTokens.SURFACE
	_frame.border_color = DesignTokens.BORDER
	_frame.set_border_width_all(2)
	_frame.set_corner_radius_all(2)
	add_theme_stylebox_override("panel", _frame)
	var host := Control.new()
	host.set_anchors_preset(Control.PRESET_FULL_RECT)
	host.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(host)
	_fallback = ColorRect.new()
	_fallback.set_anchors_preset(Control.PRESET_FULL_RECT)
	_fallback.offset_left = 3
	_fallback.offset_top = 3
	_fallback.offset_right = -3
	_fallback.offset_bottom = -3
	_fallback.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_fallback.visible = false
	host.add_child(_fallback)
	_icon = TextureRect.new()
	_icon.set_anchors_preset(Control.PRESET_FULL_RECT)
	_icon.offset_left = 3
	_icon.offset_top = 3
	_icon.offset_right = -3
	_icon.offset_bottom = -3
	_icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_icon.visible = false
	host.add_child(_icon)
	_quantity = Label.new()
	_quantity.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_quantity.vertical_alignment = VERTICAL_ALIGNMENT_BOTTOM
	_quantity.set_anchors_preset(Control.PRESET_FULL_RECT)
	_quantity.offset_right = -2
	_quantity.offset_bottom = -1
	_quantity.add_theme_font_size_override("font_size", 10)
	_quantity.mouse_filter = Control.MOUSE_FILTER_IGNORE
	host.add_child(_quantity)
	_lock = ColorRect.new()
	_lock.color = Color(0.05, 0.05, 0.07, 0.55)
	_lock.set_anchors_preset(Control.PRESET_FULL_RECT)
	_lock.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_lock.visible = false
	host.add_child(_lock)
	_lock_label = Label.new()
	_lock_label.text = "L"
	_lock_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_lock_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_lock_label.set_anchors_preset(Control.PRESET_FULL_RECT)
	_lock_label.add_theme_font_size_override("font_size", 11)
	_lock_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_lock.add_child(_lock_label)
	_pending = ColorRect.new()
	_pending.color = Color(0.95, 0.86, 0.32, 0.28)
	_pending.set_anchors_preset(Control.PRESET_FULL_RECT)
	_pending.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_pending.visible = false
	host.add_child(_pending)
	mouse_entered.connect(_on_mouse_entered)
	mouse_exited.connect(_on_mouse_exited)
	refresh({})


func is_empty() -> bool:
	return String(instance.get("instanceId", "")).is_empty()


func uses_fallback_icon() -> bool:
	if is_empty():
		return false
	return ItemPresentation.uses_fallback_icon(ItemPresentation.definition_for(ItemPresentation.item_id_of(instance)))


func refresh(next_instance: Dictionary, is_pending: bool = false) -> void:
	instance = next_instance.duplicate(true) if not next_instance.is_empty() else {}
	pending = is_pending
	if _frame == null:
		return
	if is_empty():
		_frame.border_color = DesignTokens.BORDER
		_frame.bg_color = DesignTokens.SURFACE
		_fallback.visible = false
		_icon.visible = false
		_icon.texture = null
		_quantity.text = ""
		_lock.visible = false
		_pending.visible = is_pending
		tooltip_text = ""
		return
	var definition: Dictionary = ItemPresentation.definition_for(ItemPresentation.item_id_of(instance))
	_frame.border_color = ItemPresentation.rarity_color(definition)
	_frame.bg_color = DesignTokens.SURFACE_RAISED
	var texture := ItemPresentation.icon_texture(definition)
	if texture != null:
		_icon.texture = texture
		_icon.visible = true
		_fallback.visible = false
	else:
		_icon.texture = null
		_icon.visible = false
		_fallback.color = ItemPresentation.fallback_color(definition)
		_fallback.visible = true
	var quantity := int(instance.get("quantity", 1))
	_quantity.text = str(quantity) if quantity > 1 else ""
	_lock.visible = ItemPresentation.is_locked(instance)
	_pending.visible = is_pending
	tooltip_text = ""


func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		var mouse := event as InputEventMouseButton
		if not mouse.pressed:
			return
		if mouse.button_index == MOUSE_BUTTON_LEFT:
			if mouse.double_click:
				slot_activated.emit(self)
			else:
				slot_pressed.emit(self)
			accept_event()
		elif mouse.button_index == MOUSE_BUTTON_RIGHT:
			slot_right_clicked.emit(self)
			accept_event()


func _on_mouse_entered() -> void:
	if is_empty():
		TooltipService.hide_tooltip()
		return
	TooltipService.show_tooltip(ItemPresentation.tooltip_text(instance, ItemPresentation.debug_tooltips_enabled()))


func _on_mouse_exited() -> void:
	TooltipService.hide_tooltip()
