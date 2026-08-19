extends Node

## Headless five-identity certification driver. Debug builds with --cert-five only.


func _ready() -> void:
	if not OS.is_debug_build():
		_finish(false, "release_hooks_unavailable")
		return
	if not CertJourney.cmdline_enabled(OS.get_cmdline_user_args()):
		_finish(false, "missing_cert_flag")
		return
	if not ContentRegistry.load_bundle():
		_finish(false, "content_missing")
		return
	var result: Dictionary = await CertJourney.run(self)
	if bool(result.get("ok", false)):
		print("CERT_FIVE_OK")
		get_tree().quit(0)
		return
	_finish(false, String(result.get("reason", "failed")))


func _finish(ok: bool, reason: String) -> void:
	if ok:
		print("CERT_FIVE_OK")
		get_tree().quit(0)
		return
	var message := "CERT_FIVE_FAIL:%s" % reason
	push_error(message)
	print(message)
	get_tree().quit(1)
