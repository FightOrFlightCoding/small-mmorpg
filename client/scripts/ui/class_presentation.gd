class_name ClassPresentation
extends RefCounted

## Player-facing class summaries for Character Creation. Not balance promises.


static func for_id(class_id: String) -> Dictionary:
	match class_id:
		"class.warrior":
			return {
				"id": class_id,
				"display_name": "Warrior",
				"role": "Close-range fighter",
				"resource_type": "None (cooldowns)",
				"summary": "Holds the front with weapons and heavier protection. Skills are gated by cooldowns, not a resource bar.",
				"glyph": "W",
				"shape": "Sword and shield",
				"theme": "Martial steel",
				"cannot_change": "Class cannot currently be changed after creation.",
				"disclaimer": "Presentation summary, not a final balance promise.",
			}
		"class.marksman":
			return {
				"id": class_id,
				"display_name": "Marksman",
				"role": "Long-range physical attacker",
				"resource_type": "None (cooldowns)",
				"summary": "Keeps distance with ranged weapons. Skills are gated by cooldowns, not a resource bar.",
				"glyph": "R",
				"shape": "Bow",
				"theme": "Ranger field kit",
				"cannot_change": "Class cannot currently be changed after creation.",
				"disclaimer": "Presentation summary, not a final balance promise.",
			}
		"class.mage":
			return {
				"id": class_id,
				"display_name": "Mage",
				"role": "Long-range magical attacker",
				"resource_type": "Mana",
				"summary": "Spends mana on burst and control spells. Physical classes do not share this resource.",
				"glyph": "M",
				"shape": "Staff and spell",
				"theme": "Arcane ember",
				"cannot_change": "Class cannot currently be changed after creation.",
				"disclaimer": "Presentation summary, not a final balance promise.",
			}
		"class.mystic":
			return {
				"id": class_id,
				"display_name": "Mystic",
				"role": "Support, healing, buffs, debuffs, and curses",
				"resource_type": "Mana",
				"summary": "Mana-based caster that mends allies or withers enemies. Identity is support, not a promised parse ranking.",
				"glyph": "✧",
				"shape": "Charm",
				"theme": "Woven charms",
				"cannot_change": "Class cannot currently be changed after creation.",
				"disclaimer": "Presentation summary, not a final balance promise.",
			}
		_:
			return {
				"id": class_id,
				"display_name": class_id,
				"role": "",
				"resource_type": "",
				"summary": "",
				"glyph": "?",
				"shape": "Class",
				"theme": "Generic",
				"cannot_change": "Class cannot currently be changed after creation.",
				"disclaimer": "Presentation summary, not a final balance promise.",
			}


static func selected_summary(class_id: String) -> String:
	var row := for_id(class_id)
	if String(row.get("role", "")).is_empty():
		return String(row.get("display_name", class_id))
	return "%s — %s. Resource: %s. %s %s %s" % [
		String(row.get("display_name", "")),
		String(row.get("role", "")),
		String(row.get("resource_type", "")),
		String(row.get("summary", "")),
		String(row.get("cannot_change", "")),
		String(row.get("disclaimer", "")),
	]
