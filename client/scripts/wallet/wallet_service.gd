extends Node

## Mirrors server wallet gold. The client never submits currency changes.

signal wallet_changed
signal notice_received(code: String, message: String)

var gold: int = 0
var last_notice: String = ""


func _ready() -> void:
	if not AppState.zone_state_updated.is_connected(_on_zone_state_updated):
		AppState.zone_state_updated.connect(_on_zone_state_updated)
	if not AppState.logged_out.is_connected(reset):
		AppState.logged_out.connect(reset)
	if not NetworkService.wallet_state_received.is_connected(_on_wallet_state):
		NetworkService.wallet_state_received.connect(_on_wallet_state)
	if not NetworkService.system_notice_received.is_connected(_on_system_notice):
		NetworkService.system_notice_received.connect(_on_system_notice)


func reset() -> void:
	gold = 0
	last_notice = ""
	wallet_changed.emit()


func reset_for_tests() -> void:
	reset()


func apply_gold(value: int) -> void:
	if value < 0:
		value = 0
	if gold == value:
		return
	gold = value
	wallet_changed.emit()


func _on_zone_state_updated() -> void:
	if not AppState.zone_view_is_full:
		return
	var wallet: Variant = AppState.zone_view.get("wallet", {})
	if typeof(wallet) != TYPE_DICTIONARY:
		return
	apply_gold(int(wallet.get("gold", 0)))


func _on_wallet_state(payload: Dictionary) -> void:
	apply_gold(int(payload.get("gold", 0)))


func _on_system_notice(code: String, message: String) -> void:
	last_notice = message
	notice_received.emit(code, message)
