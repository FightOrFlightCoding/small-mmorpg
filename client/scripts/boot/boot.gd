extends "res://scripts/ui/shell_page.gd"


func _ready() -> void:
	super._ready()
	var ok := GameService.start_boot()
	if not ok and _wants_shell_self_test():
		print("SHELL_FATAL")
		get_tree().quit(1)
