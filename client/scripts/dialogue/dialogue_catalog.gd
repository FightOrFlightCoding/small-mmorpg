class_name DialogueCatalog
extends RefCounted

## Maps NPC IDs to local Dialogue Manager resources. Not part of the content hash.

const DEFAULT_MAP_PATH: String = "res://content/dialogue_map.json"


static func path_for_npc(npc_id: String, map_path: String = DEFAULT_MAP_PATH, dialogue_id: String = "") -> String:
	if not FileAccess.file_exists(map_path):
		return ""
	var file := FileAccess.open(map_path, FileAccess.READ)
	if file == null:
		return ""
	var parsed: Variant = JSON.parse_string(file.get_as_text())
	if typeof(parsed) != TYPE_DICTIONARY:
		return ""
	var map: Dictionary = parsed
	if not dialogue_id.is_empty():
		var mapped := String(map.get(dialogue_id, ""))
		if not mapped.is_empty():
			return mapped
	if npc_id.is_empty():
		return ""
	var key := "dialogue.%s" % npc_id
	return String(map.get(key, ""))


static func load_resource(npc_id: String, dialogue_id: String = "") -> Resource:
	var path := path_for_npc(npc_id, DEFAULT_MAP_PATH, dialogue_id)
	if path.is_empty():
		return null
	if ResourceLoader.exists(path):
		return load(path)
	if not FileAccess.file_exists(path):
		return null
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		return null
	return DialogueManager.create_resource_from_text(file.get_as_text())
