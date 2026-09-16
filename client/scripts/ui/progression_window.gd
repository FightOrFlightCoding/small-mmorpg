class_name ProgressionWindow
extends Control

## Player-facing progression UI. Intentions only; canonical results come from the server.

const TABS := ["Sheet", "Allocate", "Class", "Branch", "Abilities", "Builds"]

var branch_modal: BranchSelectModal
var respec_dialog: RespecConfirmDialog
var _tabs: TabContainer
var _status: Label
var _error: Label
var _header: Label
var _xp_bar: ProgressBar
var _xp_current: Label
var _xp_next: Label
var _lifetime: Label
var _points: Label
var _derived_host: VBoxContainer
var _stat_host: VBoxContainer
var _allocate_host: VBoxContainer
var _allocate_remaining: Label
var _confirm_allocate: Button
var _cancel_allocate: Button
var _auto_toggle: CheckBox
var _auto_now: Button
var _class_tree_host: VBoxContainer
var _class_tree_meta: Label
var _branch_tree_host: VBoxContainer
var _branch_tree_meta: Label
var _branch_guidance: Label
var _choose_branch: Button
var _auto_attack_label: Label
var _ability_actives: VBoxContainer
var _ability_passives: VBoxContainer
var _ability_locked: VBoxContainer
var _hotbar_host: HBoxContainer
var _builds_host: VBoxContainer
var _dev_details: Label
var _bound: bool = false
var _allocate_fingerprint: String = ""
var _suppress_auto_toggle: bool = false


func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	visible = false
	focus_mode = Control.FOCUS_ALL
	ShellTheme.apply(self)
	_build()
	_bind_signals()
	refresh()


func _bind_signals() -> void:
	if _bound:
		return
	_bound = true
	WindowManager.connect_once(ProgressionService.progression_changed, refresh)
	WindowManager.connect_once(ProgressionService.pending_changed, refresh)
	WindowManager.connect_once(ProgressionService.action_failed, _on_action_failed)
	WindowManager.connect_once(ProgressionService.action_succeeded, _on_action_succeeded)
	WindowManager.connect_once(AbilityService.abilities_changed, refresh)
	WindowManager.connect_once(WalletService.wallet_changed, refresh)
	WindowManager.connect_once(UiStateService.ui_state_changed, refresh)


func refresh() -> void:
	if _header == null:
		return
	_refresh_header()
	_refresh_sheet()
	_refresh_allocate()
	_refresh_class_tree()
	_refresh_branch_tree()
	_refresh_abilities()
	_refresh_builds()
	_refresh_status()


func show_window() -> void:
	visible = true
	refresh()
	if ProgressionService.pending_branch_selection and (branch_modal == null or not branch_modal.visible):
		present_branch_modal()
	var focus := _first_focusable()
	if focus != null:
		focus.grab_focus()


func hide_window() -> void:
	visible = false
	if branch_modal != null:
		branch_modal.visible = false
	if respec_dialog != null:
		respec_dialog.visible = false


func find_ui(node_name: String) -> Node:
	return find_child(node_name, true, false)


func present_branch_modal() -> void:
	if branch_modal == null:
		return
	branch_modal.present_for_class(ProgressionService.class_id)


func present_respec() -> void:
	if respec_dialog == null:
		return
	respec_dialog.present_summary()


