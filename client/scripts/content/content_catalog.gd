class_name ContentCatalog
extends RefCounted

## Parses the generated client content bundle. Does not touch user:// or Nakama.

const SCHEMA_VERSION: int = 1
const REQUIRED_KEYS := [
	"schemaVersion",
	"contentHash",
	"player",
	"items",
	"npcs",
	"enemies",
	"quests",
	"zones",
	"classes",
]
const REQUIRED_IDS := [
	"player.base",
	"zone.starter",
	"npc.elder",
	"enemy.green_slime",
	"item.training_sword",
	"item.slime_gel",
	"item.iron_sword",
	"quest.slime_problem",
]

var schema_version: int = 0
var content_hash: String = ""
var error_code: String = ""
var error_message: String = ""
var _by_id: Dictionary = {}


func parse_text(text: String) -> bool:
	_reset()
	if text.strip_edges().is_empty():
		return _fail("content_missing", "The content bundle is missing or empty.")

	var parsed: Variant = JSON.parse_string(text)
	if typeof(parsed) != TYPE_DICTIONARY:
		return _fail("content_malformed", "The content bundle is not valid JSON.")

	var data: Dictionary = parsed
	for key in REQUIRED_KEYS:
		if not data.has(key):
			if key == "schemaVersion":
				return _fail("content_schema_missing", "The content bundle has no schemaVersion.")
			return _fail("content_incompatible", "The content bundle is missing %s." % key)

	var version_value: Variant = data["schemaVersion"]
	if typeof(version_value) != TYPE_FLOAT and typeof(version_value) != TYPE_INT:
		return _fail("content_incompatible", "The content bundle schemaVersion is not a number.")
	schema_version = int(version_value)
	if schema_version != SCHEMA_VERSION:
		return _fail(
			"content_incompatible",
			"Content schema version %s is not supported (expected %s)." % [str(schema_version), str(SCHEMA_VERSION)]
		)

	var hash_value: Variant = data["contentHash"]
	if typeof(hash_value) != TYPE_STRING:
		return _fail("content_incompatible", "The content bundle contentHash is not a string.")
	content_hash = hash_value
	if not _is_hex64(content_hash):
		return _fail("content_incompatible", "The content bundle contentHash is not a 64-character hex digest.")

	if not _index_player(data["player"]):
		return false
	if not _index_catalog(data["items"], "item"):
		return false
	if not _index_catalog(data["npcs"], "npc"):
		return false
	if not _index_catalog(data["enemies"], "enemy"):
		return false
	if not _index_catalog(data["quests"], "quest"):
		return false
	if not _index_catalog(data["zones"], "zone"):
		return false
	if not _index_catalog(data["classes"], "class"):
		return false
	if ids_of_kind("class").size() == 0:
		return _fail("content_incompatible", "The content bundle has no class definitions.")

	for id in REQUIRED_IDS:
		if not has_id(id):
			return _fail("content_incompatible", "The content bundle is missing required id %s." % id)

	return true


func ids_of_kind(kind: String) -> PackedStringArray:
	var result := PackedStringArray()
	for id in _by_id.keys():
		var record: Variant = _by_id[id]
		if typeof(record) != TYPE_DICTIONARY:
			continue
		if String((record as Dictionary).get("kind", "")) == kind:
			result.append(String(id))
	result.sort()
	return result


func has_id(id: String) -> bool:
	return _by_id.has(id)


func get_by_id(id: String) -> Dictionary:
	if not _by_id.has(id):
		return {}
	return (_by_id[id] as Dictionary).duplicate(true)


func _index_player(value: Variant) -> bool:
	if typeof(value) != TYPE_DICTIONARY:
		return _fail("content_incompatible", "The content bundle player record is invalid.")
	var player: Dictionary = value
	if not player.has("id") or typeof(player["id"]) != TYPE_STRING:
		return _fail("content_incompatible", "The content bundle player record has no id.")
	_by_id[player["id"]] = player
	return true


func _index_catalog(value: Variant, kind: String) -> bool:
	if typeof(value) != TYPE_DICTIONARY:
		return _fail("content_incompatible", "The content bundle %s catalog is invalid." % kind)
	var catalog: Dictionary = value
	for id in catalog.keys():
		var entry: Variant = catalog[id]
		if typeof(entry) != TYPE_DICTIONARY:
			return _fail("content_incompatible", "The content bundle entry %s is invalid." % str(id))
		_by_id[str(id)] = entry
	return true


func _is_hex64(value: String) -> bool:
	if value.length() != 64:
		return false
	var regex := RegEx.new()
	regex.compile("^[a-f0-9]{64}$")
	return regex.search(value) != null


func _fail(code: String, message: String) -> bool:
	error_code = code
	error_message = message
	_by_id.clear()
	content_hash = ""
	schema_version = 0
	return false


func _reset() -> void:
	schema_version = 0
	content_hash = ""
	error_code = ""
	error_message = ""
	_by_id.clear()
