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
				"summary": "Uses weapons and heavier protection.",
				"glyph": "W",
				"shape": "Sword and shield",
				"disclaimer": "Presentation summary, not a final balance promise.",
			}
		"class.marksman":
			return {
				"id": class_id,
				"display_name": "Marksman",
				"role": "Long-range physical attacker",
				"summary": "Uses ranged weapons.",
				"glyph": "R",
				"shape": "Bow",
				"disclaimer": "Presentation summary, not a final balance promise.",
			}
		"class.mage":
			return {
				"id": class_id,
				"display_name": "Mage",
				"role": "Long-range magical attacker",
				"summary": "Uses magical resources.",
				"glyph": "M",
				"shape": "Staff and spell",
				"disclaimer": "Presentation summary, not a final balance promise.",
			}
		"class.mystic":
			return {
				"id": class_id,
				"display_name": "Mystic",
				"role": "Support, healing, buffs, debuffs, and curses",
				"summary": "Mana-based caster.",
				"glyph": "✧",
				"shape": "Charm",
				"disclaimer": "Presentation summary, not a final balance promise.",
			}
		_:
			return {
				"id": class_id,
				"display_name": class_id,
				"role": "",
				"summary": "",
				"glyph": "?",
				"shape": "Class",
				"disclaimer": "Presentation summary, not a final balance promise.",
			}


static func selected_summary(class_id: String) -> String:
	var row := for_id(class_id)
	if String(row.get("role", "")).is_empty():
		return String(row.get("display_name", class_id))
	return "%s — %s. %s %s" % [
		String(row.get("display_name", "")),
		String(row.get("role", "")),
		String(row.get("summary", "")),
		String(row.get("disclaimer", "")),
	]
