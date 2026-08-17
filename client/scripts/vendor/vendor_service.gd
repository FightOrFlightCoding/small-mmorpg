extends Node

## Sends vendor buy/sell intentions. Prices stay server-authoritative.

signal vendor_opened(npc_id: String, vendor_id: String)
signal vendor_closed

var last_npc_id: String = ""
var last_vendor_id: String = ""


func _ready() -> void:
	if not NetworkService.interaction_result_received.is_connected(_on_interaction_result):
		NetworkService.interaction_result_received.connect(_on_interaction_result)
	if not AppState.logged_out.is_connected(reset):
		AppState.logged_out.connect(reset)


func reset() -> void:
	last_npc_id = ""
	last_vendor_id = ""
	vendor_closed.emit()


func reset_for_tests() -> void:
	reset()


func open_from_dialogue() -> void:
	if last_npc_id.is_empty():
		return
	var vendor_id := _vendor_id_for(last_npc_id)
	if vendor_id.is_empty():
		return
	last_vendor_id = vendor_id
	vendor_opened.emit(last_npc_id, vendor_id)


func request_buy(item_id: String, quantity: int = 1) -> void:
	if last_npc_id.is_empty() or item_id.is_empty():
		return
	NetworkService.send_vendor_buy(last_npc_id, item_id, quantity)


func request_sell(instance_id: String, quantity: int = 0) -> void:
	if last_npc_id.is_empty() or instance_id.is_empty():
		return
	NetworkService.send_vendor_sell(last_npc_id, instance_id, quantity)


func stock_entries(vendor_id: String = "") -> Array:
	var id := vendor_id
	if id.is_empty():
		id = last_vendor_id
	var vendor: Dictionary = ContentRegistry.get_by_id(id)
	var stock: Variant = vendor.get("stock", [])
	if typeof(stock) != TYPE_ARRAY:
		return []
	return stock


func _on_interaction_result(payload: Dictionary) -> void:
	if not bool(payload.get("result_ok", false)):
		return
	var npc_id := String(payload.get("target_id", ""))
	if npc_id.is_empty():
		return
	var services: Array = payload.get("services", [])
	if services.has("vendor"):
		last_npc_id = npc_id
		last_vendor_id = _vendor_id_for(npc_id)


func _vendor_id_for(npc_id: String) -> String:
	var npc: Dictionary = ContentRegistry.get_by_id(npc_id)
	var services: Variant = npc.get("services", [])
	if typeof(services) != TYPE_ARRAY:
		return ""
	for entry in services:
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		if String(entry.get("type", "")) != "vendor":
			continue
		return String(entry.get("vendorId", ""))
	return ""
