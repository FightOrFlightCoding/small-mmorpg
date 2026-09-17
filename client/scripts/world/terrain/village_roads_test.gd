extends Node2D

## Development review of the expanded starter map: grass, stone roads, C01.

const TILESET_PATH := "res://resources/world/terrain/grass_foundation_tileset.tres"
const MOVE_SPEED := 120.0

@onready var _ground: TileMapLayer = $WorldTerrain/GrassGround
@onready var _details: TileMapLayer = $WorldTerrain/GrassDetails
@onready var _roads: TileMapLayer = $WorldTerrain/StoneRoads
@onready var _player: PlayerAvatar = $PlayerAvatar
@onready var _camera: Camera2D = $Camera2D

var _grass: GrassFoundationPainter = GrassFoundationPainter.new()
var _road_painter: VillageRoadPainter = VillageRoadPainter.new()
var _plan: Dictionary = {}
var _bounds: Rect2 = Rect2(Vector2.ZERO, Vector2(4096, 3072))
var _labels: Node2D


func _ready() -> void:
	texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	var tileset: TileSet = load(TILESET_PATH)
	GrassFoundationPainter.configure_layer(_ground, tileset)
	GrassFoundationPainter.configure_layer(_details, tileset)
	VillageRoadPainter.configure_layer(_roads, tileset)
	_ground.z_index = 0
	_details.z_index = 1
	_roads.z_index = 2
	_plan = _road_painter.load_plan()
	var map_info: Dictionary = _plan.get("map", {})
	_bounds = Rect2(
		Vector2.ZERO,
		Vector2(float(map_info.get("width_px", 4096)), float(map_info.get("height_px", 3072))),
	)
	_grass.paint_world_rect(_ground, _details, _bounds.size, GrassFoundationPainter.seed_for_zone("zone.starter"))
	_road_painter.paint_from_plan(_roads, _details, _plan)
	_configure_player()
	_apply_camera_limits()
	var args := OS.get_cmdline_user_args()
	var mode := _screenshot_mode(args)
	if mode == "overview":
		_add_overview_labels()
		_camera.zoom = Vector2(0.234, 0.234)
		_camera.position = _bounds.size * 0.5
	elif mode == "square":
		_player.position = VillageRoadPainter.plaza_pixel(_plan)
		_player.set_idle_facing(Vector2.UP)
		_clamp_camera()
	else:
		_clamp_camera()
	if not mode.is_empty():
		await _capture_screenshot(_screenshot_path(args, mode))


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
	_player.configure("player", "road-test", "C01", visual, true)
	_player.z_index = 7
	_player.set_vitals(1, 1, true)
	var health := _player.get_node_or_null("HealthBack")
	if health is CanvasItem:
		(health as CanvasItem).visible = false
	_player.position = VillageRoadPainter.spawn_pixel(_plan)
	_player.set_idle_facing(Vector2.UP)


func _apply_camera_limits() -> void:
	_camera.limit_left = 0
	_camera.limit_top = 0
	_camera.limit_right = int(_bounds.size.x)
	_camera.limit_bottom = int(_bounds.size.y)


func _clamp_camera() -> void:
	var half := Vector2(640.0, 360.0) / _camera.zoom
	_camera.position = Vector2(
		clampf(_player.position.x, half.x, _bounds.size.x - half.x),
		clampf(_player.position.y, half.y, _bounds.size.y - half.y),
	)


func _add_overview_labels() -> void:
	_labels = Node2D.new()
	_labels.name = "EditorRouteLabels"
	_labels.z_index = 20
	add_child(_labels)
	var anchors: Variant = _plan.get("anchors", [])
	if typeof(anchors) != TYPE_ARRAY:
		return
	for entry in anchors:
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		var anchor: Dictionary = entry
		var pixel: Variant = anchor.get("pixel", [])
		if typeof(pixel) != TYPE_ARRAY or (pixel as Array).size() < 2:
			continue
		var label := Label.new()
		label.text = String(anchor.get("id", ""))
		label.position = Vector2(float((pixel as Array)[0]) - 48.0, float((pixel as Array)[1]) - 72.0)
		label.add_theme_font_size_override("font_size", 22)
		label.add_theme_color_override("font_color", Color(0.95, 0.92, 0.78, 1.0))
		_labels.add_child(label)


func _screenshot_mode(args: PackedStringArray) -> String:
	for arg in args:
		if arg == "--screenshot-roads-spawn" or arg.begins_with("--screenshot-roads-spawn="):
			return "spawn"
		if arg == "--screenshot-roads-square" or arg.begins_with("--screenshot-roads-square="):
			return "square"
		if arg == "--screenshot-roads-overview" or arg.begins_with("--screenshot-roads-overview="):
			return "overview"
	return ""


func _screenshot_path(args: PackedStringArray, mode: String) -> String:
	for arg in args:
		if arg.begins_with("--screenshot-roads-%s=" % mode):
			return arg.substr(("--screenshot-roads-%s=" % mode).length())
	return "user://village_roads_%s.png" % mode


func _capture_screenshot(path: String) -> void:
	await RenderingServer.frame_post_draw
	await RenderingServer.frame_post_draw
	var image: Image = get_viewport().get_texture().get_image()
	if image == null:
		push_error("village road screenshot failed")
		get_tree().quit(1)
		return
	var abs_path := path
	if path.begins_with("user://") or path.begins_with("res://"):
		abs_path = ProjectSettings.globalize_path(path)
	DirAccess.make_dir_recursive_absolute(abs_path.get_base_dir())
	var err := image.save_png(abs_path)
	if err != OK:
		push_error("village road screenshot save failed: %s" % str(err))
		get_tree().quit(1)
		return
	print("VILLAGE_ROADS_SCREENSHOT=%s" % abs_path)
	get_tree().quit(0)
