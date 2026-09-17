extends SceneTree

## Headless proof that C01 walk SpriteFrames advance under AnimatedSprite2D.play().


func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	var code := await _verify()
	quit(code)


func _verify() -> int:
	var avatar: Node2D = (load("res://scenes/world/player_avatar.tscn") as PackedScene).instantiate()
	root.add_child(avatar)
	await process_frame
	var anim: AnimatedSprite2D = avatar.get_node("AnimatedSprite2D") as AnimatedSprite2D
	if anim == null or anim.sprite_frames == null:
		push_error("AnimatedSprite2D / SpriteFrames missing on player_avatar.tscn")
		return 2
	anim.visible = true
	if avatar.has_node("Body"):
		(avatar.get_node("Body") as CanvasItem).visible = false
	anim.play(&"walk_right")
	if not anim.is_playing():
		push_error("walk_right did not start playing")
		return 3
	var seen := {}
	var elapsed := 0.0
	while elapsed < 0.75:
		await process_frame
		elapsed += 1.0 / 60.0
		seen[anim.frame] = true
	if seen.size() < 2:
		push_error("walk frames did not advance; seen=%s playing=%s frame=%s progress=%s speed=%s" % [
			str(seen.keys()), anim.is_playing(), anim.frame, anim.frame_progress,
			anim.sprite_frames.get_animation_speed(&"walk_right")
		])
		return 4
	print("C01_WALK_PLAYBACK_OK frames=%s speed=%s" % [
		str(seen.keys()), anim.sprite_frames.get_animation_speed(&"walk_right")
	])
	return 0