func _build() -> void:
	var dim := ColorRect.new()
	dim.color = Color(0, 0, 0, 0.45)
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	dim.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(dim)
	var panel := PanelContainer.new()
	panel.name = "Panel"
	panel.set_anchors_preset(Control.PRESET_CENTER)
	panel.offset_left = -460
	panel.offset_top = -300
	panel.offset_right = 460
	panel.offset_bottom = 300
	add_child(panel)
	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", DesignTokens.SPACE_LG)
	margin.add_theme_constant_override("margin_right", DesignTokens.SPACE_LG)
	margin.add_theme_constant_override("margin_top", DesignTokens.SPACE_MD)
	margin.add_theme_constant_override("margin_bottom", DesignTokens.SPACE_MD)
	panel.add_child(margin)
	var root := VBoxContainer.new()
	root.add_theme_constant_override("separation", DesignTokens.SPACE_SM)
	margin.add_child(root)
	var top := HBoxContainer.new()
	_header = _label("Header", "Character")
	_header.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_header.add_theme_font_size_override("font_size", DesignTokens.FONT_HEADING)
	var close := Button.new()
	close.name = "Close"
	close.text = "Close"
	ShellTheme.style_secondary(close)
	close.pressed.connect(func() -> void: WindowManager.close(WindowManager.CHARACTER))
	top.add_child(_header)
	top.add_child(close)
	root.add_child(top)
	_status = _label("StatusBanner", "")
	_status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	root.add_child(_status)
	_error = _label("ErrorBanner", "")
	_error.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_error.add_theme_color_override("font_color", DesignTokens.ERROR)
	root.add_child(_error)
	_tabs = TabContainer.new()
	_tabs.name = "Tabs"
	_tabs.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_tabs.focus_mode = Control.FOCUS_ALL
	root.add_child(_tabs)
	_tabs.add_child(_build_sheet())
	_tabs.add_child(_build_allocate())
	_tabs.add_child(_build_class_tab())
	_tabs.add_child(_build_branch_tab())
	_tabs.add_child(_build_abilities())
	_tabs.add_child(_build_builds())
	branch_modal = BranchSelectModal.new()
	branch_modal.name = "BranchModal"
	branch_modal.closed_without_choice.connect(func() -> void: refresh())
	add_child(branch_modal)
	respec_dialog = RespecConfirmDialog.new()
	respec_dialog.name = "RespecDialog"
	add_child(respec_dialog)


func _build_sheet() -> Control:
	var scroll := _scroll("Sheet")
	var box := scroll.get_child(0) as VBoxContainer
	_xp_bar = ProgressBar.new()
	_xp_bar.name = "XpBar"
	_xp_bar.min_value = 0
	_xp_bar.max_value = 1
	_xp_bar.step = 0.0001
	_xp_bar.show_percentage = false
	_xp_bar.custom_minimum_size = Vector2(0, 18)
	_xp_current = _label("XpCurrent", "Current XP: 0")
	_xp_next = _label("XpToNext", "XP to next: 0")
	_lifetime = _label("LifetimeXp", "Lifetime XP: 0")
	_points = _label("UnspentPoints", "")
	_points.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_derived_host = VBoxContainer.new()
	_derived_host.name = "DerivedHost"
	_stat_host = VBoxContainer.new()
	_stat_host.name = "StatHost"
	_dev_details = _label("DevDetails", "")
	_dev_details.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	box.add_child(_xp_bar)
	box.add_child(_xp_current)
	box.add_child(_xp_next)
	box.add_child(_points)
	box.add_child(_label("StatsHeading", "Eight base stats"))
	box.add_child(_stat_host)
	box.add_child(_label("DerivedHeading", "Derived combat values"))
	box.add_child(_derived_host)
	box.add_child(_label("DevHeading", "Development details"))
	box.add_child(_lifetime)
	box.add_child(_dev_details)
	return scroll


func _build_allocate() -> Control:
	var scroll := _scroll("Allocate")
	var box := scroll.get_child(0) as VBoxContainer
	var help := _label("AllocateHelp", "Plus adds a pending point. Already committed points cannot be decremented except by trainer respec. Confirm sends one batch. Preview totals are not authority.")
	help.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_allocate_remaining = _label("RemainingPreview", "Remaining: 0")
	_allocate_host = VBoxContainer.new()
	_allocate_host.name = "AllocateHost"
	_auto_toggle = CheckBox.new()
	_auto_toggle.name = "AutoAssignToggle"
	_auto_toggle.text = "Auto-assign new free points on level up"
	_auto_toggle.focus_mode = Control.FOCUS_ALL
	_auto_toggle.toggled.connect(_on_auto_toggled)
	_auto_now = Button.new()
	_auto_now.name = "AssignUnspentAutomatically"
	_auto_now.text = "Assign Current Unspent Points Automatically"
	ShellTheme.style_secondary(_auto_now)
	_auto_now.pressed.connect(func() -> void: ProgressionService.request_auto_assign_unspent())
	var row := HBoxContainer.new()
	_cancel_allocate = Button.new()
	_cancel_allocate.name = "CancelAllocate"
	_cancel_allocate.text = "Cancel"
	ShellTheme.style_secondary(_cancel_allocate)
	_cancel_allocate.pressed.connect(func() -> void: ProgressionService.clear_pending_allocations())
	_confirm_allocate = Button.new()
	_confirm_allocate.name = "ConfirmAllocate"
	_confirm_allocate.text = "Confirm"
	ShellTheme.style_primary(_confirm_allocate)
	_confirm_allocate.pressed.connect(func() -> void: ProgressionService.confirm_pending_allocations())
	row.add_child(_cancel_allocate)
	row.add_child(_confirm_allocate)
	box.add_child(help)
	box.add_child(_allocate_remaining)
	box.add_child(_allocate_host)
	box.add_child(_auto_toggle)
	box.add_child(_auto_now)
	box.add_child(row)
	return scroll


