class_name CorpseWindow
extends CanvasLayer

## Corpse loot presentation. Claims stay server-authoritative.

signal loot_all_requested
signal gold_requested
signal close_requested
signal entry_right_clicked(slot: ItemSlotView)
signal entry_pressed(slot: ItemSlotView)

var corpse_id: String = ""

var _root: PanelContainer
var _name_label: Label
var _ownership: Label
var _public_timer: Label
var _expire_timer: Label
var _gold_button: Button
var _grid: GridContainer
var _status: Label
var _loot_all: Button
var _close: Button
var _slots: Array = []
var _corpse: Dictionary = {}


func _ready() -> void:
	layer = 22
	_build()
	visible = false
	set_process(true)


func _process(_delta: float) -> void:
	if visible:
		_refresh_timers()


func is_open() -> bool:
	return visible


func present(payload: Dictionary) -> void:
	_corpse = payload.duplicate(true) if not payload.is_empty() else {}
	corpse_id = String(_corpse.get("corpseId", _corpse.get("id", corpse_id)))
	_name_label.text = _title()
	_refresh_ownership()
	_refresh_gold()
	_refresh_items()
	_refresh_timers()
	_status.text = ""
	_status.modulate = DesignTokens.TEXT
	_loot_all.disabled = false
	_gold_button.disabled = not _gold_claimable()
	visible = true


func show_status(message: String, is_error: bool = false) -> void:
	_loot_all.disabled = false
	_gold_button.disabled = not _gold_claimable()
	_status.text = message
	_status.modulate = DesignTokens.ERROR if is_error else DesignTokens.SUCCESS


func show_busy(message: String = "Waiting for the server…") -> void:
	_loot_all.disabled = true
	_gold_button.disabled = true
	_status.text = message
	_status.modulate = DesignTokens.TEXT_MUTED


func close_window() -> void:
	visible = false
	corpse_id = ""
	_corpse = {}
	_status.text = ""
	_clear_slots()


func close_requested_by_user() -> void:
	close_requested.emit()


func _build() -> void:
	_root = PanelContainer.new()
	_root.name = "Panel"
	_root.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
	_root.anchor_left = 0.0
	_root.anchor_top = 1.0
	_root.anchor_right = 0.0
	_root.anchor_bottom = 1.0
	_root.offset_left = 16.0
	_root.offset_top = -468.0
	_root.offset_right = 360.0
	_root.offset_bottom = -16.0
	var style := StyleBoxFlat.new()
	style.bg_color = DesignTokens.SURFACE
	style.border_color = DesignTokens.BORDER
	style.set_border_width_all(1)
	style.set_corner_radius_all(6)
	style.content_margin_left = DesignTokens.SPACE_MD
	style.content_margin_right = DesignTokens.SPACE_MD
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

	_ownership = Label.new()
	_ownership.add_theme_font_size_override("font_size", DesignTokens.FONT_CAPTION)
	_ownership.add_theme_color_override("font_color", DesignTokens.TEXT_MUTED)
	_ownership.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	vbox.add_child(_ownership)

	_public_timer = Label.new()
	_public_timer.add_theme_font_size_override("font_size", DesignTokens.FONT_CAPTION)
	_public_timer.add_theme_color_override("font_color", DesignTokens.WARNING)
	vbox.add_child(_public_timer)

	_expire_timer = Label.new()
	_expire_timer.add_theme_font_size_override("font_size", DesignTokens.FONT_CAPTION)
	_expire_timer.add_theme_color_override("font_color", DesignTokens.TEXT_MUTED)
	vbox.add_child(_expire_timer)

	_gold_button = Button.new()
	_gold_button.text = "Gold: 0"
	_gold_button.custom_minimum_size = Vector2(0, 28)
	ShellTheme.style_secondary(_gold_button)
	_gold_button.pressed.connect(_on_gold)
	vbox.add_child(_gold_button)

	_grid = GridContainer.new()
	_grid.columns = 5
	_grid.add_theme_constant_override("h_separation", 2)
	_grid.add_theme_constant_override("v_separation", 2)
	vbox.add_child(_grid)

	_status = Label.new()
	_status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_status.add_theme_font_size_override("font_size", DesignTokens.FONT_CAPTION)
	vbox.add_child(_status)

	var buttons := HBoxContainer.new()
	buttons.add_theme_constant_override("separation", DesignTokens.SPACE_SM)
	vbox.add_child(buttons)
	_loot_all = _make_button("Loot All", false)
	_loot_all.pressed.connect(_on_loot_all)
	buttons.add_child(_loot_all)
	_close = _make_button("Close", true)
	_close.pressed.connect(_on_close)
	buttons.add_child(_close)


func _make_button(text: String, secondary: bool) -> Button:
	var button := Button.new()
	button.text = text
	button.custom_minimum_size = Vector2(0, 28)
	if secondary:
		ShellTheme.style_secondary(button)
	else:
		ShellTheme.style_primary(button)
	return button


