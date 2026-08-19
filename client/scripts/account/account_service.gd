extends Node

## Project-owned account boundary. Owns gateway HTTP, session tokens, refresh, and logout. Does not own character gameplay.

signal account_status_changed(status: String)
signal gateway_unavailable
signal verification_required(email: String)

const CLIENT_VERSION := "1.0.0"
const TERMS_VERSION := "1"
const PRIVACY_VERSION := "1"
const DEFAULT_GATEWAY_URL := "http://127.0.0.1:8787"
const LOCAL_MAILPIT_URL := "http://127.0.0.1:8025"
const REFRESH_MAX_ATTEMPTS := 3
const REFRESH_LEAD_SEC := 60

var backend: RefCounted
var auto_probe: bool = true
var gateway_reachable: bool = true
var gateway_url: String = DEFAULT_GATEWAY_URL
var access_token: String = ""
var refresh_token: String = ""
var user_id: String = ""
var username: String = ""
var account_status: String = ""
var pending_email: String = ""
var pending_reset_email: String = ""
var pending_reset_code: String = ""
var pending_email_change: String = ""
var pending_email_change_password: String = ""
var last_code: String = ""
var last_message: String = ""
var last_field_errors: Dictionary = {}
var credential_store: CredentialStore = CredentialStore.new()

var _http: HTTPRequest
var _http_busy: bool = false
var _refresh_in_progress: bool = false
var _refresh_gave_up: bool = false
var _refresh_timer: Timer


func _ready() -> void:
	_http = HTTPRequest.new()
	_http.timeout = 10.0
	add_child(_http)
	_refresh_timer = Timer.new()
	_refresh_timer.wait_time = 30.0
	_refresh_timer.one_shot = false
	_refresh_timer.timeout.connect(_on_refresh_timer)
	add_child(_refresh_timer)


func reset_for_tests() -> void:
	backend = null
	auto_probe = false
	gateway_reachable = true
	gateway_url = DEFAULT_GATEWAY_URL
	_clear_session()
	last_code = ""
	last_message = ""
	last_field_errors = {}
	pending_email = ""
	pending_reset_email = ""
	pending_reset_code = ""
	pending_email_change = ""
	pending_email_change_password = ""
	credential_store = CredentialStore.new()
	_http_busy = false
	_refresh_in_progress = false
	_refresh_gave_up = false
	if _refresh_timer != null:
		_refresh_timer.stop()


func stay_signed_in_available() -> bool:
	return CredentialStore.STAY_SIGNED_IN_ENABLED and credential_store != null and credential_store.is_available()


func uses_local_mail_capture() -> bool:
	var lowered := gateway_url.to_lower()
	return lowered.contains("127.0.0.1") or lowered.contains("localhost")


func local_mail_capture_copy() -> String:
	if uses_local_mail_capture():
		return "Local development captures mail in Mailpit at %s. It is not sent to Gmail or other inboxes. Open that page and paste the code here. Codes expire after a short time." % LOCAL_MAILPIT_URL
	return "Email can take a few minutes. Check junk folders. The code expires after a short time."


func probe_ready() -> bool:
	var result := await _request("GET", "/ready", {}, "")
	if not bool(result.get("ok", false)):
		gateway_reachable = false
		gateway_unavailable.emit()
		return false
	gateway_reachable = true
	return true


func register_account(
	email: String,
	password: String,
	confirm: String,
	accept_terms: bool,
	accept_privacy: bool
) -> Dictionary:
	_clear_last_error()
	if password != confirm:
		return _fail("password_mismatch", AccountErrors.message_for("password_mismatch"))
	if not accept_terms or not accept_privacy:
		var fields := {}
		if not accept_terms:
			fields["accepted_terms_version"] = "required"
		if not accept_privacy:
			fields["accepted_privacy_version"] = "required"
		last_field_errors = fields
		return _fail("terms_required", AccountErrors.message_for("terms_required"))
	var key := _idempotency_key()
	var body := {
		"email": email.strip_edges(),
		"password": password,
		"password_confirmation": confirm,
		"accepted_terms_version": TERMS_VERSION if accept_terms else "",
		"accepted_privacy_version": PRIVACY_VERSION if accept_privacy else "",
		"client_version": CLIENT_VERSION,
		"idempotency_key": key,
	}
	var result := await _request("POST", "/v1/auth/register", body, "", key)
	if bool(result.get("ok", false)):
		pending_email = email.strip_edges()
		account_status = "PENDING_VERIFICATION"
		account_status_changed.emit(account_status)
		return result
	if String(result.get("code", "")) == "AUTH_REGISTRATION_FAILED":
		pending_email = email.strip_edges()
	return result


