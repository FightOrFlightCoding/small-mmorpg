class_name RespecConfirmDialog
extends UxModal

## Trainer respec confirmation. Gold cost is displayed; the server remains authority.

signal respec_confirmed
signal respec_cancelled

var title_label: Label
var cost_label: Label
var resets_label: Label
var remains_label: Label
var unspent_label: Label
var branch_label: Label
var error_label: Label
var confirm_button: Button
var cancel_button: Button
var _busy: bool = false


func _ready() -> void:
	super._ready()
	panel.offset_left = -320
	panel.offset_top = -240
	panel.offset_right = 320
	panel.offset_bottom = 240
	title_label = Label.new()
	title_label.name = "Title"
	title_label.text = "Confirm respec"
	title_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title_label.add_theme_font_size_override("font_size", DesignTokens.FONT_HEADING)
	cost_label = _wrap("GoldCost")
	resets_label = _wrap("Resets")
	remains_label = _wrap("Remains")
	unspent_label = _wrap("UnspentPreview")
	branch_label = _wrap("BranchPrompt")
	error_label = _wrap("Error")
	error_label.add_theme_color_override("font_color", DesignTokens.ERROR)
	var row := HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_END
	cancel_button = Button.new()
	cancel_button.name = "CancelRespec"
	cancel_button.text = "Cancel"
	ShellTheme.style_secondary(cancel_button)
	cancel_button.pressed.connect(_on_cancel)
	confirm_button = Button.new()
	confirm_button.name = "ConfirmRespec"
	confirm_button.text = "Confirm respec"
	ShellTheme.style_destructive(confirm_button, false)
	confirm_button.pressed.connect(_on_confirm)
	row.add_child(cancel_button)
	row.add_child(confirm_button)
	body.add_child(title_label)
	body.add_child(cost_label)
	body.add_child(resets_label)
	body.add_child(remains_label)
	body.add_child(unspent_label)
	body.add_child(branch_label)
	body.add_child(error_label)
	body.add_child(row)


func present_summary() -> void:
	if body == null:
		_ready()
	_busy = false
	var summary := ProgressionService.respec_summary()
	var cost := int(summary.get("gold_cost", 0))
	var have := int(summary.get("gold_have", 0))
	cost_label.text = "Gold cost: %s (you have %s). Cost is 50 × current level. The server still confirms the charge." % [str(cost), str(have)]
	resets_label.text = "Resets: %s" % String(summary.get("resets", ""))
	remains_label.text = "Remains: %s" % String(summary.get("remains", ""))
	unspent_label.text = "After a successful respec you will have %s unspent free points, %s unspent class points, and %s unspent branch points." % [
		str(int(summary.get("unspent_free", 0))),
		str(int(summary.get("unspent_class", 0))),
		str(int(summary.get("unspent_branch", 0))),
	]
	if bool(summary.get("reselect_branch", false)):
		branch_label.text = "You will be branchless and must choose a branch again. No default is selected."
	else:
		branch_label.text = "Branch choice is not required below level 5."
	if not bool(summary.get("can_afford", false)):
		error_label.text = "Not enough gold for this respec."
		confirm_button.disabled = true
	else:
		error_label.text = ""
		confirm_button.disabled = ProgressionService.is_busy()
	present()
	cancel_button.grab_focus()


func _wrap(node_name: String) -> Label:
	var label := Label.new()
	label.name = node_name
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	return label


func _on_confirm() -> void:
	if _busy or ProgressionService.is_busy():
		return
	if InnService.last_npc_id.is_empty():
		error_label.text = "Stand at the trainer to respec."
		return
	_busy = true
	confirm_button.disabled = true
	var request_id := InnService.request_respec()
	if request_id.is_empty():
		_busy = false
		confirm_button.disabled = false
		if WalletService.gold < ProgressionCatalog.respec_gold_cost(ProgressionService.level):
			error_label.text = "Not enough gold for this respec."
		else:
			error_label.text = ProgressionService.last_rejection_message if not ProgressionService.last_rejection_message.is_empty() else "Could not send respec."
		return
	visible = false
	respec_confirmed.emit()


func _on_cancel() -> void:
	hide_modal()
	respec_cancelled.emit()


func _unhandled_input(event: InputEvent) -> void:
	if not visible:
		return
	if event.is_action_pressed("ui_cancel"):
		_on_cancel()
		get_viewport().set_input_as_handled()