func _build_class_tab() -> Control:
	var scroll := _scroll("Class")
	var box := scroll.get_child(0) as VBoxContainer
	_class_tree_meta = _label("ClassTreeMeta", "")
	_class_tree_meta.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_class_tree_host = VBoxContainer.new()
	_class_tree_host.name = "ClassTreeHost"
	box.add_child(_class_tree_meta)
	box.add_child(_class_tree_host)
	return scroll


func _build_branch_tab() -> Control:
	var scroll := _scroll("Branch")
	var box := scroll.get_child(0) as VBoxContainer
	_branch_guidance = _label("BranchGuidance", "")
	_branch_guidance.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_choose_branch = Button.new()
	_choose_branch.name = "OpenBranchModal"
	_choose_branch.text = "Choose a branch"
	ShellTheme.style_primary(_choose_branch)
	_choose_branch.pressed.connect(present_branch_modal)
	_branch_tree_meta = _label("BranchTreeMeta", "")
	_branch_tree_meta.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_branch_tree_host = VBoxContainer.new()
	_branch_tree_host.name = "BranchTreeHost"
	box.add_child(_branch_guidance)
	box.add_child(_choose_branch)
	box.add_child(_branch_tree_meta)
	box.add_child(_branch_tree_host)
	return scroll


func _build_abilities() -> Control:
	var scroll := _scroll("Abilities")
	var box := scroll.get_child(0) as VBoxContainer
	_auto_attack_label = _label("AutoAttack", "Auto-attack: —")
	_auto_attack_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_ability_actives = VBoxContainer.new()
	_ability_actives.name = "OwnedActives"
	_ability_passives = VBoxContainer.new()
	_ability_passives.name = "Passives"
	_ability_locked = VBoxContainer.new()
	_ability_locked.name = "LockedMilestones"
	_hotbar_host = HBoxContainer.new()
	_hotbar_host.name = "HotbarAssign"
	box.add_child(_auto_attack_label)
	box.add_child(_label("ActivesHeading", "Owned active skills"))
	box.add_child(_ability_actives)
	box.add_child(_label("PassivesHeading", "Passive skills"))
	box.add_child(_ability_passives)
	box.add_child(_label("LockedHeading", "Locked milestone skills"))
	box.add_child(_ability_locked)
	box.add_child(_label("HotbarHeading", "Hotbar (4 active slots). Passives and auto-attack cannot be assigned."))
	box.add_child(_hotbar_host)
	return scroll


func _build_builds() -> Control:
	var scroll := _scroll("Builds")
	var box := scroll.get_child(0) as VBoxContainer
	var help := _label("BuildHelp", "Optional, nonbinding reference-build guidance. The UI never auto-spends from a reference build.")
	help.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_builds_host = VBoxContainer.new()
	_builds_host.name = "BuildsHost"
	box.add_child(help)
	box.add_child(_builds_host)
	return scroll


func _refresh_header() -> void:
	var branch_name := ProgressionCatalog.branch_display_name(ProgressionService.branch_id)
	if ProgressionService.pending_branch_selection:
		branch_name = "None — choose a branch"
	_header.text = "%s · %s · Level %s" % [
		ProgressionService.class_display_name if not ProgressionService.class_display_name.is_empty() else "No class",
		branch_name,
		str(ProgressionService.level),
	]


