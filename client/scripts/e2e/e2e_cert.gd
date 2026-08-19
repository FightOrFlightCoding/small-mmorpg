extends Node

## Headless five-identity certification driver. Debug builds with --cert-five / --cert-five-resume only.


func _ready() -> void:
	if not OS.is_debug_build():
		_finish(false, "release_hooks_unavailable")
		return
	var args := OS.get_cmdline_user_args()
	if not CertJourney.can_run(args):
		_finish(false, "missing_cert_flag")
		return
	if not ContentRegistry.load_bundle():
		_finish(false, "content_missing")
		return
	if CertJourney.cmdline_resume(args):
		var resumed: Dictionary = await CertJourney.resume(self)
		if bool(resumed.get("ok", false)):
			print("CERT_FIVE_RESUME_OK")
			get_tree().quit(0)
			return
		_finish(false, String(resumed.get("reason", "failed")))
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
