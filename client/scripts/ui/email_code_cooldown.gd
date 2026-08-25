class_name EmailCodeCooldown
extends Node

## Shared 30-second send/resend cooldown for email challenge codes. Presentation only;
## the gateway still enforces named request limits.

var busy: bool = false
var _buttons: Array[Button] = []
var _base_texts: PackedStringArray = PackedStringArray()
var _timer: Timer


func _ready() -> void:
	_timer = Timer.new()
	_timer.one_shot = false
	_timer.wait_time = 1.0
	_timer.timeout.connect(apply)
	add_child(_timer)
	_timer.start()
	apply()


func add_button(button: Button, base_text: String) -> void:
	if button == null:
		return
	_buttons.append(button)
	_base_texts.append(base_text)


func set_busy(value: bool) -> void:
	busy = value
	apply()


func is_blocking() -> bool:
	return busy or AccountService.email_code_cooldown_remaining() > 0


func resume_after_send(start_if_idle: bool) -> void:
	if start_if_idle and AccountService.email_code_cooldown_remaining() <= 0:
		AccountService.begin_email_code_cooldown()
	apply()


func apply() -> void:
	var left := AccountService.email_code_cooldown_remaining()
	for i in _buttons.size():
		var button := _buttons[i]
		if button == null:
			continue
		var base := _base_texts[i]
		if left > 0:
			button.disabled = true
			button.text = "%s (%ss)" % [base, str(left)]
		else:
			button.disabled = busy
			button.text = base
