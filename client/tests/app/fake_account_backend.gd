class_name FakeAccountBackend
extends RefCounted

## Test double for AccountService gateway calls. Does not contact the network.

var ready_ok: bool = true
var ready_email_ok: bool = true
var register_ok: bool = true
var register_code: String = "AUTH_REGISTRATION_FAILED"
var login_ok: bool = true
var login_code: String = "AUTH_INVALID_CREDENTIALS"
var login_message: String = "Email or password is incorrect."
var login_retry_after: int = 0
var last_request_id: String = "req-test"
var verify_ok: bool = true
var verify_code: String = "AUTH_INVALID_CHALLENGE"
var refresh_ok: bool = true
var refresh_code: String = "AUTH_INVALID_CREDENTIALS"
var logout_ok: bool = true
var logout_all_ok: bool = true
var token: String = "gateway-token"
var refresh_token: String = "gateway-refresh"
var user_id: String = "user-alice"
var username: String = "ualice"
var registered: Dictionary = {}
var last_method: String = ""
var last_path: String = ""
var last_email: String = ""
var last_bearer: String = ""
var register_calls: int = 0
var login_calls: int = 0
var verify_calls: int = 0
var resend_calls: int = 0
var refresh_calls: int = 0
var logout_calls: int = 0
var logout_all_calls: int = 0
var reset_calls: int = 0
var reset_confirm_calls: int = 0
var password_change_calls: int = 0
var email_change_request_calls: int = 0
var email_change_confirm_calls: int = 0
var password_change_ok: bool = true
var email_change_ok: bool = true
var reset_confirm_ok: bool = true
var export_ok: bool = true
var delete_ok: bool = true
var delete_completed: bool = true
var delete_code: String = ""
var verified_email: String = "alice@example.com"
var created_at: int = 1700000000000
var registration_mode: String = "OPEN"
var support_recovery_id: String = "VIBE-ABCD-EF12-3456"
var revoked_refresh: Dictionary = {}


func request(method: String, path: String, body: Dictionary, bearer: String) -> Dictionary:
	last_method = method
	last_path = path
	last_bearer = bearer
	last_email = String(body.get("email", last_email))
	if path == "/ready":
		return {"ok": ready_ok and ready_email_ok, "nakama": ready_ok, "email": ready_email_ok}
	if path == "/v1/auth/register":
		return _register(body)
	if path == "/v1/auth/login":
		return _login(body)
	if path == "/v1/auth/verify/confirm" or path == "/v1/auth/verify-email":
		return _verify(body)
	if path == "/v1/auth/verify/request" or path == "/v1/auth/resend-verification":
		resend_calls += 1
		return {"ok": true}
	if path == "/v1/auth/refresh":
		return _refresh(body)
	if path == "/v1/auth/logout":
		logout_calls += 1
		revoked_refresh[String(body.get("refresh_token", ""))] = true
		return {"ok": logout_ok}
	if path == "/v1/auth/logout-all":
		logout_all_calls += 1
		if not logout_all_ok:
			return {"ok": false, "code": "AUTH_FORBIDDEN"}
		revoked_refresh[refresh_token] = true
		return {"ok": true, "logged_out_all": true}
	if path == "/v1/auth/password-reset/request" or path == "/v1/auth/password/reset/request":
		reset_calls += 1
		return {"ok": true, "message": "If an account exists for that email, password-reset instructions have been sent."}
	if path == "/v1/auth/password-reset/confirm" or path == "/v1/auth/password/reset/confirm":
		reset_confirm_calls += 1
		if not reset_confirm_ok:
			return {"ok": false, "code": "AUTH_INVALID_CHALLENGE"}
		token = ""
		refresh_token = ""
		return {"ok": true, "require_login": true}
	if path == "/v1/account/password/change":
		password_change_calls += 1
		if bearer.is_empty():
			return {"ok": false, "code": "AUTH_FORBIDDEN"}
		if String(body.get("current_password", "")) == "wrong-password-15x":
			return {"ok": false, "code": "AUTH_INVALID_CREDENTIALS"}
		if not password_change_ok:
			return {"ok": false, "code": "AUTH_PASSWORD_REUSE"}
		revoked_refresh[refresh_token] = true
		return {"ok": true, "require_login": true}
	if path == "/v1/account/email/change/request" or path == "/v1/auth/email-change/request":
		email_change_request_calls += 1
		if bearer.is_empty():
			return {"ok": false, "code": "AUTH_FORBIDDEN"}
		if not email_change_ok:
			return {"ok": false, "code": "AUTH_EMAIL_TAKEN"}
		return {"ok": true}
	if path == "/v1/account/email/change/confirm" or path == "/v1/auth/email-change/confirm":
		email_change_confirm_calls += 1
		if not email_change_ok:
			return {"ok": false, "code": "AUTH_INVALID_CHALLENGE"}
		return {"ok": true, "require_login": true}
	if path == "/v1/account/status":
		if bearer.is_empty():
			return {"ok": false, "code": "AUTH_FORBIDDEN"}
		return {
			"ok": true,
			"account_status": "ACTIVE",
			"verified": true,
			"verified_email": verified_email,
			"created_at": created_at,
			"registration_mode": registration_mode,
			"support_recovery_id": support_recovery_id,
			"user_id": user_id,
			"username": username,
		}
	if path == "/v1/account/export/request":
		if bearer.is_empty():
			return {"ok": false, "code": "AUTH_FORBIDDEN"}
		if not export_ok:
			return {"ok": false, "code": "AUTH_UNAVAILABLE"}
		return {"ok": true, "export_token": "export-token", "expires_at": created_at + 300000}
	if path.begins_with("/v1/account/export/download"):
		if bearer.is_empty():
			return {"ok": false, "code": "AUTH_FORBIDDEN"}
		if path.find("export-token") < 0:
			return {"ok": false, "code": "AUTH_EXPORT_EXPIRED"}
		return {"ok": true, "export": {"schemaVersion": 1, "gold": 0, "accountProfile": {"status": "ACTIVE"}}}
	if path == "/v1/account/delete/request":
		if bearer.is_empty():
			return {"ok": false, "code": "AUTH_FORBIDDEN"}
		if not delete_ok:
			return {"ok": false, "code": delete_code if not delete_code.is_empty() else "AUTH_ACCOUNT_BUSY"}
		return {"ok": true, "confirmation_required": true}
	if path == "/v1/account/delete/confirm":
		if bearer.is_empty():
			return {"ok": false, "code": "AUTH_FORBIDDEN"}
		if String(body.get("phrase", "")) != "DELETE ACCOUNT":
			return {"ok": false, "code": "AUTH_DELETE_PHRASE"}
		if not delete_ok:
			return {"ok": false, "code": delete_code if not delete_code.is_empty() else "AUTH_INVALID_CHALLENGE"}
		return {"ok": true, "completed": delete_completed, "deletion_job_id": "job-1", "status_token": "status-1", "phase": "complete" if delete_completed else "freeze"}
	if path.begins_with("/v1/account/delete/status"):
		return {"ok": true, "completed": delete_completed, "found": true, "phase": "complete" if delete_completed else "freeze", "deletion_job_id": "job-1"}
	return {"ok": false, "code": "AUTH_UNAVAILABLE"}