func login(email: String, password: String) -> Dictionary:
	_clear_last_error()
	var body := {
		"email": email.strip_edges(),
		"password": password,
		"client_version": CLIENT_VERSION,
	}
	var result := await _request("POST", "/v1/auth/login", body, "")
	var code := String(result.get("code", ""))
	if code == "EMAIL_VERIFICATION_REQUIRED":
		pending_email = email.strip_edges()
		verification_required.emit(pending_email)
		return result
	if not bool(result.get("ok", false)):
		return result
	_apply_session(result)
	pending_email = email.strip_edges()
	account_status_changed.emit(account_status)
	_start_refresh_timer()
	return result


func verify_email(code: String) -> Dictionary:
	_clear_last_error()
	var body := {
		"email": pending_email,
		"code": code.strip_edges(),
		"client_version": CLIENT_VERSION,
	}
	return await _request("POST", "/v1/auth/verify/confirm", body, "")


func request_verification(email: String = "") -> Dictionary:
	_clear_last_error()
	var target := email.strip_edges()
	if target.is_empty():
		target = pending_email
	var body := {"email": target, "client_version": CLIENT_VERSION}
	return await _request("POST", "/v1/auth/verify/request", body, "")


func request_password_reset(email: String) -> Dictionary:
	_clear_last_error()
	pending_reset_email = email.strip_edges()
	var body := {"email": pending_reset_email, "client_version": CLIENT_VERSION}
	return await _request("POST", "/v1/auth/password/reset/request", body, "")


func confirm_password_reset(code: String, new_password: String, confirm: String) -> Dictionary:
	_clear_last_error()
	if new_password != confirm:
		return _fail("password_mismatch", AccountErrors.message_for("password_mismatch"))
	var key := _idempotency_key()
	var body := {
		"email": pending_reset_email,
		"reset_challenge": code.strip_edges(),
		"new_password": new_password,
		"new_password_confirmation": confirm,
		"client_version": CLIENT_VERSION,
		"idempotency_key": key,
	}
	var result := await _request("POST", "/v1/auth/password/reset/confirm", body, "", key)
	if bool(result.get("ok", false)):
		pending_reset_code = ""
		_clear_session()
		_stop_refresh_timer()
	return result


func change_password(current_password: String, new_password: String, confirm: String) -> Dictionary:
	_clear_last_error()
	if access_token.is_empty():
		return _fail("AUTH_FORBIDDEN", AccountErrors.message_for("AUTH_FORBIDDEN"))
	if new_password != confirm:
		return _fail("password_mismatch", AccountErrors.message_for("password_mismatch"))
	var key := _idempotency_key()
	var body := {
		"current_password": current_password,
		"new_password": new_password,
		"new_password_confirmation": confirm,
		"client_version": CLIENT_VERSION,
		"idempotency_key": key,
	}
	var result := await _request("POST", "/v1/account/password/change", body, access_token, key)
	if bool(result.get("ok", false)):
		_clear_session()
		_stop_refresh_timer()
	return result


func request_email_change(current_password: String, new_email: String) -> Dictionary:
	_clear_last_error()
	if access_token.is_empty():
		return _fail("AUTH_FORBIDDEN", AccountErrors.message_for("AUTH_FORBIDDEN"))
	var key := _idempotency_key()
	var body := {
		"current_password": current_password,
		"new_email": new_email.strip_edges(),
		"client_version": CLIENT_VERSION,
		"idempotency_key": key,
	}
	var result := await _request("POST", "/v1/account/email/change/request", body, access_token, key)
	if bool(result.get("ok", false)):
		pending_email_change = new_email.strip_edges()
		pending_email_change_password = current_password
	return result


