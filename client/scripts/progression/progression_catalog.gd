class_name ProgressionCatalog
extends RefCounted

## Read-only presentation helpers for PROG-13. Never submits progression outcomes.

const STAT_IDS := [
	"stat.strength",
	"stat.agility",
	"stat.intelligence",
	"stat.spirit",
	"stat.vitality",
	"stat.precision",
	"stat.haste",
	"stat.endurance",
]

const RESPEC_GOLD_PER_LEVEL := 50
const CLASS_TREE_POINTS := 2
const BRANCH_EARNED_CAP := 6
const REQUEST_TIMEOUT_SEC := 8.0
const CANONICAL_HOTBAR_SIZE := 4
const FRENZY_ABILITY_ID := "ability.warrior.frenzy"


static func stat_label(stat_id: String) -> String:
	match stat_id:
		"stat.strength":
			return "Strength"
		"stat.agility":
			return "Agility"
		"stat.intelligence":
			return "Intelligence"
		"stat.spirit":
			return "Spirit"
		"stat.vitality":
			return "Vitality"
		"stat.precision":
			return "Precision"
		"stat.haste":
			return "Haste"
		"stat.endurance":
			return "Endurance"
		_:
			return stat_id


static func stat_short(stat_id: String) -> String:
	match stat_id:
		"stat.strength":
			return "STR"
		"stat.agility":
			return "AGI"
		"stat.intelligence":
			return "INT"
		"stat.spirit":
			return "SPI"
		"stat.vitality":
			return "VIT"
		"stat.precision":
			return "PRE"
		"stat.haste":
			return "HST"
		"stat.endurance":
			return "END"
		_:
			return stat_id


static func lock_reason_text(code: String) -> String:
	match code:
		"insufficient_points":
			return "Not enough unspent points for this node."
		"already_unlocked":
			return "This rank is already purchased."
		"invalid_rank":
			return "That rank cannot be purchased yet."
		"branch_locked":
			return "Choose a branch before spending branch points."
		"class_restricted":
			return "This node belongs to another class."
		"level_restricted":
			return "Your level is too low for this tier."
		"prerequisite_missing":
			return "Required nodes or tier points are not met."
		"active_ceiling":
			return "Buying this would exceed the four-active ceiling."
		"invalid_tree", "invalid_id", "invalid_branch", "unsupported_class":
			return "This talent cannot be purchased on the current character."
		"ok", "":
			return ""
		_:
			return "Locked (%s)." % code


static func action_error_text(code: String) -> String:
	match code:
		"insufficient_gold":
			return "Not enough gold for this respec."
		"unsafe_leave", "in_combat", "player_dead", "control_restricted":
			return "Respec is blocked until you are safe at the trainer."
		"timeout", "request_timeout":
			return "The server did not confirm in time. Your last confirmed values were restored."
		"rate_limited":
			return "Please wait before sending another progression request."
		"already_selected":
			return "A branch is already selected."
		"invalid_branch":
			return "That branch is not available for this class."
		"insufficient_points":
			return "Not enough unspent points."
		"duplicate_hotbar":
			return "That ability is already on the hotbar."
		"ability_passive":
			return "Passive skills cannot be placed on the hotbar."
		"ability_locked":
			return "You do not own that ability."
		"invalid_slot":
			return "That hotbar slot is not available."
		"link_dead":
			return "This character is still in the world. Progression actions are paused."
		_:
			var lock := lock_reason_text(code)
			if not lock.is_empty():
				return lock
			return "The server rejected the request (%s)." % code


static func class_record(class_id: String) -> Dictionary:
	return ContentRegistry.get_by_id(class_id)


static func uses_mana(class_id: String) -> bool:
	var record := class_record(class_id)
	if record.is_empty():
		return false
	var resource_type := String(record.get("resourceType", ""))
	return not resource_type.is_empty() and resource_type != "resource.none"


static func resource_type_label(class_id: String) -> String:
	if uses_mana(class_id):
		return "Mana"
	return "None (cooldowns)"


static func branch_record(branch_id: String) -> Dictionary:
	return ContentRegistry.get_by_id(branch_id)


static func branch_display_name(branch_id: String) -> String:
	if branch_id.is_empty():
		return "None"
	var record := branch_record(branch_id)
	var name := String(record.get("displayName", ""))
	if name.is_empty():
		return branch_id
	return name


static func class_tree_id(class_id: String) -> String:
	return String(class_record(class_id).get("classTreeId", ""))


