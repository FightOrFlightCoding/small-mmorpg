extends Node2D

## Reusable grass foundation review scene. Local WASD only; no network.

const MANIFEST_PATH := "res://data/world/terrain/grass_foundation_manifest.json"
const MOVE_SPEED := 120.0

@onready var _ground: TileMapLayer = $WorldTerrain/GrassGround
@onready var _details: TileMapLayer = $WorldTerrain/GrassDetails
@onready var _player: PlayerAvatar = $PlayerAvatar
@onready var _camera: Camera2D = $Camera2D

var _painter: GrassFoundationPainter = GrassFoundationPainter.new()
var _seed: int = GrassFoundationPainter.DEFAULT_SEED
var _bounds: Rect2 = Rect2(Vector2.ZERO, Vector2(GrassFoundationPainter.TEST_MAP_SIZE) * GrassFoundationPainter.TILE_SIZE)


func _ready() -> void:
	texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	_load_seed()
	GrassFoundationPainter.configure_layer(_ground, _ground.tile_set)
	GrassFoundationPainter.configure_layer(_details, _details.tile_set)
	_ground.z_index = 0
	_details.z_index = 1
	_painter.paint_test_map(_ground, _details, _seed)
	_configure_player()
	_clamp_camera()
	var args := OS.get_cmdline_user_args()
	if _wants_screenshot(args):
		await _capture_screenshot(_screenshot_path(args))


func _process(delta: float) -> void:
	var axis := Input.get_vector("move_left", "move_right", "move_up", "move_down")
	if axis.length_squared() > 1.0:
		axis = axis.normalized()
	_player.set_move_vector(axis)
	if axis.length_squared() > 0.0001:
		_player.position += axis * MOVE_SPEED * delta
		_player.position.x = clampf(_player.position.x, 12.0, _bounds.size.x - 12.0)
		_player.position.y = clampf(_player.position.y, 12.0, _bounds.size.y - 12.0)
		_clamp_camera()


func _configure_player() -> void:
	if ContentRegistry.get_content_hash().is_empty():
		ContentRegistry.load_bundle()
	var visual: Dictionary = ContentRegistry.resolve_visual("visual.class_vanguard")
	var vis_set: Dictionary = ContentRegistry.resolve_visual_set_for_content("player.base")
	visual["visual_set"] = vis_set
	visual["direction_count"] = int(vis_set.get("directionCount", 4))
	visual["missing"] = false
	_player.configure("player", "grass-test", "C01", visual, true)
	_player.z_index = 7
	_player.set_vitals(1, 1, true)
	var health := _player.get_node_or_null("HealthBack")
	if health is CanvasItem:
		(health as CanvasItem).visible = false
	_player.set_move_vector(Vector2.ZERO)


func _clamp_camera() -> void:
	var half := Vector2(640.0, 360.0)
	_camera.position = Vector2(
		clampf(_player.position.x, half.x, _bounds.size.x - half.x),
		clampf(_player.position.y, half.y, _bounds.size.y - half.y),
	)


func _load_seed() -> void:
	if not FileAccess.file_exists(MANIFEST_PATH):
		return
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(MANIFEST_PATH))
	if typeof(parsed) != TYPE_DICTIONARY:
		return
	_seed = int((parsed as Dictionary).get("test_scene_seed", _seed))


func _wants_screenshot(args: PackedStringArray) -> bool:
	for arg in args:
		if arg == "--screenshot-grass" or arg.begins_with("--screenshot-grass="):
			return true
	return false


func _screenshot_path(args: PackedStringArray) -> String:
	for arg in args:
		if arg.begins_with("--screenshot-grass="):
			return arg.substr("--screenshot-grass=".length())
	return "user://grass_foundation_test.png"


func _capture_screenshot(path: String) -> void:
	await RenderingServer.frame_post_draw
	await RenderingServer.frame_post_draw
	var image: Image = get_viewport().get_texture().get_image()
	if image == null:
		push_error("grass foundation screenshot failed")
		get_tree().quit(1)
		return
	var abs_path := path
	if path.begins_with("user://") or path.begins_with("res://"):
		abs_path = ProjectSettings.globalize_path(path)
	var err := image.save_png(abs_path)
	if err != OK:
		push_error("grass foundation screenshot save failed: %s" % str(err))
		get_tree().quit(1)
		return
	print("GRASS_FOUNDATION_SCREENSHOT=%s" % abs_path)
	get_tree().quit(0)
