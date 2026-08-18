extends Node

## Mirrors server trade state. The client never predicts ownership or gold changes.

signal trade_changed
signal invite_received(payload: Dictionary)
signal trade_notice(message: String)

var trade: Dictionary = {}
var last_error: String = ""
var offer_changed: bool = false
var last_result: String = ""
var _seen_revision: int = -1
var _character_id: String = ""
var _pending_trade: bool = false


func _ready() -> void:
	if not AppState.logged_out.is_connected(reset):
		AppState.logged_out.connect(reset)
	if not NetworkService.trade_state_received.is_connected(_on_trade_state):
		NetworkService.trade_state_received.connect(_on_trade_state)
	if not NetworkService.action_result_received.is_connected(_on_action_result):
		NetworkService.action_result_received.connect(_on_action_result)


func reset() -> void:
	trade = {}
	last_error = ""
	offer_changed = false
	last_result = ""
	_seen_revision = -1
	_pending_trade = false
	trade_changed.emit()


func reset_for_tests() -> void:
	reset()


func apply_trade(data: Dictionary) -> void:
	var next: Dictionary = data.duplicate(true)
	var next_trade_id := String(next.get("tradeId", ""))
	var state := String(next.get("state", ""))
	if next_trade_id.is_empty():
		trade = {}
		offer_changed = false
		_seen_revision = -1
		trade_changed.emit()
		return
	var revision := int(next.get("revision", 0))
	offer_changed = _seen_revision >= 0 and revision != _seen_revision and state == "open"
	_seen_revision = revision
	trade = next
	last_error = ""
	_pending_trade = state == "inviting" or state == "open" or state == "committing"
	if state == "inviting" and _is_invitee():
		invite_received.emit(trade)
	if state == "completed":
		last_result = "Trade complete."
		offer_changed = false
	elif state == "cancelled":
		last_result = "Trade cancelled."
		offer_changed = false
	trade_changed.emit()


func is_trading() -> bool:
	var state := String(trade.get("state", ""))
	return state == "inviting" or state == "open" or state == "committing"


func trade_id() -> String:
	return String(trade.get("tradeId", ""))


func revision() -> int:
	return int(trade.get("revision", 0))


func request_invite(target_id: String) -> void:
	_pending_trade = true
	NetworkService.send_trade_invite(target_id)


func request_accept_invite() -> void:
	var id := trade_id()
	if id.is_empty():
		return
	_pending_trade = true
	NetworkService.send_trade_accept_invite(id)


func request_decline_invite() -> void:
	var id := trade_id()
	if id.is_empty():
		return
	_pending_trade = true
	NetworkService.send_trade_decline_invite(id)


func request_set_offer(instance_id: String, quantity: int = 0) -> void:
	var id := trade_id()
	if id.is_empty() or instance_id.is_empty():
		return
	_pending_trade = true
	NetworkService.send_trade_set_offer(id, instance_id, quantity)


func request_remove_offer(instance_id: String) -> void:
	var id := trade_id()
	if id.is_empty() or instance_id.is_empty():
		return
	_pending_trade = true
	NetworkService.send_trade_remove_offer(id, instance_id)


func request_set_gold(amount: int) -> void:
	var id := trade_id()
	if id.is_empty():
		return
	_pending_trade = true
	NetworkService.send_trade_set_gold(id, amount)


func request_accept_revision() -> void:
	var id := trade_id()
	if id.is_empty():
		return
	_pending_trade = true
	NetworkService.send_trade_accept_revision(id, revision())


func request_cancel() -> void:
	var id := trade_id()
	if id.is_empty():
		return
	_pending_trade = true
	NetworkService.send_trade_cancel(id)


func _on_trade_state(payload: Dictionary) -> void:
	if not bool(payload.get("ok", false)):
		last_error = String(payload.get("code", "trade_failed"))
		trade_notice.emit(last_error)
		trade_changed.emit()
		return
	var body: Variant = payload.get("trade", {})
	if typeof(body) != TYPE_DICTIONARY:
		return
	apply_trade(body as Dictionary)


func _on_action_result(payload: Dictionary) -> void:
	if bool(payload.get("result_ok", payload.get("ok", false))):
		return
	var code := String(payload.get("code", ""))
	if code.is_empty():
		return
	var result_trade_id := String(payload.get("trade_id", ""))
	if not _pending_trade and not is_trading() and result_trade_id.is_empty():
		return
	if not result_trade_id.is_empty() and not trade_id().is_empty() and result_trade_id != trade_id():
		return
	last_error = code
	_pending_trade = false
	trade_notice.emit(code)
	trade_changed.emit()


func _is_invitee() -> bool:
	var participant_b: Variant = trade.get("participantB", {})
	if typeof(participant_b) != TYPE_DICTIONARY:
		return false
	return String((participant_b as Dictionary).get("characterId", "")) == _local_character_id()


func _local_character_id() -> String:
	if not _character_id.is_empty():
		return _character_id
	return String(AppState.character_view.get("character_id", ""))
