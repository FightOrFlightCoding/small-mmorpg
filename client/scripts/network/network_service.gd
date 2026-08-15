extends Node

## Project-owned network boundary. This phase exposes the interface and does not authenticate or contact Nakama.

signal authentication_started
signal authentication_finished(success: bool, message: String)

var last_auth_attempted: bool = false


func is_authentication_configured() -> bool:
	return false


func authenticate_device(_device_id: String) -> void:
	last_auth_attempted = true
	authentication_started.emit()
	# Intentionally does not create a Nakama client or open a socket.
	authentication_finished.emit(false, "authentication_not_configured")