func _refresh_status() -> void:
	var parts := PackedStringArray()
	if ProgressionService.is_link_dead():
		parts.append("Link-dead: this character is still in the world. Progression actions are paused.")
	if ProgressionService.pending_branch_selection:
		parts.append("You have no branch. Open Branch and confirm a choice. Closing leaves you branchless.")
	if AppState.is_reconnecting:
		parts.append("Reconnecting — last confirmed progression is shown.")
	_status.text = " ".join(parts)
	_status.visible = not parts.is_empty()
	_error.text = ProgressionService.last_rejection_message
	_error.visible = not ProgressionService.last_rejection_message.is_empty()
	var busy := ProgressionService.is_busy() or ProgressionService.is_link_dead()
	if _confirm_allocate != null:
		_confirm_allocate.disabled = busy or ProgressionService.pending_total() < 1
	if _cancel_allocate != null:
		_cancel_allocate.disabled = ProgressionService.pending_total() < 1
	if _auto_now != null:
		_auto_now.disabled = busy or ProgressionService.unspent_stat_points() < 1
	if _choose_branch != null:
		_choose_branch.disabled = not ProgressionService.pending_branch_selection or busy


func _refresh_sheet() -> void:
	var ratio := ProgressionCatalog.xp_ratio(ProgressionService.current_xp, ProgressionService.xp_to_next, ProgressionService.at_max_level)
	_xp_bar.value = ratio
	_xp_bar.tooltip_text = "Current XP %s of %s to next level." % [str(ProgressionService.current_xp), str(ProgressionService.xp_to_next)]
	_xp_current.text = "Current XP: %s" % str(ProgressionService.current_xp)
	if ProgressionService.at_max_level:
		_xp_next.text = "XP to next: level cap reached"
	else:
		_xp_next.text = "XP to next: %s" % str(ProgressionService.xp_to_next)
	_lifetime.text = "Lifetime XP: %s" % str(ProgressionService.lifetime_xp)
	_points.text = "Unspent free stat points: %s. Unspent class points: %s. Unspent branch points: %s." % [
		str(ProgressionService.unspent_stat_points()),
		str(ProgressionService.unspent_class_points),
		str(ProgressionService.unspent_branch_points),
	]
	_rebuild_stat_breakdown()
	_rebuild_derived()
	_dev_details.text = "Lifetime XP is a development detail. UI scale %s. Values on this sheet are mirrored from the server." % str(UiStateService.ui_scale)


func _rebuild_stat_breakdown() -> void:
	_clear(_stat_host)
	for stat_id in ProgressionCatalog.STAT_IDS:
		var automatic := float(ProgressionService.base_attributes.get(stat_id, 0))
		var free := float(ProgressionService.free_stat_allocations.get(stat_id, 0))
		var pending := float(ProgressionService.pending_allocations.get(stat_id, 0))
		var total := float(ProgressionService.derived.get(stat_id, automatic + free))
		var remainder := maxf(total - automatic - free, 0.0)
		var row := VBoxContainer.new()
		row.name = "Stat_%s" % stat_id.replace(".", "_")
		var title := _label("Name", "%s (%s)" % [ProgressionCatalog.stat_label(stat_id), ProgressionCatalog.stat_short(stat_id)])
		title.add_theme_font_size_override("font_size", DesignTokens.FONT_HEADING)
		row.add_child(title)
		row.add_child(_label("Automatic", "Automatic growth: %s" % _num(automatic)))
		row.add_child(_label("Free", "Free allocations: %s" % _num(free)))
		if pending > 0.0:
			row.add_child(_label("Pending", "Pending allocation preview: +%s" % _num(pending)))
		row.add_child(_label("Equipment", "Equipment contribution: %s (includes other modifiers until a later split)" % _num(remainder)))
		row.add_child(_label("Temporary", "Temporary effects: listed on the combat HUD; they are not client-authored."))
		row.add_child(_label("Total", "Final total: %s" % _num(total + pending)))
		_stat_host.add_child(row)


func _rebuild_derived() -> void:
	_clear(_derived_host)
	_derived_host.add_child(_derived_line("formula.hp_max", true))
	if ProgressionService.uses_mana():
		_derived_host.add_child(_derived_line("formula.mana_max", true))
		_derived_host.add_child(_derived_line("formula.mana_regen", true))
	else:
		var none := _label("NoMana", "Mana and regeneration: not used by this class.")
		none.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		_derived_host.add_child(none)
	_derived_host.add_child(_derived_line("formula.crit_chance", true))
	_derived_host.add_child(_derived_line("formula.crit_mult", true))
	_derived_host.add_child(_derived_line("formula.haste_mult", true))
	_derived_host.add_child(_derived_line("formula.damage_reduction", true))


