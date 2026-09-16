extends Node

## Headless two-identity vertical-slice driver. Debug builds with --e2e-slice only.


func _ready() -> void:
	if not OS.is_debug_build():
		_finish(false, "release_hooks_unavailable")
		return
	if not SliceJourney.cmdline_enabled(OS.get_cmdline_user_args()):
		_finish(false, "missing_e2e_flag")
		return
	if not ContentRegistry.load_bundle():
		_finish(false, "content_missing")
		return
	var result: Dictionary = await SliceJourney.run(self)
	if bool(result.get("ok", false)):
		print("E2E_SLICE_OK")
		get_tree().quit(0)
		return
	_finish(false, String(result.get("reason", "failed")))


func _finish(ok: bool, reason: String) -> void:
	if ok:
		print("E2E_SLICE_OK")
		get_tree().quit(0)
		return
	var message := "E2E_SLICE_FAIL:%s" % reason
	push_error(message)
	print(message)
	get_tree().quit(1)
