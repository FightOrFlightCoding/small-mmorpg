extends SceneTree

## Headless captures of residential houses on the expanded village map.

var _frames: int = 0
var _mode: String = "overview"
var _out_path: String = "/opt/cursor/artifacts/screenshots/residential_houses_overview.png"
var _scene: Node2D


func _initialize() -> void:
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--mode="):
			_mode = arg.substr("--mode=".length())
		if arg.begins_with("--out="):
			_out_path = arg.substr("--out=".length())
	var packed: PackedScene = load("res://scenes/world/terrain/village_roads_test.tscn")
	if packed == null:
		push_error("missing village roads review scene")
		quit(1)
		return
	_scene = packed.instantiate() as Node2D
	root.add_child(_scene)


func _process(_delta: float) -> bool:
	_frames += 1
	if _frames == 2 and _scene != null and _scene.has_method("apply_house_capture_mode"):
		_scene.call("apply_house_capture_mode", _mode)
	if _frames < 8:
		return false
	var image: Image = root.get_viewport().get_texture().get_image()
	if image == null:
		push_error("residential house screenshot failed")
		quit(1)
		return true
	DirAccess.make_dir_recursive_absolute(_out_path.get_base_dir())
	var err := image.save_png(_out_path)
	print("RESIDENTIAL_HOUSES_SCREENSHOT=%s err=%s %sx%s mode=%s" % [
		_out_path, str(err), str(image.get_width()), str(image.get_height()), _mode
	])
	quit(0 if err == OK else 1)
	return true
