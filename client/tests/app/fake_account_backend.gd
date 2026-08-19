class_name FakeAccountBackend
extends RefCounted

## Test double for AccountService gateway calls. Does not contact the network.

var ready_ok: bool = true
var register_ok: bool = true
var register_code: String = "AUTH_REGISTRATION_FAILED"
var login_ok: bool = true
var login_code: String = "AUTH_INVALID_CREDENTIALS"
var login_message: String = "Email or password is incorrect."
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
var revoked_refresh: Dictionary = {}


func request(method: String, path: String, body: Dictionary, bearer: String) -> Dictionary:
	last_method = method
	last_path = path
	last_bearer = bearer
	last_email = String(body.get("email", last_email))
	if path == "/ready":
		return {"ok": ready_ok, "nakama": ready_ok, "email": ready_ok}
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
	if path == "/v1/auth/password-reset/request":
		reset_calls += 1
		return {"ok": true}
	if path == "/v1/account/status":
		if bearer.is_empty():
			return {"ok": false, "code": "AUTH_FORBIDDEN"}
		return {"ok": true, "account_status": "ACTIVE", "verified": true, "user_id": user_id, "username": username}
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
		return {"ok": false, "code": login_code, "message": login_message}
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
