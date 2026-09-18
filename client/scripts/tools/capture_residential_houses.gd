extends SceneTree

## Headless captures of residential houses on the expanded village map.


func _initialize() -> void:
	var mode := "overview"
	var out_path := "/opt/cursor/artifacts/screenshots/residential_houses_overview.png"
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--mode="):
			mode = arg.substr("--mode=".length())
		if arg.begins_with("--out="):
			out_path = arg.substr("--out=".length())
	var packed: PackedScene = load("res://scenes/world/terrain/village_roads_test.tscn")
	if packed == null:
		push_error("missing village roads review scene")
		quit(1)
		return
	OS.set_cmdline_user_args(PackedStringArray([
		"--screenshot-houses-%s=%s" % [mode, out_path],
	]))
	var scene: Node = packed.instantiate()
	root.add_child(scene)