static func branch_ids_for_class(class_id: String) -> PackedStringArray:
	var ids := PackedStringArray()
	var record := class_record(class_id)
	var listed: Variant = record.get("branchIds", [])
	if typeof(listed) == TYPE_ARRAY:
		for entry in listed:
			ids.append(String(entry))
		return ids
	for id in ContentRegistry.ids_of_kind("branch_definition"):
		var branch := ContentRegistry.get_by_id(id)
		if String(branch.get("classId", "")) == class_id:
			ids.append(String(id))
	return ids


static func tree_record(tree_id: String) -> Dictionary:
	return ContentRegistry.get_by_id(tree_id)


static func node_record(node_id: String) -> Dictionary:
	return ContentRegistry.get_by_id(node_id)


static func tree_nodes(tree_id: String) -> Array:
	var tree := tree_record(tree_id)
	var ids: Variant = tree.get("nodeIds", [])
	var nodes: Array = []
	if typeof(ids) != TYPE_ARRAY:
		return nodes
	for entry in ids:
		var node := node_record(String(entry))
		if not node.is_empty():
			nodes.append(node)
	return nodes


static func point_slots(tree_id: String) -> int:
	var total := 0
	for node in tree_nodes(tree_id):
		var row: Dictionary = node
		total += int(row.get("maxRank", 1)) * int(row.get("pointCostPerRank", 1))
	return total


static func node_rank(node_id: String, purchased_class_ids: Array, purchased_branch_ranks: Dictionary) -> int:
	if purchased_class_ids.has(node_id):
		return 1
	return int(purchased_branch_ranks.get(node_id, 0))


static func spent_in_tree(tree_id: String, purchased_class_ids: Array, purchased_branch_ranks: Dictionary) -> int:
	var tree := tree_record(tree_id)
	var spent := 0
	if String(tree.get("treeKind", "")) == "class":
		return purchased_class_ids.size()
	for node in tree_nodes(tree_id):
		spent += node_rank(String((node as Dictionary).get("id", "")), purchased_class_ids, purchased_branch_ranks)
	return spent


static func evaluate_node_lock(
	tree_id: String,
	node_id: String,
	class_id: String,
	branch_id: String,
	level: int,
	unspent_class_points: int,
	unspent_branch_points: int,
	purchased_class_ids: Array,
	purchased_branch_ranks: Dictionary,
) -> Dictionary:
	var tree := tree_record(tree_id)
	var node := node_record(node_id)
	if tree.is_empty():
		return {"code": "invalid_tree", "available": false, "purchased": false, "rank": 0, "next_rank": 0}
	if node.is_empty() or String(node.get("treeId", "")) != tree_id:
		return {"code": "invalid_id", "available": false, "purchased": false, "rank": 0, "next_rank": 0}
	var current := node_rank(node_id, purchased_class_ids, purchased_branch_ranks)
	var max_rank := int(node.get("maxRank", 1))
	var next_rank := current + 1
	if current >= max_rank:
		return {
			"code": "already_unlocked",
			"available": false,
			"purchased": true,
			"rank": current,
			"next_rank": current,
		}
	var class_def := class_record(class_id)
	var tree_kind := String(tree.get("treeKind", ""))
	if tree_kind == "class":
		if String(tree.get("ownerId", "")) != class_id:
			return {"code": "class_restricted", "available": false, "purchased": current > 0, "rank": current, "next_rank": next_rank}
		if String(class_def.get("classTreeId", "")) != tree_id and not String(class_def.get("classTreeId", "")).is_empty():
			return {"code": "class_restricted", "available": false, "purchased": current > 0, "rank": current, "next_rank": next_rank}
		if purchased_class_ids.size() >= CLASS_TREE_POINTS or unspent_class_points < int(node.get("pointCostPerRank", 1)):
			return {"code": "insufficient_points", "available": false, "purchased": current > 0, "rank": current, "next_rank": next_rank}
	else:
		if branch_id.is_empty():
			return {"code": "branch_locked", "available": false, "purchased": false, "rank": 0, "next_rank": next_rank}
		if String(tree.get("ownerId", "")) != branch_id:
			return {"code": "invalid_branch", "available": false, "purchased": current > 0, "rank": current, "next_rank": next_rank}
		if unspent_branch_points < int(node.get("pointCostPerRank", 1)):
			return {"code": "insufficient_points", "available": false, "purchased": current > 0, "rank": current, "next_rank": next_rank}
		var gate := _tier_gate(tree, int(node.get("tier", 1)), level, spent_in_tree(tree_id, purchased_class_ids, purchased_branch_ranks))
		if not bool(gate.get("ok", false)):
			return {
				"code": String(gate.get("code", "level_restricted")),
				"available": false,
				"purchased": current > 0,
				"rank": current,
				"next_rank": next_rank,
			}
	if not _prerequisites_met(node, purchased_class_ids, purchased_branch_ranks):
		return {"code": "prerequisite_missing", "available": false, "purchased": current > 0, "rank": current, "next_rank": next_rank}
	return {"code": "", "available": true, "purchased": current > 0, "rank": current, "next_rank": next_rank}


