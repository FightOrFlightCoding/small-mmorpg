class_name NetDebugOverlay
extends CanvasLayer

## Development-only net stats. Hidden in release builds.

var debug_build: bool = true
var fps: int = 0
var frame_ms: float = 0.0
var ping_ms: int = 0
var server_tick: int = 0
var last_sent_seq: int = 0
var last_ack_seq: int = 0
var prediction_error: float = 0.0
var snapshot_depth: int = 0
# Literal default so this script parses before MatchProtocol is registered (editor/GdUnit boot).
var protocol_version: int = 1
var content_hash_prefix: String = ""

@onready var _label: Label = $Root/Panel/Label


func _ready() -> void:
	debug_build = OS.is_debug_build()
	apply_visibility()
	refresh()


func apply_visibility() -> void:
	visible = debug_build


func set_debug_build(enabled: bool) -> void:
	debug_build = enabled
	apply_visibility()


func refresh() -> void:
	if _label == null:
		return
	_label.text = "\n".join(PackedStringArray([
		"fps %s (%.1fms)" % [str(fps), frame_ms],
		"ping %sms" % str(ping_ms),
		"tick %s" % str(server_tick),
		"sent seq %s" % str(last_sent_seq),
		"ack seq %s" % str(last_ack_seq),
		"pred err %.1f" % prediction_error,
		"snap buf %s" % str(snapshot_depth),
		"proto v%s" % str(protocol_version),
		"hash %s" % content_hash_prefix,
	]))
