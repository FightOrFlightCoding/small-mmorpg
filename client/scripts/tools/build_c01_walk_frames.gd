extends SceneTree

## Builds SpriteFrames from the C01 move sheet (Godot AtlasTexture slices).

const SHEET_PATH := "res://assets/characters/c01/c01_move.png"
const OUT_PATH := "res://assets/characters/c01/c01_walk_frames.tres"
const CELL := Vector2i(192, 160)
const COLS := 4
const FPS_CARDINAL := 8.0
const FPS_SIDE := 7.0
## Even contact/pass timing so legs alternate plant → low pass → plant cleanly.
const SIDE_FRAME_DURATIONS := [1.1, 1.0, 1.1, 1.0]

const ROW_ANIMS := {
	0: "walk_down",
	1: "walk_right",
	2: "walk_up",
}


func _init() -> void:
	var code := _build()
	if code != OK:
		push_error("C01 walk SpriteFrames build failed: %s" % error_string(code))
	else:
		print("C01_WALK_FRAMES_OK %s" % OUT_PATH)
	quit(code)


func _build() -> Error:
	if not ResourceLoader.exists(SHEET_PATH):
		push_error("Missing walk sheet: %s" % SHEET_PATH)
		return ERR_FILE_NOT_FOUND
	var sheet: Texture2D = load(SHEET_PATH) as Texture2D
	if sheet == null:
		return ERR_CANT_ACQUIRE_RESOURCE
	if sheet.get_width() != CELL.x * COLS or sheet.get_height() != CELL.y * 3:
		push_error("Unexpected sheet size %sx%s" % [sheet.get_width(), sheet.get_height()])
		return ERR_INVALID_DATA
	var frames := SpriteFrames.new()
	if frames.has_animation(&"default"):
		frames.remove_animation(&"default")
	for row in ROW_ANIMS.keys():
		var anim_name: StringName = StringName(ROW_ANIMS[row])
		var side := int(row) == 1
		_add_row(frames, sheet, anim_name, int(row), side)
	_add_row(frames, sheet, &"walk_left", 1, true)
	return ResourceSaver.save(frames, OUT_PATH)


func _add_row(frames: SpriteFrames, sheet: Texture2D, anim_name: StringName, row: int, side: bool) -> void:
	frames.add_animation(anim_name)
	frames.set_animation_speed(anim_name, FPS_SIDE if side else FPS_CARDINAL)
	frames.set_animation_loop(anim_name, true)
	for col in range(COLS):
		var atlas := AtlasTexture.new()
		atlas.atlas = sheet
		atlas.filter_clip = true
		atlas.region = Rect2(col * CELL.x, row * CELL.y, CELL.x, CELL.y)
		var duration := 1.0
		if side:
			duration = float(SIDE_FRAME_DURATIONS[col])
		frames.add_frame(anim_name, atlas, duration)