static func node_state_label(lock: Dictionary) -> String:
	if bool(lock.get("purchased", false)) and not bool(lock.get("available", false)):
		return "Purchased"
	if bool(lock.get("available", false)):
		return "Available"
	var code := String(lock.get("code", ""))
	if code == "already_unlocked":
		return "Purchased"
	if code == "level_restricted":
		return "Locked · level"
	if code == "prerequisite_missing":
		return "Locked · requirements"
	if code == "insufficient_points":
		return "Locked · points"
	if code == "branch_locked":
		return "Locked · branch"
	if code == "active_ceiling":
		return "Locked · active ceiling"
	return "Locked"


static func node_tooltip(node: Dictionary, lock: Dictionary) -> String:
	var name := String(node.get("displayName", node.get("id", "")))
	var rank := int(lock.get("rank", 0))
	var next_rank := int(lock.get("next_rank", rank))
	var max_rank := int(node.get("maxRank", 1))
	var parts := PackedStringArray()
	parts.append(name)
	parts.append("Rank %s / %s." % [str(rank), str(max_rank)])
	if bool(lock.get("available", false)) and next_rank > rank:
		parts.append("Next rank: %s." % str(next_rank))
	parts.append(_node_effect_summary(node, next_rank if next_rank > rank else maxi(rank, 1)))
	var prereq := prerequisite_text(node)
	if not prereq.is_empty():
		parts.append(prereq)
	var reason := lock_reason_text(String(lock.get("code", "")))
	if not reason.is_empty() and not bool(lock.get("available", false)):
		parts.append(reason)
	if String(node.get("grantsActiveAbilityId", "")) != "":
		parts.append("Grants active ability.")
	return " ".join(parts)


static func prerequisite_text(node: Dictionary) -> String:
	var listed: Variant = node.get("prerequisites", [])
	if typeof(listed) != TYPE_ARRAY or (listed as Array).is_empty():
		return ""
	var names := PackedStringArray()
	for entry in listed:
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		var row: Dictionary = entry
		var required_id := String(row.get("nodeId", ""))
		var min_rank := int(row.get("minRank", 1))
		var required := node_record(required_id)
		var label := String(required.get("displayName", required_id))
		names.append("%s rank %s" % [label, str(min_rank)])
	if names.is_empty():
		return ""
	return "Requires: %s. Visual placement is not a prerequisite." % ", ".join(names)


static func tier_guidance(tier: int) -> String:
	if tier <= 1:
		return "Tier 1 is available from level 5."
	if tier == 2:
		return "Tier 2 unlocks after spending 2 branch points."
	return "Tier 3 unlocks at level 9 after spending 4 branch points."


static func respec_gold_cost(level: int) -> int:
	return RESPEC_GOLD_PER_LEVEL * maxi(level, 1)


static func earned_free_points(level: int) -> int:
	return 3 * maxi(level - 1, 0)


static func earned_class_points(level: int) -> int:
	if level < 3:
		return 0
	if level == 3:
		return 1
	return CLASS_TREE_POINTS


static func earned_branch_points(level: int) -> int:
	if level < 5:
		return 0
	return mini(level - 4, BRANCH_EARNED_CAP)


static func xp_ratio(current_xp: int, xp_to_next: int, at_max_level: bool) -> float:
	if at_max_level:
		return 1.0
	if xp_to_next <= 0:
		return 0.0
	return clampf(float(current_xp) / float(xp_to_next), 0.0, 1.0)


static func derived_label(stat_id: String) -> String:
	match stat_id:
		"formula.hp_max":
			return "Derived HP"
		"formula.mana_max":
			return "Mana"
		"formula.mana_regen":
			return "Mana regeneration"
		"formula.crit_chance":
			return "Crit chance"
		"formula.crit_mult":
			return "Crit multiplier"
		"formula.haste_mult":
			return "Haste"
		"formula.damage_reduction":
			return "Damage reduction"
		"formula.effective_hp":
			return "Effective HP"
		_:
			return stat_label(stat_id)