func confirm_email_change(code: String) -> Dictionary:
	_clear_last_error()
	var key := _idempotency_key()
	var body := {
		"new_email": pending_email_change,
		"email_change_challenge": code.strip_edges(),
		"password": pending_email_change_password,
		"client_version": CLIENT_VERSION,
		"idempotency_key": key,
	}
	var result := await _request("POST", "/v1/account/email/change/confirm", body, "", key)
	if bool(result.get("ok", false)):
		pending_email = pending_email_change
		pending_email_change_password = ""
		_clear_session()
		_stop_refresh_timer()
	return result


func refresh_session() -> Dictionary:
	if _refresh_gave_up:
		return _fail("session_expired", AccountErrors.message_for("session_expired"))
	if _refresh_in_progress:
		return {"ok": false, "code": "session_expired", "message": AccountErrors.message_for("session_expired")}
	if refresh_token.is_empty():
		_refresh_gave_up = true
		return _fail("session_expired", AccountErrors.message_for("session_expired"))
	_refresh_in_progress = true
	var attempt := 0
	var last: Dictionary = {}
	while attempt < REFRESH_MAX_ATTEMPTS:
		last = await _request("POST", "/v1/auth/refresh", {
			"refresh_token": refresh_token,
			"client_version": CLIENT_VERSION,
		}, "")
		if bool(last.get("ok", false)):
			_apply_session(last)
			_refresh_in_progress = false
			_refresh_gave_up = false
			return last
		var code := String(last.get("code", ""))
		if code == "AUTH_UNAVAILABLE" or code == "network_unreachable":
			gateway_reachable = false
			gateway_unavailable.emit()
			await _refresh_backoff(attempt)
			attempt += 1
			continue
		_refresh_gave_up = true
		_refresh_in_progress = false
		_stop_refresh_timer()
		return last
	_refresh_gave_up = true
	_refresh_in_progress = false
	return last


func logout_current() -> Dictionary:
	var token := access_token
	var refresh := refresh_token
	var result := {"ok": true}
	var stored_id := user_id
	if not token.is_empty():
		result = await _request("POST", "/v1/auth/logout", {"refresh_token": refresh, "client_version": CLIENT_VERSION}, token)
	credential_store.clear(stored_id)
	_clear_session()
	_stop_refresh_timer()
	return result


func logout_all(password: String) -> Dictionary:
	if access_token.is_empty():
		return _fail("AUTH_FORBIDDEN", AccountErrors.message_for("AUTH_FORBIDDEN"))
	var result := await _request(
		"POST",
		"/v1/auth/logout-all",
		{"password": password, "client_version": CLIENT_VERSION},
		access_token
	)
	if not bool(result.get("ok", false)):
		return result
	_clear_session()
	credential_store.clear()
	_stop_refresh_timer()
	return result


func _apply_session(result: Dictionary) -> void:
	access_token = String(result.get("token", ""))
	refresh_token = String(result.get("refresh_token", ""))
	user_id = String(result.get("user_id", ""))
	username = String(result.get("username", ""))
	account_status = String(result.get("account_status", "ACTIVE"))
	_refresh_gave_up = false
	if stay_signed_in_available() and not refresh_token.is_empty():
		credential_store.save_refresh_token(user_id, refresh_token)


func _clear_session() -> void:
	access_token = ""
	refresh_token = ""
	user_id = ""
	username = ""
	account_status = ""


func _clear_last_error() -> void:
	last_code = ""
	last_message = ""
	last_field_errors = {}


func _fail(code: String, message: String) -> Dictionary:
	last_code = code
	last_message = message
	return {"ok": false, "code": code, "message": message, "field_errors": last_field_errors}


func _start_refresh_timer() -> void:
	if _refresh_timer == null:
		return
	_refresh_timer.start()


func _stop_refresh_timer() -> void:
	if _refresh_timer != null:
		_refresh_timer.stop()