func _title() -> String:
	var enemy_id := String(_corpse.get("enemyId", ""))
	if enemy_id.is_empty():
		return "Corpse"
	var enemy: Dictionary = ContentRegistry.get_by_id(enemy_id)
	var named := String(enemy.get("displayName", ""))
	if named.is_empty():
		return "Corpse"
	return "%s remains" % named


func _refresh_ownership() -> void:
	var public_loot := bool(_corpse.get("public", false))
	var eligible := bool(_corpse.get("eligible", false))
	if public_loot:
		_ownership.text = "Public loot"
	elif eligible:
		_ownership.text = "Private loot — first claimant"
	else:
		_ownership.text = "Private loot — you are not eligible yet"


func _refresh_gold() -> void:
	var amount := int(_corpse.get("goldAmount", 0))
	var state := String(_corpse.get("goldState", ""))
	if amount <= 0 or state == "CLAIMED" or state == "EXPIRED":
		_gold_button.text = "Gold: none"
		_gold_button.disabled = true
		return
	var suffix := ""
	if state == "CLAIMING":
		suffix = " (claiming)"
	_gold_button.text = "Gold: %s%s" % [str(amount), suffix]
	_gold_button.disabled = not _gold_claimable()


func _gold_claimable() -> bool:
	var amount := int(_corpse.get("goldAmount", 0))
	var state := String(_corpse.get("goldState", ""))
	if amount <= 0:
		return false
	if state == "CLAIMED" or state == "EXPIRED" or state == "CLAIMING":
		return false
	if state == "PRIVATE_AVAILABLE" and not bool(_corpse.get("eligible", false)):
		return false
	return true


func _refresh_items() -> void:
	_clear_slots()
	var items: Variant = _corpse.get("items", [])
	if typeof(items) != TYPE_ARRAY:
		return
	var index := 0
	for entry in items:
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		var row: Dictionary = entry
		if bool(row.get("claimed", false)) or String(row.get("state", "")) == "CLAIMED" or String(row.get("state", "")) == "EXPIRED":
			continue
		var slot := ItemSlotView.new()
		slot.name = "CorpseSlot%s" % str(index)
		slot.origin_kind = "corpse"
		slot.slot_index = index
		slot.slot_pressed.connect(_on_slot_pressed)
		slot.slot_right_clicked.connect(_on_slot_right_clicked)
		_grid.add_child(slot)
		slot.refresh(_item_instance(row), String(row.get("state", "")) == "ROLL_PENDING")
		_slots.append(slot)
		index += 1


func _item_instance(entry: Dictionary) -> Dictionary:
	var instance: Dictionary = {
		"instanceId": String(entry.get("entryId", "")),
		"entryId": String(entry.get("entryId", "")),
		"itemId": String(entry.get("itemId", "")),
		"quantity": int(entry.get("quantity", 1)),
		"state": String(entry.get("state", "")),
		"reservedToSelf": bool(entry.get("reservedToSelf", false)),
	}
	var state := String(entry.get("state", ""))
	if state == "ROLL_PENDING":
		instance["lockReason"] = "roll_pending"
	elif state == "AWARDED_PENDING_PICKUP" and not bool(entry.get("reservedToSelf", false)):
		instance["lockReason"] = "reserved"
	return instance


func _clear_slots() -> void:
	for child in _grid.get_children():
		_grid.remove_child(child)
		child.queue_free()
	_slots.clear()


func _refresh_timers() -> void:
	var now := int(AppState.zone_view.get("tick", _corpse.get("tick", 0)))
	var public_done := bool(_corpse.get("public", false))
	if public_done:
		_public_timer.text = "Public now"
		_public_timer.modulate = DesignTokens.SUCCESS
	else:
		var public_sec := _seconds_until(int(_corpse.get("privateUntilTick", 0)), now)
		_public_timer.text = "Public in %ss" % str(public_sec)
		_public_timer.modulate = DesignTokens.WARNING
	var expire_sec := _seconds_until(int(_corpse.get("expiresAtTick", 0)), now)
	_expire_timer.text = "Expires in %ss" % str(expire_sec)


func _seconds_until(until_tick: int, now_tick: int) -> int:
	var ticks := until_tick - now_tick
	if ticks <= 0:
		return 0
	return ceili(float(ticks) / MatchProtocol.SNAPSHOT_RATE_HZ)


func _on_loot_all() -> void:
	loot_all_requested.emit()


func _on_gold() -> void:
	if _gold_claimable():
		gold_requested.emit()


func _on_close() -> void:
	close_requested.emit()


func _on_slot_pressed(slot: ItemSlotView) -> void:
	entry_pressed.emit(slot)


func _on_slot_right_clicked(slot: ItemSlotView) -> void:
	entry_right_clicked.emit(slot)
