class_name ItemPresentation
extends RefCounted

## Formats canonical item instances for bag presentation. Never mutates inventory.

const RARITY_LABELS := {
	"rarity.poor": "Poor",
	"rarity.common": "Common",
	"rarity.uncommon": "Uncommon",
	"rarity.rare": "Rare",
	"rarity.epic": "Epic",
	"rarity.legendary": "Legendary",
}

const RARITY_COLORS := {
	"rarity.poor": Color(0.62, 0.62, 0.62, 1),
	"rarity.common": Color(0.86, 0.88, 0.90, 1),
	"rarity.uncommon": Color(0.30, 0.72, 0.36, 1),
	"rarity.rare": Color(0.28, 0.52, 0.92, 1),
	"rarity.epic": Color(0.64, 0.32, 0.86, 1),
	"rarity.legendary": Color(0.92, 0.64, 0.18, 1),
}


static func definition_for(item_id: String) -> Dictionary:
	if item_id.is_empty():
		return {}
	return ContentRegistry.get_by_id(item_id)


static func item_id_of(instance: Dictionary) -> String:
	var item_id := String(instance.get("itemId", ""))
	if item_id.is_empty():
		return String(instance.get("definitionId", ""))
	return item_id


static func display_name(instance: Dictionary, definition: Dictionary = {}) -> String:
	var record := definition if not definition.is_empty() else definition_for(item_id_of(instance))
	var named := String(record.get("displayName", ""))
	if named.is_empty():
		return item_id_of(instance)
	return named


static func rarity_id(definition: Dictionary) -> String:
	return String(definition.get("rarity", "rarity.common"))


static func rarity_label(definition: Dictionary) -> String:
	var rarity := rarity_id(definition)
	if RARITY_LABELS.has(rarity):
		return String(RARITY_LABELS[rarity])
	if rarity.begins_with("rarity."):
		var rest := rarity.substr(7)
		if rest.is_empty():
			return "Unknown"
		return rest.capitalize()
	if rarity.is_empty():
		return "Unknown"
	return rarity.capitalize()


static func rarity_color(definition: Dictionary) -> Color:
	var rarity := rarity_id(definition)
	if RARITY_COLORS.has(rarity):
		return RARITY_COLORS[rarity]
	return DesignTokens.TEXT


static func description_text(definition: Dictionary, item_id: String) -> String:
	var key := String(definition.get("descriptionKey", ""))
	if not key.is_empty():
		var translated := tr(key)
		if not translated.is_empty() and translated != key:
			return translated
	var named := String(definition.get("displayName", item_id))
	if named.is_empty():
		return item_id
	return named


static func visual_for(definition: Dictionary) -> Dictionary:
	var visual_id := String(definition.get("visualId", definition.get("iconAssetId", "")))
	return ContentRegistry.resolve_visual(visual_id)


static func icon_texture(definition: Dictionary) -> Texture2D:
	var visual: Dictionary = visual_for(definition)
	var texture_path := String(visual.get("texture_path", ""))
	if texture_path.is_empty():
		return null
	var loaded: Resource = load(texture_path)
	if loaded is Texture2D:
		return loaded as Texture2D
	return null


static func fallback_color(definition: Dictionary) -> Color:
	var visual: Dictionary = visual_for(definition)
	var color: Variant = visual.get("fallback_color", DesignTokens.SECONDARY)
	if typeof(color) == TYPE_COLOR:
		return color
	return DesignTokens.SECONDARY


static func uses_fallback_icon(definition: Dictionary) -> bool:
	return icon_texture(definition) == null


static func is_locked(instance: Dictionary) -> bool:
	var reason := String(instance.get("lockReason", "") if instance.get("lockReason", null) != null else "")
	var lock_type := String(instance.get("lockType", "") if instance.get("lockType", null) != null else "")
	var lock_id := String(instance.get("lockId", "") if instance.get("lockId", null) != null else "")
	return not reason.is_empty() or not lock_type.is_empty() or not lock_id.is_empty()


static func lock_reason(instance: Dictionary) -> String:
	var reason := String(instance.get("lockReason", "") if instance.get("lockReason", null) != null else "")
	if reason.is_empty():
		reason = String(instance.get("lockType", "") if instance.get("lockType", null) != null else "")
	if reason.is_empty():
		return "This item is locked."
	match reason:
		"trade":
			return "Locked: in a trade."
		"TRADE":
			return "Locked: in a trade."
		"DROP_INTENT":
			return "Locked: drop in progress."
		_:
			return "Locked: %s." % reason


static func max_stack(definition: Dictionary) -> int:
	return maxi(1, int(definition.get("maxStack", 1)))


static func metadata_of(instance: Dictionary) -> Dictionary:
	var raw: Variant = instance.get("metadata", {})
	if typeof(raw) == TYPE_DICTIONARY:
		return raw
	return {}