static func format_derived(stat_id: String, value: Variant) -> String:
	var amount := float(value)
	if stat_id == "formula.crit_chance" or stat_id == "formula.damage_reduction":
		return "%s%%" % str(snapped(amount * 100.0, 0.01))
	if stat_id == "formula.haste_mult" or stat_id == "formula.crit_mult":
		return str(snapped(amount, 0.001))
	if absf(amount - round(amount)) < 0.0005:
		return str(int(round(amount)))
	return str(snapped(amount, 0.001))


static func reference_builds_for_class(class_id: String) -> Array:
	var builds: Array = []
	var branch_ids := branch_ids_for_class(class_id)
	for id in ContentRegistry.ids_of_kind("reference_build"):
		var build := ContentRegistry.get_by_id(id)
		if branch_ids.has(String(build.get("branchId", ""))):
			builds.append(build)
	return builds


static func build_identity(build: Dictionary) -> String:
	var id := String(build.get("id", ""))
	match id:
		"build.bulwark.fortress":
			return "Unkillable wall."
		"build.bulwark.warlord":
			return "Off-tank that still hurts."
		"build.berserker.executioner":
			return "Few, huge crits."
		"build.berserker.hurricane":
			return "Whirlwind machine."
		"build.fire.meteor":
			return "Crit-fishing burst."
		"build.fire.flamethrower":
			return "Sustained spray."
		"build.frost.glacier":
			return "Attrition kiter."
		"build.frost.permafrost":
			return "Max control uptime."
		"build.sniper.deadeye":
			return "One-shot fantasy."
		"build.sniper.quickdraw":
			return "Shorter wind-ups."
		"build.skirmisher.windrunner":
			return "Endless skirmish."
		"build.skirmisher.duelist":
			return "Mobile crit-fisher."
		"build.charms.battle_medic":
			return "Frontline healer."
		"build.charms.war_witch":
			return "Off-heals with real solo damage."
		"build.curses.plaguebringer":
			return "Faster DoT ticks."
		"build.curses.leech":
			return "Drain-sustain attrition."
		_:
			return "Optional reference identity. Not a balance promise."


static func build_priority_text(build: Dictionary) -> String:
	var listed: Variant = build.get("statPriority", [])
	if typeof(listed) != TYPE_ARRAY:
		return ""
	var names := PackedStringArray()
	for entry in listed:
		names.append(stat_short(String(entry)))
	return " → ".join(names)


static func is_auto_attack(class_id: String, ability_id: String) -> bool:
	if ability_id.is_empty():
		return false
	var record := class_record(class_id)
	return String(record.get("autoAttackId", "")) == ability_id


static func is_passive_ability(ability_id: String) -> bool:
	var definition := ContentRegistry.get_by_id(ability_id)
	return String(definition.get("abilityCategory", definition.get("category", ""))) == "passive"


static func is_hotbar_assignable(class_id: String, ability_id: String) -> bool:
	if ability_id.is_empty() or ability_id == FRENZY_ABILITY_ID:
		return false
	if is_auto_attack(class_id, ability_id):
		return false
	if is_passive_ability(ability_id):
		return false
	return true


static func ability_source_text(class_id: String, ability_id: String, branch_id: String, purchased_class_ids: Array, purchased_branch_ranks: Dictionary) -> String:
	var class_def := class_record(class_id)
	if String(class_def.get("autoAttackId", "")) == ability_id:
		return "Auto-attack"
	if String(class_def.get("basicAbilityId", "")) == ability_id:
		return "Class basic (level 2)"
	var branch := branch_record(branch_id)
	if String(branch.get("signatureAbilityId", "")) == ability_id:
		return "%s signature" % branch_display_name(branch_id)
	if String(branch.get("capstoneAbilityId", "")) == ability_id:
		return "%s capstone" % branch_display_name(branch_id)
	for node_id in purchased_class_ids:
		var node := node_record(String(node_id))
		if String(node.get("grantsActiveAbilityId", "")) == ability_id:
			return "Class tree · %s" % String(node.get("displayName", node_id))
	for node_id in purchased_branch_ranks.keys():
		var branch_node := node_record(String(node_id))
		if String(branch_node.get("grantsActiveAbilityId", "")) == ability_id:
			return "Branch tree · %s" % String(branch_node.get("displayName", node_id))
	return "Owned skill"


