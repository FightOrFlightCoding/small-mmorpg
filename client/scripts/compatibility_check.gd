extends Node

## Headless compatibility probe for the pinned Godot 4.7.1 addons.
## Prints COMPATIBILITY_OK and exits 0, or COMPATIBILITY_FAIL and exits 1.


func _ready() -> void:
	var failures: PackedStringArray = PackedStringArray()

	if not _nakama_available():
		failures.append("nakama")
	if not _gloot_inventory_instantiates():
		failures.append("gloot")
	if not _dialogue_manager_available():
		failures.append("dialogue_manager")

	if failures.is_empty():
		print("COMPATIBILITY_OK")
		get_tree().quit(0)
		return

	var message := "COMPATIBILITY_FAIL:%s" % ",".join(failures)
	push_error(message)
	print(message)
	get_tree().quit(1)


func _nakama_available() -> bool:
	if Nakama == null:
		return false
	if not Nakama.has_method("create_client"):
		return false
	var client: NakamaClient = Nakama.create_client("defaultkey", "127.0.0.1", 7350, "http")
	return client != null


func _gloot_inventory_instantiates() -> bool:
	var inventory := Inventory.new()
	if inventory == null:
		return false
	var count: int = inventory.get_item_count()
	inventory.free()
	return count == 0


func _dialogue_manager_available() -> bool:
	if DialogueManager == null:
		return false
	if not Engine.has_singleton("DialogueManager"):
		return false
	return DialogueManager.has_method("get_next_dialogue_line")
