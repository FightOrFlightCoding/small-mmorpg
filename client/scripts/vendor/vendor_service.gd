extends Node

## Sends vendor buy/sell intentions. Prices stay server-authoritative.

signal vendor_opened(npc_id: String, vendor_id: String)
signal vendor_closed

var last_npc_id: String = ""
var last_vendor_id: String = ""
var last_session_id: String = ""
var last_currency_id: String = "gold"
var last_request_id: String = ""
var last_stock: Array = []

var _window: MerchantWindow
var _closing: bool = false


func _ready() -> void:
	if not NetworkService.interaction_result_received.is_connected(_on_interaction_result):
		NetworkService.interaction_result_received.connect(_on_interaction_result)
	if not NetworkService.action_result_received.is_connected(_on_action_result):
		NetworkService.action_result_received.connect(_on_action_result)
	if not AppState.logged_out.is_connected(reset):
		AppState.logged_out.connect(reset)
	if not WalletService.wallet_changed.is_connected(_on_wallet_changed):
		WalletService.wallet_changed.connect(_on_wallet_changed)
	if not WindowManager.window_closed.is_connected(_on_window_closed):
		WindowManager.window_closed.connect(_on_window_closed)


func reset() -> void:
	var was_open := is_open()
	last_npc_id = ""
	last_vendor_id = ""
	last_session_id = ""
	last_currency_id = "gold"
	last_request_id = ""
	last_stock = []
	if _window != null:
		_window.close_window()
	if was_open:
		_emit_closed()


func reset_for_tests() -> void:
	reset()


func is_open() -> bool:
	return _window != null and _window.is_open()


func open_from_dialogue() -> void:
	if last_npc_id.is_empty():
		return
	var vendor_id := last_vendor_id
	if vendor_id.is_empty():
		vendor_id = _vendor_id_for(last_npc_id)
	if vendor_id.is_empty():
		return
	last_vendor_id = vendor_id
	_ensure_window()
	_window.present({
		"npc_id": last_npc_id,
		"npc_name": _npc_name(last_npc_id),
		"vendor_id": vendor_id,
		"interaction_session_id": last_session_id,
		"stock": stock_entries(vendor_id),
		"gold": WalletService.gold,
	})
	vendor_opened.emit(last_npc_id, vendor_id)


func close_to_dialogue() -> void:
	if _window != null:
		_window.close_window()
	_emit_closed()


func request_buy(item_id: String, quantity: int = 1) -> void:
	if last_npc_id.is_empty() or item_id.is_empty() or last_session_id.is_empty():
		return
	last_request_id = MatchProtocol.new_request_id()
	if _window != null and _window.is_open():
		_window.show_busy()
	NetworkService.send_vendor_buy(
		last_session_id,
		last_npc_id,
		item_id,
		quantity,
		last_request_id
	)


func request_sell(instance_id: String, quantity: int = 0) -> void:
	if last_npc_id.is_empty() or instance_id.is_empty():
		return
	last_request_id = MatchProtocol.new_request_id()
	if _window != null and _window.is_open():
		_window.show_busy()
	NetworkService.send_vendor_sell(last_npc_id, instance_id, quantity, last_request_id)


func stock_entries(vendor_id: String = "") -> Array:
	if not last_stock.is_empty() and (vendor_id.is_empty() or vendor_id == last_vendor_id):
		return last_stock
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
		var code := String(payload.get("code", ""))
		if _is_session_terminal(code):
			reset()
		return
	var npc_id := String(payload.get("target_id", ""))
	if npc_id.is_empty():
		return
	var session_id := String(payload.get("interaction_session_id", ""))
	if not session_id.is_empty():
		last_session_id = session_id
	var services: Array = MatchProtocol.string_ids(payload.get("available_service_ids", payload.get("services", [])))
	if services.find("vendor") < 0:
		return
	last_npc_id = npc_id
	var vendor_id := String(payload.get("vendor_id", ""))
	if vendor_id.is_empty():
		vendor_id = _vendor_id_for(npc_id)
	last_vendor_id = vendor_id
	var currency_id := String(payload.get("currency_id", ""))
	if not currency_id.is_empty():
		last_currency_id = currency_id
	var stock: Variant = payload.get("stock", [])
	if typeof(stock) == TYPE_ARRAY and not (stock as Array).is_empty():
		last_stock = (stock as Array).duplicate(true)


func _on_action_result(payload: Dictionary) -> void:
	var request_id := String(payload.get("request_id", ""))
	if request_id.is_empty() or request_id != last_request_id:
		return
	last_request_id = ""
	if _window == null or not _window.is_open():
		return
	if bool(payload.get("result_ok", false)):
		_window.show_status("Purchase complete.")
		_window.set_player_gold(WalletService.gold)
	else:
		_window.show_status(_error_message(String(payload.get("code", "vendor_failed"))), true)


func _on_wallet_changed() -> void:
	if _window != null and _window.is_open():
		_window.set_player_gold(WalletService.gold)


func _on_window_closed(window_id: String) -> void:
	if window_id != WindowManager.VENDOR:
		return
	if _closing:
		return
	if _window == null or not _window.is_open():
		return
	_window.close_window()
	_emit_closed()


func _on_buy(item_id: String, quantity: int) -> void:
	request_buy(item_id, quantity)


func _on_sell(instance_id: String, quantity: int) -> void:
	request_sell(instance_id, quantity)


func _on_back() -> void:
	close_to_dialogue()


func _ensure_window() -> void:
	if _window != null and is_instance_valid(_window):
		return
	_window = MerchantWindow.new()
	_window.name = "MerchantWindow"
	add_child(_window)
	if not _window.buy_requested.is_connected(_on_buy):
		_window.buy_requested.connect(_on_buy)
	if not _window.sell_requested.is_connected(_on_sell):
		_window.sell_requested.connect(_on_sell)
	if not _window.back_requested.is_connected(_on_back):
		_window.back_requested.connect(_on_back)


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


func _npc_name(npc_id: String) -> String:
	var npc: Dictionary = ContentRegistry.get_by_id(npc_id)
	var named := String(npc.get("displayName", ""))
	if named.is_empty():
		return npc_id
	return named


func _emit_closed() -> void:
	if _closing:
		return
	_closing = true
	vendor_closed.emit()
	_closing = false


func _is_session_terminal(code: String) -> bool:
	match code:
		"session_expired", "session_invalidated", "invalid_session", "out_of_range", "player_dead", "link_dead", "character_missing", "already_transferring":
			return true
		_:
			return false


func _error_message(code: String) -> String:
	match code:
		"insufficient_gold":
			return "You cannot afford that."
		"inventory_full":
			return "Your inventory is full."
		"invalid_amount":
			return "That quantity is not allowed."
		"invalid_id":
			return "That item is not sold here."
		"invalid_session", "session_expired", "session_invalidated":
			return "The conversation is no longer valid."
		"class_restricted":
			return "Your class cannot use that item."
		"level_too_low":
			return "Your level is too low for that item."
		"item_locked":
			return "That item is locked."
		"unsellable":
			return "That item cannot be sold."
		"persist_failed":
			return "The purchase could not be saved."
		_:
			return "The merchant rejected that request."