static func ability_detail_text(ability_id: String, rank: int) -> String:
	var definition := ContentRegistry.get_by_id(ability_id)
	if definition.is_empty():
		return ability_id
	var parts := PackedStringArray()
	parts.append(String(definition.get("displayName", ability_id)))
	var cooldown := float(definition.get("individualCooldown", 0))
	parts.append("Cooldown: %ss." % str(snapped(cooldown, 0.01)))
	var cast_time := float(definition.get("castTime", 0))
	parts.append("Cast time: %ss." % str(snapped(cast_time, 0.01)))
	var costs: Variant = definition.get("resourceCosts", [])
	if typeof(costs) == TYPE_ARRAY and not (costs as Array).is_empty():
		var cost_bits := PackedStringArray()
		for entry in costs:
			if typeof(entry) != TYPE_DICTIONARY:
				continue
			var row: Dictionary = entry
			cost_bits.append("%s %s" % [str(int(row.get("amount", 0))), String(row.get("resourceId", "mana"))])
		parts.append("Mana cost: %s." % ", ".join(cost_bits))
	else:
		parts.append("Mana cost: none.")
	if rank > 1:
		parts.append("Current rank: %s." % str(rank))
	var mods := _rank_mod_text(ability_id, rank)
	if not mods.is_empty():
		parts.append(mods)
	return " ".join(parts)


static func event_lines(events: Array, new_level: int) -> PackedStringArray:
	var lines := PackedStringArray()
	var seen: Dictionary = {}
	for entry in events:
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		var event_type := String((entry as Dictionary).get("type", ""))
		if seen.has(event_type):
			continue
		seen[event_type] = true
		match event_type:
			"level_gained":
				lines.append("Reached level %s." % str(new_level))
				lines.append("Automatic growth increased base stats.")
			"free_points_gained":
				lines.append("Gained 3 free stat points.")
			"class_point_gained":
				lines.append("Gained 1 class skill point.")
			"branch_point_gained":
				lines.append("Gained 1 branch skill point.")
			"basic_unlocked":
				lines.append("Basic skill unlocked.")
			"signature_unlocked":
				lines.append("Signature skill unlocked.")
			"capstone_unlocked":
				lines.append("Capstone skill unlocked.")
			"talent_active_unlocked":
				lines.append("A purchased talent active is now owned.")
			"branch_selection_available":
				lines.append("Branch choice is available. No default is selected.")
			"level_cap_reached":
				lines.append("Level cap reached.")
	return lines


static func _tier_gate(tree: Dictionary, tier: int, level: int, spent: int) -> Dictionary:
	var min_points := 0
	var min_level := 0
	if tier <= 1:
		min_level = 5
	elif tier == 2:
		min_points = 2
	else:
		min_points = 4
		min_level = 9
	var gates: Variant = tree.get("tierGates", [])
	if typeof(gates) == TYPE_ARRAY:
		for entry in gates:
			if typeof(entry) != TYPE_DICTIONARY:
				continue
			var gate: Dictionary = entry
			if int(gate.get("tier", 0)) == tier:
				min_points = int(gate.get("minPointsSpent", min_points))
				if gate.has("minLevel"):
					min_level = int(gate.get("minLevel", min_level))
	if min_level > 0 and level < min_level:
		return {"ok": false, "code": "level_restricted"}
	if spent < min_points:
		return {"ok": false, "code": "prerequisite_missing"}
	return {"ok": true, "code": "ok"}


static func _prerequisites_met(node: Dictionary, purchased_class_ids: Array, purchased_branch_ranks: Dictionary) -> bool:
	var listed: Variant = node.get("prerequisites", [])
	if typeof(listed) != TYPE_ARRAY:
		return true
	for entry in listed:
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		var row: Dictionary = entry
		var required_id := String(row.get("nodeId", ""))
		var min_rank := int(row.get("minRank", 1))
		if node_rank(required_id, purchased_class_ids, purchased_branch_ranks) < min_rank:
			return false
	return true


static func _node_effect_summary(node: Dictionary, rank: int) -> String:
	var grants := String(node.get("grantsActiveAbilityId", ""))
	if not grants.is_empty():
		var ability := ContentRegistry.get_by_id(grants)
		return "Unlocks %s." % String(ability.get("displayName", grants))
	var mods: Variant = node.get("abilityModifications", [])
	if typeof(mods) == TYPE_ARRAY and not (mods as Array).is_empty():
		var first: Variant = (mods as Array)[0]
		if typeof(first) == TYPE_DICTIONARY:
			var ability_id := String((first as Dictionary).get("abilityId", ""))
			var ability := ContentRegistry.get_by_id(ability_id)
			return "Modifies %s at rank %s." % [String(ability.get("displayName", ability_id)), str(rank)]
	return "Passive talent."


static func _rank_mod_text(ability_id: String, rank: int) -> String:
	if rank <= 1:
		return ""
	return "Rank modifications from purchased talent nodes apply on the server."
