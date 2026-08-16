class_name CombatFeedback
extends Node2D

## Presentation-only hit numbers. Damage values come from server COMBAT_EVENT.


func show_hit(world_pos: Vector2, amount: int, against_player: bool) -> void:
	if get_tree() == null:
		return
	var label := Label.new()
	label.text = str(amount)
	label.position = world_pos + Vector2(-10.0, -28.0)
	label.z_index = 20
	if against_player:
		label.add_theme_color_override("font_color", Color(0.95, 0.28, 0.22))
	else:
		label.add_theme_color_override("font_color", Color(0.98, 0.86, 0.28))
	label.add_theme_font_size_override("font_size", 14)
	add_child(label)
	var life := 0.8
	var elapsed := 0.0
	while elapsed < life and is_instance_valid(label):
		await get_tree().process_frame
		elapsed += get_process_delta_time()
		label.position.y -= 18.0 * get_process_delta_time()
		label.modulate.a = clampf(1.0 - elapsed / life, 0.0, 1.0)
	if is_instance_valid(label):
		label.queue_free()
