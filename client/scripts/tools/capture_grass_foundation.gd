extends SceneTree

## Headless capture of the grass foundation test scene at gameplay zoom.

var _frames: int = 0
var _out_path: String = "/opt/cursor/artifacts/screenshots/grass_foundation_test.png"


func _initialize() -> void:
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--out="):
			_out_path = arg.substr("--out=".length())
	var packed: PackedScene = load("res://scenes/world/terrain/grass_foundation_test.tscn")
	if packed == null:
		push_error("missing grass foundation test scene")
		quit(1)
		return
	var scene: Node = packed.instantiate()
	root.add_child(scene)


func _process(_delta: float) -> bool:
	_frames += 1
	if _frames < 4:
		return false
	var image: Image = root.get_viewport().get_texture().get_image()
	if image == null:
		push_error("viewport image missing")
		quit(1)
		return true
	DirAccess.make_dir_recursive_absolute(_out_path.get_base_dir())
	var err := image.save_png(_out_path)
	print("GRASS_FOUNDATION_SCREENSHOT=%s err=%s %sx%s" % [_out_path, str(err), str(image.get_width()), str(image.get_height())])
	quit(0 if err == OK else 1)
	return true
