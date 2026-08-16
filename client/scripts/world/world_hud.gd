class_name WorldHud
extends CanvasLayer

signal resync_pressed
signal logout_pressed

@onready var _status: Label = $Root/Margin/VBox/Status
@onready var _entities: Label = $Root/Margin/VBox/Entities
@onready var _health: Label = $Root/Margin/VBox/Health
@onready var _resync: Button = $Root/Margin/VBox/Buttons/ResyncButton
@onready var _logout: Button = $Root/Margin/VBox/Buttons/LogoutButton
@onready var _journal_body: Label = $Root/Journal/Margin/VBox/Body
@onready var _death: Label = $Root/Death


func _ready() -> void:
	_resync.pressed.connect(func() -> void: resync_pressed.emit())
	_logout.pressed.connect(func() -> void: logout_pressed.emit())
	refresh_journal(QuestService.journal_view())


func refresh(state: Dictionary, names: PackedStringArray, snapshot_stale: bool = false) -> void:
	if state.is_empty():
		_status.text = "Waiting for authoritative zone state."
		_entities.text = ""
		if _health != null:
			_health.text = ""
		if _death != null:
			_death.visible = false
		refresh_journal(QuestService.journal_view())
		return
	if snapshot_stale:
		_status.text = "Connection degraded. Remote movement is frozen."
	else:
		_status.text = "In %s as %s (you). Tick %s. Ack seq %s." % [
			String(state.get("zone_id", "zone.starter")),
			_local_name(state),
			str(state.get("tick", 0)),
			str(state.get("ack_seq", 0)),
		]
	_entities.text = "Present: %s" % ", ".join(names)
	_refresh_health(state)
	refresh_journal(QuestService.journal_view())


func refresh_journal(view: Dictionary) -> void:
	if _journal_body == null:
		return
	if bool(view.get("empty", true)):
		_journal_body.text = "No active quest."
		return
	_journal_body.text = "\n".join(PackedStringArray([
		String(view.get("title", "")),
		"State: %s" % String(view.get("state", "")),
		"Objective: %s" % String(view.get("objective", "")),
		"Count: %s / %s" % [str(int(view.get("current", 0))), str(int(view.get("required", 0)))],
		"Turn-in: %s" % String(view.get("turn_in_npc", "")),
	]))


func _refresh_health(state: Dictionary) -> void:
	var self_id := String(state.get("self_id", ""))
	var player_hp := "You: --"
	var local_dead := false
	for entry in state.get("players", []):
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		if String(entry.get("userId", "")) != self_id:
			continue
		var health := int(entry.get("health", 0))
		var max_health := int(entry.get("maxHealth", health))
		player_hp = "You: %s / %s" % [str(health), str(max_health)]
		local_dead = health <= 0
		break
	var slime_hp := "Slime: --"
	for entry in state.get("enemies", []):
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		var enemy: Dictionary = entry
		if String(enemy.get("enemyId", "")).find("slime") == -1 and String(enemy.get("id", "")).find("slime") == -1:
			continue
		slime_hp = "Slime: %s / %s" % [str(int(enemy.get("health", 0))), str(int(enemy.get("maxHealth", 0)))]
		if enemy.has("state") and String(enemy["state"]) != "":
			slime_hp += " (%s)" % String(enemy["state"])
		break
	if _health != null:
		_health.text = "%s    %s    Attack: Space" % [player_hp, slime_hp]
	if _death != null:
		_death.visible = local_dead
		if local_dead:
			_death.text = "Defeated. Respawning..."


func _local_name(state: Dictionary) -> String:
	var self_id := String(state.get("self_id", ""))
	for entry in state.get("players", []):
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		if String(entry.get("userId", "")) != self_id:
			continue
		var named := String(entry.get("name", ""))
		if not named.is_empty():
			return named
	if not AppState.character_view.is_empty():
		var from_character := String(AppState.character_view.get("name", ""))
		if not from_character.is_empty():
			return from_character
	return self_id if not self_id.is_empty() else "unknown"