func _derived_line(stat_id: String, _required: bool) -> Label:
	var value: Variant = ProgressionService.derived.get(stat_id, 0)
	return _label(stat_id.replace(".", "_"), "%s: %s" % [
		ProgressionCatalog.derived_label(stat_id),
		ProgressionCatalog.format_derived(stat_id, value),
	])


func _refresh_allocate() -> void:
	_allocate_remaining.text = "Remaining unspent after pending: %s of %s." % [
		str(ProgressionService.remaining_preview()),
		str(ProgressionService.unspent_stat_points()),
	]
	_suppress_auto_toggle = true
	_auto_toggle.button_pressed = ProgressionService.auto_assign_enabled
	_suppress_auto_toggle = false
	var fingerprint := ",".join(ProgressionService.attribute_ids())
	if fingerprint != _allocate_fingerprint:
		_allocate_fingerprint = fingerprint
		_clear(_allocate_host)
		for stat_id in ProgressionService.attribute_ids():
			_allocate_host.add_child(_allocate_row(stat_id))
	else:
		for child in _allocate_host.get_children():
			_update_allocate_row(child)
	_confirm_allocate.disabled = ProgressionService.is_busy() or ProgressionService.is_link_dead() or ProgressionService.pending_total() < 1


func _allocate_row(stat_id: String) -> Control:
	var row := HBoxContainer.new()
	row.name = "Alloc_%s" % stat_id.replace(".", "_")
	row.set_meta("stat_id", stat_id)
	var name := _label("Name", ProgressionCatalog.stat_label(stat_id))
	name.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	name.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	var values := _label("Values", "")
	values.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var plus := Button.new()
	plus.name = "Plus"
	plus.text = "+"
	plus.custom_minimum_size = Vector2(40, 28)
	ShellTheme.style_primary(plus)
	plus.pressed.connect(_queue_stat.bind(stat_id))
	row.add_child(name)
	row.add_child(values)
	row.add_child(plus)
	_update_allocate_row(row)
	return row


func _update_allocate_row(row: Node) -> void:
	if not (row is HBoxContainer):
		return
	var stat_id := String(row.get_meta("stat_id", ""))
	var values := row.get_node_or_null("Values")
	if values is Label:
		(values as Label).text = "Committed %s · pending %s · preview %s" % [
			str(int(ProgressionService.free_stat_allocations.get(stat_id, 0))),
			str(int(ProgressionService.pending_allocations.get(stat_id, 0))),
			str(ProgressionService.preview_free_for(stat_id)),
		]
	var plus := row.get_node_or_null("Plus")
	if plus is Button:
		(plus as Button).disabled = ProgressionService.remaining_preview() < 1 or ProgressionService.is_busy() or ProgressionService.is_link_dead()


func _refresh_class_tree() -> void:
	var tree_id := ProgressionCatalog.class_tree_id(ProgressionService.class_id)
	_class_tree_meta.text = "Class tree: three nodes, two total earned points. Points spent: %s. Points available: %s." % [
		str(ProgressionService.purchased_class_node_ids.size()),
		str(ProgressionService.unspent_class_points),
	]
	_rebuild_tree(_class_tree_host, tree_id, false)


func _refresh_branch_tree() -> void:
	if ProgressionService.pending_branch_selection or ProgressionService.branch_id.is_empty():
		_branch_guidance.text = "No branch selected. At level 5 choose exactly one of two branches. Closing the chooser leaves you branchless with this guidance."
		_choose_branch.visible = ProgressionService.level >= 5
		_branch_tree_meta.text = ""
		_clear(_branch_tree_host)
		return
	_choose_branch.visible = false
	var branch := ProgressionCatalog.branch_record(ProgressionService.branch_id)
	var tree_id := String(branch.get("branchTreeId", ""))
	var slots := ProgressionCatalog.point_slots(tree_id)
	_branch_guidance.text = "Branch: %s. Permanent until trainer respec." % ProgressionCatalog.branch_display_name(ProgressionService.branch_id)
	_branch_tree_meta.text = "Eight nodes, %s point-slots, six earned points by level 10. Points spent: %s. Points available: %s. %s Visual adjacency is not a prerequisite unless a node lists one." % [
		str(slots),
		str(ProgressionCatalog.spent_in_tree(tree_id, ProgressionService.purchased_class_node_ids, ProgressionService.purchased_branch_node_ranks)),
		str(ProgressionService.unspent_branch_points),
		ProgressionCatalog.tier_guidance(3),
	]
	_rebuild_tree(_branch_tree_host, tree_id, true)