static func stacks_compatible(source: Dictionary, dest: Dictionary, definition: Dictionary) -> bool:
	if item_id_of(source) != item_id_of(dest):
		return false
	if item_id_of(source) != String(definition.get("id", item_id_of(source))):
		return false
	if String(source.get("stackKey", "")) != String(dest.get("stackKey", "")):
		return false
	if JSON.stringify(metadata_of(source)) != JSON.stringify(metadata_of(dest)):
		return false
	if is_locked(source) or is_locked(dest):
		return false
	return true


static func dest_stack_full(source: Dictionary, dest: Dictionary, definition: Dictionary) -> bool:
	if not stacks_compatible(source, dest, definition):
		return false
	return int(dest.get("quantity", 0)) >= max_stack(definition)


static func class_requirement_text(definition: Dictionary) -> String:
	var raw: Variant = definition.get("classRequirements", [])
	if typeof(raw) != TYPE_ARRAY or (raw as Array).is_empty():
		return "Any class"
	var names := PackedStringArray()
	for entry in raw:
		var class_id := String(entry)
		var record: Dictionary = ContentRegistry.get_by_id(class_id)
		var named := String(record.get("displayName", ""))
		names.append(named if not named.is_empty() else class_id)
	return ", ".join(names)


static func equipment_slot_text(definition: Dictionary) -> String:
	var slot := String(definition.get("equipSlot", ""))
	if slot.is_empty():
		var tags: Variant = definition.get("equipmentSlotTags", [])
		if typeof(tags) == TYPE_ARRAY and not (tags as Array).is_empty():
			slot = String((tags as Array)[0])
	if slot.is_empty():
		return "—"
	return slot.replace("_", " ")


static func stat_modifier_lines(definition: Dictionary) -> PackedStringArray:
	var lines := PackedStringArray()
	var raw: Variant = definition.get("statModifiers", [])
	if typeof(raw) != TYPE_ARRAY:
		return lines
	for entry in raw:
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		var stat_id := String((entry as Dictionary).get("statId", ""))
		var amount := int((entry as Dictionary).get("amount", 0))
		var record: Dictionary = ContentRegistry.get_by_id(stat_id)
		var named := String(record.get("displayName", stat_id))
		if named.is_empty():
			named = stat_id
		var sign := "+" if amount >= 0 else ""
		lines.append("%s %s%s" % [named, sign, str(amount)])
	var attack_bonus := int(definition.get("attackBonus", 0))
	if attack_bonus != 0 and lines.is_empty():
		var sign := "+" if attack_bonus >= 0 else ""
		lines.append("Attack %s%s" % [sign, str(attack_bonus)])
	return lines


static func contextual_value_text(instance: Dictionary, definition: Dictionary) -> String:
	if is_locked(instance):
		return lock_reason(instance)
	var sell := int(definition.get("sellValue", 0))
	if sell > 0:
		return "Vendor value: %sg" % str(sell)
	var attack_bonus := int(definition.get("attackBonus", 0))
	if attack_bonus != 0:
		var sign := "+" if attack_bonus >= 0 else ""
		return "Attack %s%s" % [sign, str(attack_bonus)]
	return "Vendor value: 0g"


static func debug_tooltips_enabled() -> bool:
	return OS.is_debug_build()


static func tooltip_text(instance: Dictionary, include_debug: bool = false) -> String:
	var item_id := item_id_of(instance)
	var definition: Dictionary = definition_for(item_id)
	var lines := PackedStringArray()
	lines.append(display_name(instance, definition))
	lines.append("Rarity: %s" % rarity_label(definition))
	lines.append("Quantity: %s" % str(maxi(1, int(instance.get("quantity", 1)))))
	lines.append("Category: %s" % String(definition.get("category", "miscellaneous")))
	lines.append(description_text(definition, item_id))
	if bool(definition.get("equippable", false)):
		lines.append("Equipment slot: %s" % equipment_slot_text(definition))
	else:
		lines.append("Equipment slot: —")
	var level := int(definition.get("levelRequirement", 0))
	lines.append("Level requirement: %s" % (str(level) if level > 0 else "none"))
	lines.append("Class requirement: %s" % class_requirement_text(definition))
	var stats := stat_modifier_lines(definition)
	if stats.is_empty():
		lines.append("Stat modifiers: none")
	else:
		lines.append("Stat modifiers:")
		for line in stats:
			lines.append("  %s" % line)
	if bool(definition.get("questItem", false)):
		lines.append("Quest item: yes")
	else:
		lines.append("Quest item: no")
	lines.append("Tradeable: %s" % ("yes" if bool(definition.get("tradeable", true)) else "no"))
	lines.append("Droppable: %s" % ("yes" if bool(definition.get("droppable", true)) else "no"))
	lines.append(contextual_value_text(instance, definition))
	if include_debug:
		lines.append("")
		lines.append("Debug")
		lines.append("itemId: %s" % item_id)
		lines.append("instanceId: %s" % String(instance.get("instanceId", "")))
		lines.append("slotIndex: %s" % str(int(instance.get("slotIndex", -1))))
		lines.append("version: %s" % str(int(instance.get("version", 0))))
		lines.append("revision: %s" % str(InventoryService.revision))
	return "\n".join(lines)
