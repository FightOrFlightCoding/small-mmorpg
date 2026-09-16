class_name ReconnectPolicy
extends RefCounted

## Bounded exponential backoff for realtime reconnect. Delays are presentation-only.

const INITIAL_DELAY_SEC := 0.5
const MAX_DELAY_SEC := 8.0
const MAX_ATTEMPTS := 8

var initial_delay_sec: float = INITIAL_DELAY_SEC
var max_delay_sec: float = MAX_DELAY_SEC
var max_attempts: int = MAX_ATTEMPTS


func can_retry(attempt: int) -> bool:
	return attempt >= 0 and attempt < max_attempts


func delay_for_attempt(attempt: int) -> float:
	if attempt < 0:
		return 0.0
	var delay := initial_delay_sec * pow(2.0, float(attempt))
	if delay > max_delay_sec:
		return max_delay_sec
	if delay < 0.0:
		return 0.0
	return delay