func _rebuild_tree(host: VBoxContainer, tree_id: String, show_tiers: bool) -> void:
	_clear(host)
	if tree_id.is_empty():
		host.add_child(_label("Empty", "No tree for this class."))
		return
	var grouped: Dictionary = {}
	for node in ProgressionCatalog.tree_nodes(tree_id):
		var tier := int((node as Dictionary).get("tier", 1))
		if not grouped.has(tier):
			grouped[tier] = []
		(grouped[tier] as Array).append(node)
	var tiers: Array = grouped.keys()
	tiers.sort()
	for tier in tiers:
		if show_tiers:
			var heading := _label("Tier%s" % str(tier), "Tier %s — %s" % [str(tier), ProgressionCatalog.tier_guidance(int(tier))])
			heading.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
			host.add_child(heading)
		for node in grouped[tier]:
			host.add_child(_talent_node_button(tree_id, node as Dictionary))


func _talent_node_button(tree_id: String, node: Dictionary) -> Control:
	var node_id := String(node.get("id", ""))
	var lock := ProgressionService.node_lock(tree_id, node_id)
	var box := VBoxContainer.new()
	box.name = "Node_%s" % node_id.replace(".", "_")
	var button := Button.new()
	button.name = "Purchase"
	button.focus_mode = Control.FOCUS_ALL
	button.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	var state := ProgressionCatalog.node_state_label(lock)
	var rank := int(lock.get("rank", 0))
	var next_rank := int(lock.get("next_rank", rank))
	var active_mark := " [Active ability]" if String(node.get("grantsActiveAbilityId", "")) != "" else ""
	var prereq := ProgressionCatalog.prerequisite_text(node)
	button.text = "%s · %s · rank %s/%s%s" % [
		String(node.get("displayName", node_id)),
		state,
		str(rank),
		str(int(node.get("maxRank", 1))),
		active_mark,
	]
	if not prereq.is_empty():
		button.text = "%s\n%s" % [button.text, prereq]
	button.tooltip_text = ProgressionCatalog.node_tooltip(node, lock)
	button.disabled = not bool(lock.get("available", false)) or ProgressionService.is_busy() or ProgressionService.is_link_dead()
	button.pressed.connect(_purchase_node.bind(tree_id, node_id, next_rank))
	box.add_child(button)
	var detail := _label("Detail", ProgressionCatalog.node_tooltip(node, lock))
	detail.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	box.add_child(detail)
	return box


func _refresh_abilities() -> void:
	var class_id := ProgressionService.class_id
	var auto_id := String(ProgressionCatalog.class_record(class_id).get("autoAttackId", ""))
	if auto_id.is_empty():
		_auto_attack_label.text = "Auto-attack: none"
	else:
		_auto_attack_label.text = "Auto-attack (separate from hotbar): %s" % ProgressionCatalog.ability_detail_text(auto_id, 1)
	_clear(_ability_actives)
	_clear(_ability_passives)
	_clear(_ability_locked)
	_list_owned_abilities(class_id)
	_list_locked_milestones(class_id)
	_rebuild_hotbar_assign()


func _list_owned_abilities(class_id: String) -> void:
	var owned: Array = AbilityService.unlocked_ability_ids
	if owned.is_empty():
		owned = ProgressionService.unlocked_ability_ids
	for ability_id in owned:
		var id := String(ability_id)
		if ProgressionCatalog.is_auto_attack(class_id, id):
			continue
		var rank := int(AbilityService.ability_ranks.get(id, 1))
		var source := ProgressionCatalog.ability_source_text(
			class_id,
			id,
			ProgressionService.branch_id,
			ProgressionService.purchased_class_node_ids,
			ProgressionService.purchased_branch_node_ranks,
		)
		var text := "%s  Source: %s. %s" % [id, source, ProgressionCatalog.ability_detail_text(id, rank)]
		var row := _ability_row(id, text, ProgressionCatalog.is_hotbar_assignable(class_id, id))
		if ProgressionCatalog.is_passive_ability(id):
			_ability_passives.add_child(row)
		else:
			_ability_actives.add_child(row)
	if _ability_actives.get_child_count() == 0:
		_ability_actives.add_child(_label("EmptyActives", "No owned active skills yet."))
	if _ability_passives.get_child_count() == 0:
		_ability_passives.add_child(_label("EmptyPassives", "No owned passive skills."))


