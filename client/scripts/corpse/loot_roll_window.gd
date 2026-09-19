class_name LootRollWindow
extends CanvasLayer

## Simultaneous Need/Greed cards. The client never submits a roll number.

signal choice_requested(roll_id: String, choice: String)

var _host: VBoxContainer
var _cards: Dictionary = {}


func _ready() -> void:
	layer = 23
	_build()
	visible = false
	set_process(true)


func _process(_delta: float) -> void:
	if not visible:
		return
	for key in _cards.keys():
		var card: Dictionary = _cards[key]
		_refresh_countdown(card)


func present_roll(roll: Dictionary) -> void:
	var roll_id := String(roll.get("rollId", ""))
	if roll_id.is_empty():
		return
	if not _cards.has(roll_id):
		_cards[roll_id] = _make_card(roll_id)
		_host.add_child((_cards[roll_id]["root"] as Control))
	_apply_roll(_cards[roll_id], roll)
	visible = true


func roll_count() -> int:
	return _cards.size()


func card_text(roll_id: String) -> String:
	if not _cards.has(roll_id):
		return ""
	var card: Dictionary = _cards[roll_id]
	return String((card["name"] as Label).text) + " " + String((card["result"] as Label).text)


func close_window() -> void:
	for key in _cards.keys():
		var card: Dictionary = _cards[key]
		var root: Control = card["root"]
		if is_instance_valid(root):
			root.queue_free()
	_cards.clear()
	visible = false


func _build() -> void:
	var root := MarginContainer.new()
	root.name = "Root"
	root.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	root.anchor_left = 1.0
	root.anchor_right = 1.0
	root.anchor_top = 0.0
	root.anchor_bottom = 0.0
	root.offset_left = -380.0
	root.offset_top = 72.0
	root.offset_right = -16.0
	root.offset_bottom = 420.0
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(root)
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	root.add_child(scroll)
	_host = VBoxContainer.new()
	_host.add_theme_constant_override("separation", DesignTokens.SPACE_SM)
	scroll.add_child(_host)


func _make_card(roll_id: String) -> Dictionary:
	var panel := PanelContainer.new()
	panel.name = "Roll_" + roll_id
	var style := StyleBoxFlat.new()
	style.bg_color = DesignTokens.SURFACE
	style.border_color = DesignTokens.BORDER
	style.set_border_width_all(1)
	style.set_corner_radius_all(6)
	style.content_margin_left = DesignTokens.SPACE_MD
	style.content_margin_right = DesignTokens.SPACE_MD
	style.content_margin_top = DesignTokens.SPACE_SM
	style.content_margin_bottom = DesignTokens.SPACE_SM
	panel.add_theme_stylebox_override("panel", style)
	var vbox := VBoxContainer.new()
	vbox.add_theme_constant_override("separation", DesignTokens.SPACE_XS)
	panel.add_child(vbox)
	var header := HBoxContainer.new()
	header.add_theme_constant_override("separation", DesignTokens.SPACE_SM)
	vbox.add_child(header)
	var icon := ItemSlotView.new()
	icon.origin_kind = "loot_roll"
	icon.mouse_filter = Control.MOUSE_FILTER_STOP
	header.add_child(icon)
	var titles := VBoxContainer.new()
	titles.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(titles)
	var name_label := Label.new()
	name_label.add_theme_font_size_override("font_size", DesignTokens.FONT_BODY)
	name_label.add_theme_color_override("font_color", DesignTokens.TEXT)
	titles.add_child(name_label)
	var rarity := Label.new()
	rarity.add_theme_font_size_override("font_size", DesignTokens.FONT_CAPTION)
	titles.add_child(rarity)
	var quantity := Label.new()
	quantity.add_theme_font_size_override("font_size", DesignTokens.FONT_CAPTION)
	quantity.add_theme_color_override("font_color", DesignTokens.TEXT_MUTED)
	titles.add_child(quantity)
	var countdown := Label.new()
	countdown.add_theme_font_size_override("font_size", DesignTokens.FONT_CAPTION)
	countdown.add_theme_color_override("font_color", DesignTokens.WARNING)
	vbox.add_child(countdown)
	var choice := Label.new()
	choice.add_theme_font_size_override("font_size", DesignTokens.FONT_CAPTION)
	choice.add_theme_color_override("font_color", DesignTokens.TEXT_MUTED)
	vbox.add_child(choice)
	var result := Label.new()
	result.add_theme_font_size_override("font_size", DesignTokens.FONT_CAPTION)
	result.add_theme_color_override("font_color", DesignTokens.SUCCESS)
	vbox.add_child(result)
	var buttons := HBoxContainer.new()
	buttons.add_theme_constant_override("separation", DesignTokens.SPACE_XS)
	vbox.add_child(buttons)
	var need := Button.new()
	need.text = "Need"
	need.pressed.connect(func() -> void: choice_requested.emit(roll_id, "NEED"))
	buttons.add_child(need)
	var greed := Button.new()
	greed.text = "Greed"
	greed.pressed.connect(func() -> void: choice_requested.emit(roll_id, "GREED"))
	buttons.add_child(greed)
	var passed := Button.new()
	passed.text = "Pass"
	passed.pressed.connect(func() -> void: choice_requested.emit(roll_id, "PASS"))
	buttons.add_child(passed)
	return {
		"root": panel,
		"icon": icon,
		"name": name_label,
		"rarity": rarity,
		"quantity": quantity,
		"countdown": countdown,
		"choice": choice,
		"result": result,
		"need": need,
		"greed": greed,
		"pass": passed,
		"closes_at": 0,
		"tick": 0,
		"roll_id": roll_id,
	}


