extends Node

## Orchestrates shell flow. Not a gameplay authority and not a Nakama session owner.

func start_boot(bundle_path: String = ContentRegistry.DEFAULT_BUNDLE_PATH) -> bool:
	AppState.notify_loading_started("boot")
	var loaded := ContentRegistry.load_bundle(bundle_path)
	if not loaded:
		var code := ContentRegistry.catalog.error_code
		var message := ContentRegistry.catalog.error_message
		if code.is_empty():
			code = "content_missing"
		if message.is_empty():
			message = "The content bundle could not be loaded."
		AppState.report_fatal_compatibility(code, message)
		AppState.notify_loading_completed("boot")
		return false

	var routed := SceneRouter.transition_to(SceneRouter.SCENE_LOGIN)
	AppState.notify_loading_completed("boot")
	return routed


func request_authenticate(device_id: String = "local-device") -> void:
	if AppState.has_fatal_error:
		return
	NetworkService.authenticate_device(device_id)
	AppState.report_recoverable(
		"authentication_not_configured",
		"Sign-in is not available in this build. The client does not connect to Nakama yet."
	)