func _on_refresh_timer() -> void:
	if access_token.is_empty() or refresh_token.is_empty() or _refresh_gave_up:
		return
	var exp := _token_exp_unix(access_token)
	if exp <= 0:
		return
	var now := int(Time.get_unix_time_from_system())
	if exp - now > REFRESH_LEAD_SEC:
		return
	refresh_session()


func _token_exp_unix(token: String) -> int:
	var parts := token.split(".")
	if parts.size() < 2:
		return 0
	var payload := parts[1]
	while payload.length() % 4 != 0:
		payload += "="
	var decoded := Marshalls.base64_to_utf8(payload.replace("-", "+").replace("_", "/"))
	if decoded.is_empty():
		return 0
	var parsed: Variant = JSON.parse_string(decoded)
	if typeof(parsed) != TYPE_DICTIONARY:
		return 0
	return int((parsed as Dictionary).get("exp", 0))


func _idempotency_key() -> String:
	return "%s-%s" % [str(Time.get_ticks_usec()), str(randi())]


func _refresh_backoff(attempt: int) -> void:
	var tree := get_tree()
	if tree == null:
		return
	var delay := (0.4 + randf() * 0.4) * pow(2.0, float(attempt))
	await tree.create_timer(delay).timeout


func _request(method: String, path: String, body: Dictionary, bearer: String, idempotency_key: String = "") -> Dictionary:
	if backend != null:
		if not backend.has_method("request"):
			return _fail("AUTH_UNAVAILABLE", AccountErrors.message_for("AUTH_UNAVAILABLE"))
		var fake: Dictionary = await backend.request(method, path, body, bearer)
		return _normalize_result(fake)
	if _http == null:
		return _fail("AUTH_UNAVAILABLE", AccountErrors.message_for("AUTH_UNAVAILABLE"))
	while _http_busy:
		await get_tree().process_frame
	_http_busy = true
	var headers := PackedStringArray(["Content-Type: application/json", "Accept: application/json"])
	if not bearer.is_empty():
		headers.append("Authorization: Bearer %s" % bearer)
	if not idempotency_key.is_empty():
		headers.append("Idempotency-Key: %s" % idempotency_key)
	var payload := ""
	if method != "GET":
		payload = JSON.stringify(body)
	var http_method := HTTPClient.METHOD_POST
	if method == "GET":
		http_method = HTTPClient.METHOD_GET
	var err := _http.request(gateway_url + path, headers, http_method, payload)
	if err != OK:
		_http_busy = false
		return _fail("AUTH_UNAVAILABLE", AccountErrors.message_for("AUTH_UNAVAILABLE"))
	var completed: Array = await _http.request_completed
	_http_busy = false
	if completed.size() < 4:
		return _fail("AUTH_UNAVAILABLE", AccountErrors.message_for("AUTH_UNAVAILABLE"))
	var result_code: int = int(completed[0])
	var status: int = int(completed[1])
	var raw: PackedByteArray = completed[3]
	if result_code != HTTPRequest.RESULT_SUCCESS:
		gateway_reachable = false
		return _fail("AUTH_UNAVAILABLE", AccountErrors.message_for("AUTH_UNAVAILABLE"))
	var text := raw.get_string_from_utf8()
	var parsed: Variant = JSON.parse_string(text)
	if typeof(parsed) != TYPE_DICTIONARY:
		if status >= 200 and status < 300:
			return {"ok": true}
		return _fail("AUTH_UNAVAILABLE", AccountErrors.message_for("AUTH_UNAVAILABLE"))
	var data: Dictionary = parsed
	data["http_status"] = status
	return _normalize_result(data)


func _normalize_result(data: Dictionary) -> Dictionary:
	if bool(data.get("ok", false)):
		last_code = ""
		last_message = ""
		last_field_errors = {}
		return data
	var code := String(data.get("code", "AUTH_UNAVAILABLE"))
	var fields: Dictionary = {}
	if typeof(data.get("field_errors", null)) == TYPE_DICTIONARY:
		fields = data["field_errors"]
	last_field_errors = fields
	last_code = code
	last_message = AccountErrors.message_for(code, String(data.get("message", "")))
	return {
		"ok": false,
		"code": code,
		"message": last_message,
		"field_errors": fields,
		"message_key": String(data.get("message_key", "")),
	}
