class_name WorldHud
extends CanvasLayer

signal resync_pressed
signal logout_pressed

@onready var _status: Label = $Root/Margin/VBox/Status
@onready var _entities: Label = $Root/Margin/VBox/Entities
@onready var _resync: Button = $Root/Margin/VBox/Buttons/ResyncButton
@onready var _logout: Button = $Root/Margin/VBox/Buttons/LogoutButton


func _ready() -> void:
	_resync.pressed.connect(func() -> void: resync_pressed.emit())
	_logout.pressed.connect(func() -> void: logout_pressed.emit())


func refresh(state: Dictionary, names: PackedStringArray, snapshot_stale: bool = false) -> void:
	if state.is_empty():
		_status.text = "Waiting for authoritative zone state."
		_entities.text = ""
		return
	if snapshot_stale:
		_status.text = "Connection degraded. Remote movement is frozen."
	else:
		_status.text = "In %s as %s. Tick %s. Ack seq %s." % [
			String(state.get("zone_id", "zone.starter")),
			String(state.get("self_id", "")),
			str(state.get("tick", 0)),
			str(state.get("ack_seq", 0)),
		]
	_entities.text = "Present: %s" % ", ".join(names)
