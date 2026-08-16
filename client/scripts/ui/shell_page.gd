extends Control

## Shared shell page wiring for loading and error overlays. Does not store game state.

@onready var _error_dialog: CanvasLayer = $ErrorDialog
@onready var _loading_overlay: CanvasLayer = $LoadingOverlay


func _ready() -> void:
	if not AppState.recoverable_error.is_connected(_on_recoverable_error):
		AppState.recoverable_error.connect(_on_recoverable_error)
	if not AppState.fatal_compatibility_error.is_connected(_on_fatal_error):
		AppState.fatal_compatibility_error.connect(_on_fatal_error)
	if not AppState.loading_started.is_connected(_on_loading_started):
		AppState.loading_started.connect(_on_loading_started)
	if not AppState.loading_completed.is_connected(_on_loading_completed):
		AppState.loading_completed.connect(_on_loading_completed)
	if not AppState.reconnecting_changed.is_connected(_on_reconnecting_changed):
		AppState.reconnecting_changed.connect(_on_reconnecting_changed)
	if _loading_overlay != null and _loading_overlay.has_signal("cancel_pressed"):
		if not _loading_overlay.cancel_pressed.is_connected(_on_reconnect_cancel):
			_loading_overlay.cancel_pressed.connect(_on_reconnect_cancel)
	if AppState.has_fatal_error:
		_on_fatal_error(AppState.last_error_code, AppState.last_error_message)
	elif AppState.is_reconnecting:
		_show_reconnect_overlay()


func _exit_tree() -> void:
	if AppState.recoverable_error.is_connected(_on_recoverable_error):
		AppState.recoverable_error.disconnect(_on_recoverable_error)
	if AppState.fatal_compatibility_error.is_connected(_on_fatal_error):
		AppState.fatal_compatibility_error.disconnect(_on_fatal_error)
	if AppState.loading_started.is_connected(_on_loading_started):
		AppState.loading_started.disconnect(_on_loading_started)
	if AppState.loading_completed.is_connected(_on_loading_completed):
		AppState.loading_completed.disconnect(_on_loading_completed)
	if AppState.reconnecting_changed.is_connected(_on_reconnecting_changed):
		AppState.reconnecting_changed.disconnect(_on_reconnecting_changed)


func _on_recoverable_error(code: String, message: String) -> void:
	if _error_dialog != null and _error_dialog.has_method("show_error"):
		_error_dialog.call("show_error", "Something went wrong", "%s\n%s" % [code, message], false)


func _on_fatal_error(code: String, message: String) -> void:
	if _loading_overlay != null and _loading_overlay.has_method("hide_loading"):
		_loading_overlay.call("hide_loading")
	if _error_dialog != null and _error_dialog.has_method("show_error"):
		_error_dialog.call("show_error", "Cannot start", "%s\n%s" % [code, message], true)


func _on_reconnect_cancel() -> void:
	GameService.cancel_reconnect()


func _on_reconnecting_changed() -> void:
	if AppState.is_reconnecting:
		_show_reconnect_overlay()
	elif not AppState.is_loading:
		_hide_loading_overlay()


func _on_loading_started(reason: String) -> void:
	if AppState.is_reconnecting:
		_show_reconnect_overlay()
		return
	if _loading_overlay != null and _loading_overlay.has_method("show_loading"):
		_loading_overlay.call("show_loading", reason)


func _on_loading_completed(_reason: String) -> void:
	if AppState.has_fatal_error:
		return
	if AppState.is_reconnecting:
		_show_reconnect_overlay()
		return
	_hide_loading_overlay()


func _show_reconnect_overlay() -> void:
	if _loading_overlay != null and _loading_overlay.has_method("show_loading"):
		_loading_overlay.call("show_loading", "reconnect")


func _hide_loading_overlay() -> void:
	if _loading_overlay != null and _loading_overlay.has_method("hide_loading"):
		_loading_overlay.call("hide_loading")


func _wants_shell_self_test() -> bool:
	return OS.get_cmdline_user_args().has("--quit-after-login")