func _list_locked_milestones(class_id: String) -> void:
	var class_def := ProgressionCatalog.class_record(class_id)
	var locked: Array = []
	var basic := String(class_def.get("basicAbilityId", ""))
	if not basic.is_empty() and ProgressionService.level < 2:
		locked.append({"id": basic, "why": "Unlocks at level 2."})
	if ProgressionService.branch_id.is_empty():
		if ProgressionService.level >= 5:
			locked.append({"id": "", "why": "Signature and capstone stay locked until a branch is confirmed."})
	else:
		var branch := ProgressionCatalog.branch_record(ProgressionService.branch_id)
		var signature := String(branch.get("signatureAbilityId", ""))
		var capstone := String(branch.get("capstoneAbilityId", ""))
		if not signature.is_empty() and not AbilityService.unlocked_ability_ids.has(signature) and not ProgressionService.unlocked_ability_ids.has(signature):
			locked.append({"id": signature, "why": "Signature unlocks at level 5 with a confirmed branch."})
		if not capstone.is_empty() and not AbilityService.unlocked_ability_ids.has(capstone) and not ProgressionService.unlocked_ability_ids.has(capstone):
			locked.append({"id": capstone, "why": "Capstone unlocks at level 10."})
	for node in ProgressionCatalog.tree_nodes(String(class_def.get("classTreeId", ""))):
		var grant := String((node as Dictionary).get("grantsActiveAbilityId", ""))
		if grant.is_empty():
			continue
		if AbilityService.unlocked_ability_ids.has(grant) or ProgressionService.unlocked_ability_ids.has(grant):
			continue
		locked.append({"id": grant, "why": "Purchase the class-tree node to own this active."})
	if not ProgressionService.branch_id.is_empty():
		var tree_id := String(ProgressionCatalog.branch_record(ProgressionService.branch_id).get("branchTreeId", ""))
		for node in ProgressionCatalog.tree_nodes(tree_id):
			var grant := String((node as Dictionary).get("grantsActiveAbilityId", ""))
			if grant.is_empty():
				continue
			if AbilityService.unlocked_ability_ids.has(grant) or ProgressionService.unlocked_ability_ids.has(grant):
				continue
			locked.append({"id": grant, "why": "Purchase the branch-tree node to own this talent active."})
	if locked.is_empty():
		_ability_locked.add_child(_label("EmptyLocked", "No locked milestone skills."))
		return
	for entry in locked:
		var row: Dictionary = entry
		var ability_id := String(row.get("id", ""))
		var why := String(row.get("why", ""))
		if ability_id.is_empty():
			_ability_locked.add_child(_label("LockedNote", why))
		else:
			_ability_locked.add_child(_label(ability_id.replace(".", "_"), "%s — %s %s" % [
				String(ContentRegistry.get_by_id(ability_id).get("displayName", ability_id)),
				why,
				ProgressionCatalog.ability_detail_text(ability_id, 1),
			]))


func _ability_row(ability_id: String, text: String, draggable: bool) -> Control:
	var button := Button.new()
	button.name = ability_id.replace(".", "_")
	button.text = text
	button.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	button.focus_mode = Control.FOCUS_ALL
	button.theme_type_variation = "SecondaryButton"
	button.tooltip_text = text
	if draggable:
		button.gui_input.connect(func(event: InputEvent) -> void:
			if event is InputEventMouseButton and event.pressed and (event as InputEventMouseButton).button_index == MOUSE_BUTTON_LEFT:
				DragDropService.begin({"abilityId": ability_id, "kind": "ability"})
		)
	return button


