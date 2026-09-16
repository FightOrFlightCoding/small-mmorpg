extends Node

## Client drag preview only. Canonical inventory stays on the server.

signal drag_started(payload: Dictionary)
signal drag_cancelled
signal drag_rejected(code: String)
signal drag_completed

var active: bool = false
var payload: Dictionary = {}
var last_reject_code: String = ""


func reset_for_tests() -> void:
	active = false
	payload = {}
	last_reject_code = ""


func begin(next_payload: Dictionary) -> void:
	if next_payload.has("gold") or next_payload.has("damage") or next_payload.has("health"):
		reject("stat_injection")
		return
	active = true
	payload = next_payload.duplicate(true)
	last_reject_code = ""
	drag_started.emit(payload)


func cancel() -> void:
	if not active:
		return
	active = false
	payload = {}
	drag_cancelled.emit()


func reject(code: String) -> void:
	active = false
	payload = {}
	last_reject_code = code if not code.is_empty() else "rejected"
	drag_rejected.emit(last_reject_code)


func complete() -> void:
	if not active:
		return
	active = false
	payload = {}
	drag_completed.emit()
