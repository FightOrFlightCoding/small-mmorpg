extends Control

## Shared shell page wiring for loading and error overlays. Does not store game state.

@onready var _error_dialog: CanvasLayer = $ErrorDialog
@onready var _loading_overlay: CanvasLayer = $LoadingOverlay


func _ready() -> void:
	ShellTheme.apply(self)
	_ensure_toast_host()
	WindowManager.connect_once(AppState.recoverable_error, _on_recoverable_error)
	WindowManager.connect_once(AppState.fatal_compatibility_error, _on_fatal_error)
	WindowManager.connect_once(AppState.loading_started, _on_loading_started)
	WindowManager.connect_once(AppState.loading_completed, _on_loading_completed)
	WindowManager.connect_once(AppState.reconnecting_changed, _on_reconnecting_changed)
	if _loading_overlay != null and _loading_overlay.has_signal("cancel_pressed"):
		WindowManager.connect_once(_loading_overlay.cancel_pressed, _on_reconnect_cancel)
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
	var copy := AccountErrors.display_for(code, AccountService.last_request_id)
	if AccountErrors.is_known(code):
		copy = AccountErrors.message_for(code)
	if _error_dialog != null and _error_dialog.has_method("show_error"):
		_error_dialog.call("show_error", "Something went wrong", copy, false)


func _on_fatal_error(code: String, message: String) -> void:
	if _loading_overlay != null and _loading_overlay.has_method("hide_loading"):
		_loading_overlay.call("hide_loading")
	var copy := message
	if AccountErrors.is_known(code):
		copy = AccountErrors.message_for(code)
	elif AccountErrors.looks_like_internal_trace(message):
		copy = AccountErrors.display_for(code, AccountService.last_request_id)
	if _error_dialog != null and _error_dialog.has_method("show_error"):
		_error_dialog.call("show_error", "Cannot start", copy, true)


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


func _unhandled_input(event: InputEvent) -> void:
	if not event.is_action_pressed("ui_cancel"):
		return
	if _error_dialog != null and _error_dialog.visible:
		if _error_dialog.has_method("hide_error"):
			_error_dialog.call("hide_error")
		get_viewport().set_input_as_handled()
		return
	if SceneRouter.go_back():
		get_viewport().set_input_as_handled()


func _ensure_toast_host() -> void:
	if get_node_or_null("ToastHost") != null:
		return
	var host := UxToastHost.new()
	host.name = "ToastHost"
	add_child(host)


func _wants_shell_self_test() -> bool:
	return OS.get_cmdline_user_args().has("--quit-after-login")