func _apply_roll(card: Dictionary, roll: Dictionary) -> void:
	var item_id := String(roll.get("itemId", ""))
	var instance := {
		"itemId": item_id,
		"instanceId": String(roll.get("itemInstanceId", item_id)),
		"quantity": int(roll.get("quantity", 1)),
	}
	(card["icon"] as ItemSlotView).refresh(instance)
	var definition := ItemPresentation.definition_for(item_id)
	(card["name"] as Label).text = ItemPresentation.display_name(instance, definition)
	var rarity_label := ItemPresentation.rarity_label(definition)
	(card["rarity"] as Label).text = rarity_label
	(card["rarity"] as Label).add_theme_color_override("font_color", ItemPresentation.rarity_color(definition))
	(card["quantity"] as Label).text = "x%s" % str(maxi(1, int(roll.get("quantity", 1))))
	card["closes_at"] = int(roll.get("closesAt", 0))
	card["tick"] = int(roll.get("tick", 0))
	_refresh_countdown(card)
	var own := String(roll.get("ownChoice", ""))
	if own.is_empty():
		(card["choice"] as Label).text = "Choose Need, Greed, or Pass."
	else:
		(card["choice"] as Label).text = "You selected %s." % own
	var state := String(roll.get("state", "OPEN"))
	var open := state == "OPEN"
	(card["need"] as Button).disabled = not open or not own.is_empty()
	(card["greed"] as Button).disabled = not open or not own.is_empty()
	(card["pass"] as Button).disabled = not open or not own.is_empty()
	if state == "ALL_PASSED":
		(card["result"] as Label).text = "Everyone passed. The item is public."
	elif state == "AWARDED" or state == "PENDING_PICKUP":
		var winner := String(roll.get("winnerCharacterId", ""))
		var winning := String(roll.get("winningChoice", ""))
		var value := int(roll.get("winningRoll", 0))
		(card["result"] as Label).text = "%s won with %s (%s)." % [winner, winning, str(value)]
	else:
		(card["result"] as Label).text = ""


func _refresh_countdown(card: Dictionary) -> void:
	var closes_at := int(card.get("closes_at", 0))
	var tick := int(card.get("tick", 0))
	var remaining := closes_at - tick
	if remaining < 0:
		remaining = 0
	var seconds := ceili(float(remaining) / MatchProtocol.INPUT_SEND_HZ)
	(card["countdown"] as Label).text = "Closes in %ss" % str(seconds)
