extends Node

## Loads the generated client content bundle. Lookup is by stable ID only.

signal content_loaded(content_hash: String)

const DEFAULT_BUNDLE_PATH: String = "res://content/bundle.json"

var catalog: ContentCatalog = ContentCatalog.new()
var visuals: VisualCatalog = VisualCatalog.new()
var assets: AssetManifest = AssetManifest.new()
var loaded_path: String = ""


func load_bundle(path: String = DEFAULT_BUNDLE_PATH) -> bool:
	AppState.notify_loading_started("content")
	catalog = ContentCatalog.new()
	visuals = VisualCatalog.new()
	assets = AssetManifest.new()
	loaded_path = path

	if not FileAccess.file_exists(path):
		catalog.parse_text("")
		catalog.error_code = "content_missing"
		catalog.error_message = "The content bundle was not found."
		AppState.notify_loading_completed("content")
		return false

	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		catalog.parse_text("")
		catalog.error_code = "content_missing"
		catalog.error_message = "The content bundle could not be opened."
		AppState.notify_loading_completed("content")
		return false

	var text := file.get_as_text()
	var ok := catalog.parse_text(text)
	visuals.load_map()
	assets.load_manifest()
	AppState.notify_loading_completed("content")
	if ok:
		content_loaded.emit(catalog.content_hash)
		AppState.notify_content_loaded(catalog.content_hash)
	return ok


func get_content_hash() -> String:
	return catalog.content_hash


func get_schema_version() -> int:
	return catalog.schema_version


func ids_of_kind(kind: String) -> PackedStringArray:
	return catalog.ids_of_kind(kind)


func has_id(id: String) -> bool:
	return catalog.has_id(id)


func get_by_id(id: String) -> Dictionary:
	return catalog.get_by_id(id)


func resolve_visual(visual_id: String) -> Dictionary:
	return visuals.resolve(visual_id)


func visual_id_for_content(content_id: String) -> String:
	var record: Dictionary = get_by_id(content_id)
	if record.is_empty():
		return ""
	return String(record.get("visualId", ""))


func resolve_visual_set(set_id: String) -> Dictionary:
	return assets.resolve_set(set_id)


func resolve_visual_set_for_content(content_id: String) -> Dictionary:
	return assets.resolve_set_for_content(content_id)