func _register(body: Dictionary) -> Dictionary:
	register_calls += 1
	var email := String(body.get("email", "")).strip_edges().to_lower()
	if registered.has(email):
		return {
			"ok": false,
			"code": "AUTH_REGISTRATION_FAILED",
			"message": AccountErrors.message_for("AUTH_REGISTRATION_FAILED"),
		}
	if not register_ok:
		return {"ok": false, "code": register_code, "field_errors": {}}
	registered[email] = {"verified": false}
	return {"ok": true, "verification_required": true}


func _login(body: Dictionary) -> Dictionary:
	login_calls += 1
	var email := String(body.get("email", "")).strip_edges().to_lower()
	if not login_ok:
		return {
			"ok": false,
			"code": login_code,
			"message": login_message,
			"request_id": last_request_id,
			"retry_after_seconds": login_retry_after,
		}
	var row: Variant = registered.get(email, null)
	if typeof(row) == TYPE_DICTIONARY and not bool((row as Dictionary).get("verified", true)):
		return {"ok": false, "code": "EMAIL_VERIFICATION_REQUIRED"}
	return {
		"ok": true,
		"user_id": user_id,
		"username": username,
		"token": token,
		"refresh_token": refresh_token,
		"account_status": "ACTIVE",
		"verified": true,
	}


func _verify(body: Dictionary) -> Dictionary:
	verify_calls += 1
	if not verify_ok:
		return {"ok": false, "code": verify_code}
	var email := String(body.get("email", "")).strip_edges().to_lower()
	if registered.has(email):
		registered[email] = {"verified": true}
	return {"ok": true, "verified": true}


func _refresh(body: Dictionary) -> Dictionary:
	refresh_calls += 1
	var supplied := String(body.get("refresh_token", ""))
	if revoked_refresh.get(supplied, false) == true:
		return {"ok": false, "code": "AUTH_INVALID_CREDENTIALS"}
	if not refresh_ok:
		return {"ok": false, "code": refresh_code}
	refresh_token = "gateway-refresh-%s" % str(refresh_calls)
	token = "gateway-token-%s" % str(refresh_calls)
	return {
		"ok": true,
		"user_id": user_id,
		"username": username,
		"token": token,
		"refresh_token": refresh_token,
		"account_status": "ACTIVE",
	}
