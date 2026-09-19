extends Node

## Shared right-click router. Later trade/corpse/merchant phases set context; slots do not.

signal notice(message: String)

const CONTEXT_BAG := "bag"
const CONTEXT_TRADE := "trade"
const CONTEXT_CORPSE := "corpse"
const CONTEXT_MERCHANT := "merchant"

const ACTION_EQUIP := "equip"
const ACTION_SPLIT := "split"
const ACTION_LOCKED := "locked"

var context: String = CONTEXT_BAG
var last_notice: String = ""
var last_actions: Array = []

var _menu: PopupMenu


func reset_for_tests() -> void:
	context = CONTEXT_BAG
	last_notice = ""
	last_actions = []
	if _menu != null:
		_menu.hide()


func set_context(next_context: String) -> void:
	if next_context.is_empty():
		context = CONTEXT_BAG
		return
	context = next_context


func handle_slot(slot: ItemSlotView) -> void:
	if slot == null:
		return
	handle_origin(_origin_from_slot(slot), slot.instance, slot.get_global_mouse_position())


func handle_origin(origin: Dictionary, instance: Dictionary, at: Vector2 = Vector2.ZERO) -> void:
	last_actions = actions_for(origin, instance)
	if last_actions.is_empty():
		return
	if last_actions.size() == 1 and String((last_actions[0] as Dictionary).get("id", "")) == ACTION_LOCKED:
		_emit_notice(String((last_actions[0] as Dictionary).get("label", ItemPresentation.lock_reason(instance))))
		return
	_show_menu(origin, instance, at)


func actions_for(origin: Dictionary, instance: Dictionary) -> Array:
	if String(instance.get("instanceId", "")).is_empty():
		return []
	if context == CONTEXT_TRADE or context == CONTEXT_CORPSE or context == CONTEXT_MERCHANT:
		return []
	var actions: Array = []
	if ItemPresentation.is_locked(instance):
		actions.append({
			"id": ACTION_LOCKED,
			"label": ItemPresentation.lock_reason(instance),
			"disabled": true,
		})
		return actions
	var definition: Dictionary = ItemPresentation.definition_for(ItemPresentation.item_id_of(instance))
	if bool(definition.get("equippable", false)) and String(origin.get("kind", "bag")) == "bag":
		actions.append({"id": ACTION_EQUIP, "label": "Equip", "disabled": false})
	var quantity := int(instance.get("quantity", 1))
	if quantity > 1 and String(origin.get("kind", "bag")) == "bag":
		actions.append({"id": ACTION_SPLIT, "label": "Split Stack", "disabled": false})
	return actions


func execute(action_id: String, origin: Dictionary, instance: Dictionary) -> void:
	var instance_id := String(instance.get("instanceId", ""))
	if instance_id.is_empty():
		return
	match action_id:
		ACTION_EQUIP:
			var tag := String(origin.get("equipment_tag", EquipmentService.selected_slot))
			EquipmentService.request_equip(instance_id, tag if not tag.is_empty() else EquipmentService.MAIN_HAND_SLOT)
		ACTION_SPLIT:
			InventoryService.prompt_split(instance_id)
		ACTION_LOCKED:
			_emit_notice(ItemPresentation.lock_reason(instance))
		_:
			return


func _origin_from_slot(slot: ItemSlotView) -> Dictionary:
	return {
		"kind": slot.origin_kind,
		"slot_index": slot.slot_index,
		"equipment_tag": slot.equipment_tag,
	}


func _show_menu(origin: Dictionary, instance: Dictionary, at: Vector2) -> void:
	_ensure_menu()
	_menu.clear()
	_menu.set_meta("origin", origin)
	_menu.set_meta("instance", instance)
	for index in range(last_actions.size()):
		var action: Dictionary = last_actions[index]
		_menu.add_item(String(action.get("label", "")), index)
		_menu.set_item_disabled(index, bool(action.get("disabled", false)))
		_menu.set_item_metadata(index, String(action.get("id", "")))
	var pos := at
	if pos == Vector2.ZERO:
		pos = _menu.get_viewport().get_mouse_position() if _menu.get_viewport() != null else Vector2.ZERO
	_menu.position = Vector2i(pos)
	_menu.popup()


func _ensure_menu() -> void:
	if _menu != null:
		return
	_menu = PopupMenu.new()
	_menu.name = "ItemContextMenu"
	add_child(_menu)
	_menu.id_pressed.connect(_on_id_pressed)


func _on_id_pressed(id: int) -> void:
	if id < 0 or id >= last_actions.size():
		return
	var action: Dictionary = last_actions[id]
	var origin: Dictionary = _menu.get_meta("origin", {}) if _menu != null else {}
	var instance: Dictionary = _menu.get_meta("instance", {}) if _menu != null else {}
	execute(String(action.get("id", "")), origin, instance)


func _emit_notice(message: String) -> void:
	last_notice = message
	notice.emit(message)
	AppState.report_recoverable("item_locked", message)
