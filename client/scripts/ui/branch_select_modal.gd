class_name BranchSelectModal
extends UxModal

## Level-5 branch choice. Closing leaves the character branchless.

signal branch_chosen(branch_id: String)
signal closed_without_choice

var _cards: VBoxContainer
var _status: Label
var _selected: String = ""
var _confirm: Button
var _close: Button
var _presented: bool = false


func _ready() -> void:
	super._ready()
	panel.offset_left = -300
	panel.offset_top = -220
	panel.offset_right = 300
	panel.offset_bottom = 220
	var title := Label.new()
	title.name = "Title"
	title.text = "Choose a branch"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", DesignTokens.FONT_HEADING)
	title.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	var help := Label.new()
	help.name = "Help"
	help.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	help.text = "Exactly two branches are available. Branch is permanent until a trainer respec. Closing this screen leaves you branchless. No default is selected."
	_status = Label.new()
	_status.name = "Status"
	_status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_cards = VBoxContainer.new()
	_cards.name = "Cards"
	_cards.add_theme_constant_override("separation", DesignTokens.SPACE_SM)
	var row := HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_END
	_close = Button.new()
	_close.name = "CloseWithoutChoice"
	_close.text = "Close without choosing"
	ShellTheme.style_secondary(_close)
	_close.pressed.connect(_on_close)
	_confirm = Button.new()
	_confirm.name = "ConfirmBranch"
	_confirm.text = "Confirm branch"
	ShellTheme.style_primary(_confirm)
	_confirm.disabled = true
	_confirm.pressed.connect(_on_confirm)
	row.add_child(_close)
	row.add_child(_confirm)
	body.add_child(title)
	body.add_child(help)
	body.add_child(_cards)
	body.add_child(_status)
	body.add_child(row)


func present_for_class(class_id: String) -> void:
	if body == null:
		_ready()
	_selected = ""
	_presented = true
	_confirm.disabled = true
	_status.text = ""
	for child in _cards.get_children():
		child.queue_free()
	var ids := ProgressionCatalog.branch_ids_for_class(class_id)
	for branch_id in ids:
		_cards.add_child(_make_card(branch_id))
	present()
	_close.grab_focus()


func selected_branch_id() -> String:
	return _selected


func _make_card(branch_id: String) -> Button:
	var branch := ProgressionCatalog.branch_record(branch_id)
	var card := Button.new()
	card.toggle_mode = true
	card.focus_mode = Control.FOCUS_ALL
	card.set_meta("branch_id", branch_id)
	card.theme_type_variation = "SecondaryButton"
	card.custom_minimum_size = Vector2(0, 88)
	var name := ProgressionCatalog.branch_display_name(branch_id)
	var signature_id := String(branch.get("signatureAbilityId", ""))
	var signature := ContentRegistry.get_by_id(signature_id)
	var signature_name := String(signature.get("displayName", signature_id))
	var role := String(branch.get("displayName", name))
	card.text = "%s\nRole: %s.\nSignature: %s.\nPermanent until trainer respec." % [name, role, signature_name]
	card.pressed.connect(func() -> void:
		_selected = branch_id
		_confirm.disabled = ProgressionService.is_busy()
		for child in _cards.get_children():
			if child is Button:
				(child as Button).button_pressed = String((child as Button).get_meta("branch_id", "")) == branch_id
	)
	return card


func _on_confirm() -> void:
	if _selected.is_empty() or ProgressionService.is_busy():
		return
	_confirm.disabled = true
	var request_id := ProgressionService.request_select_branch(_selected)
	if request_id.is_empty():
		_confirm.disabled = false
		_status.text = ProgressionService.last_rejection_message if not ProgressionService.last_rejection_message.is_empty() else "Could not send branch selection."
		return
	visible = false
	_presented = false
	branch_chosen.emit(_selected)


func _on_close() -> void:
	hide_modal()
	_presented = false
	closed_without_choice.emit()


func _unhandled_input(event: InputEvent) -> void:
	if not visible:
		return
	if event.is_action_pressed("ui_cancel"):
		_on_close()
		get_viewport().set_input_as_handled()