func _rebuild_hotbar_assign() -> void:
	_clear(_hotbar_host)
	var size := AbilityService.hotbar.size()
	if ProgressionService.uses_canonical_class():
		size = ProgressionCatalog.CANONICAL_HOTBAR_SIZE
	for i in range(size):
		var slot := VBoxContainer.new()
		slot.name = "Slot%s" % str(i)
		var title := _label("SlotLabel", "Slot %s" % str(i + 1))
		var option := OptionButton.new()
		option.name = "Assign"
		option.focus_mode = Control.FOCUS_ALL
		option.add_item("Empty", 0)
		option.set_item_metadata(0, "")
		var selected := 0
		var current := ""
		if i < AbilityService.hotbar.size():
			current = String(AbilityService.hotbar[i])
		var idx := 1
		for ability_id in AbilityService.unlocked_ability_ids:
			var id := String(ability_id)
			if not ProgressionCatalog.is_hotbar_assignable(ProgressionService.class_id, id):
				continue
			var definition := AbilityService.ability_definition(id)
			option.add_item(String(definition.get("displayName", id)), idx)
			option.set_item_metadata(idx, id)
			if id == current:
				selected = idx
			idx += 1
		option.select(selected)
		option.item_selected.connect(_assign_hotbar.bind(i, option))
		var drop := Button.new()
		drop.name = "Drop"
		drop.text = current if not current.is_empty() else "Drop active here"
		drop.focus_mode = Control.FOCUS_ALL
		drop.theme_type_variation = "SecondaryButton"
		drop.gui_input.connect(func(event: InputEvent) -> void:
			if event is InputEventMouseButton and event.pressed and (event as InputEventMouseButton).button_index == MOUSE_BUTTON_LEFT:
				if DragDropService.active:
					var ability_id := String(DragDropService.payload.get("abilityId", ""))
					AbilityService.request_assign_hotbar(i, ability_id)
					DragDropService.complete()
		)
		slot.add_child(title)
		slot.add_child(option)
		slot.add_child(drop)
		_hotbar_host.add_child(slot)


func _refresh_builds() -> void:
	_clear(_builds_host)
	var builds := ProgressionCatalog.reference_builds_for_class(ProgressionService.class_id)
	if builds.is_empty():
		_builds_host.add_child(_label("EmptyBuilds", "No reference builds for this class."))
		return
	for build in builds:
		var row: Dictionary = build
		var card := _label(String(row.get("id", "build")).replace(".", "_"), "%s\nBranch: %s\nSuggested free-stat priority: %s\nIdentity: %s\nThis is optional guidance, not an auto-spend." % [
			String(row.get("displayName", row.get("id", ""))),
			ProgressionCatalog.branch_display_name(String(row.get("branchId", ""))),
			ProgressionCatalog.build_priority_text(row),
			ProgressionCatalog.build_identity(row),
		])
		card.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		_builds_host.add_child(card)


func _on_auto_toggled(pressed: bool) -> void:
	if _suppress_auto_toggle:
		return
	ProgressionService.request_set_auto_assign(pressed)


func _on_action_failed(_code: String, message: String) -> void:
	_error.text = message
	_error.visible = not message.is_empty()
	refresh()


func _on_action_succeeded(_request_id: String) -> void:
	_error.text = ""
	_error.visible = false
	refresh()


func _scroll(tab_name: String) -> ScrollContainer:
	var scroll := ScrollContainer.new()
	scroll.name = tab_name
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	var box := VBoxContainer.new()
	box.name = "Body"
	box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	box.add_theme_constant_override("separation", DesignTokens.SPACE_SM)
	scroll.add_child(box)
	return scroll


func _label(node_name: String, text: String) -> Label:
	var label := Label.new()
	label.name = node_name
	label.text = text
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	return label


func _clear(host: Node) -> void:
	if host == null:
		return
	for child in host.get_children():
		host.remove_child(child)
		child.free()


func _num(value: float) -> String:
	if absf(value - round(value)) < 0.0005:
		return str(int(round(value)))
	return str(snapped(value, 0.01))


func _queue_stat(stat_id: String) -> void:
	ProgressionService.queue_pending_stat(stat_id, 1)


func _purchase_node(tree_id: String, node_id: String, requested_rank: int) -> void:
	ProgressionService.request_purchase_talent(tree_id, node_id, requested_rank)


func _assign_hotbar(selected_index: int, slot_index: int, option: OptionButton) -> void:
	var ability_id := String(option.get_item_metadata(selected_index))
	AbilityService.request_assign_hotbar(slot_index, ability_id)


func _first_focusable() -> Control:
	if _tabs == null:
		return null
	return _tabs


func _unhandled_input(event: InputEvent) -> void:
	if not visible:
		return
	if event.is_action_pressed("ui_cancel"):
		if respec_dialog != null and respec_dialog.visible:
			return
		if branch_modal != null and branch_modal.visible:
			return
		WindowManager.close(WindowManager.CHARACTER)
		get_viewport().set_input_as_handled()
