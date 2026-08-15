class_name EntityRegistry
extends Node2D

## Creates, updates, and removes zone entities from authoritative state.

const KIND_PLAYER := "player"
const KIND_NPC := "npc"
const KIND_ENEMY := "enemy"
const KIND_LOOT := "loot"

const SCENE_PATHS := {
	KIND_PLAYER: "res://scenes/world/player_avatar.tscn",
	KIND_NPC: "res://scenes/world/npc_avatar.tscn",
	KIND_ENEMY: "res://scenes/world/enemy_avatar.tscn",
	KIND_LOOT: "res://scenes/world/loot_avatar.tscn",
}

var follow_camera: Camera2D
var local_server_id: String = ""
var rejected_kinds: PackedStringArray = PackedStringArray()

var _nodes: Dictionary = {}


func entity_count() -> int:
	return _nodes.size()


func has_entity(key: String) -> bool:
	return _nodes.has(key)


func get_entity(key: String) -> Node2D:
	if not _nodes.has(key):
		return null
	return _nodes[key]


func summaries() -> PackedStringArray:
	var names: PackedStringArray = PackedStringArray()
	var keys: Array = _nodes.keys()
	keys.sort()
	for key in keys:
		var node: Node = _nodes[key]
		if node is WorldAvatar:
			names.append((node as WorldAvatar).display_name)
		else:
			names.append(String(key))
	return names


func apply_full_state(state: Dictionary) -> void:
	rejected_kinds.clear()
	local_server_id = String(state.get("self_id", ""))
	var keep: Dictionary = {}
	_apply_kind(KIND_PLAYER, state.get("players", []), keep, false)
	_apply_kind(KIND_NPC, state.get("npcs", []), keep, false)
	_apply_kind(KIND_ENEMY, state.get("enemies", []), keep, false)
	_apply_kind(KIND_LOOT, state.get("loot", []), keep, false)
	for extra_key in state.keys():
		if extra_key in ["players", "npcs", "enemies", "loot", "self_id", "selfId", "tick", "zone_id", "zoneId", "protocol_version", "protocolVersion", "content_hash", "contentHash", "ack_seq"]:
			continue
		if typeof(state[extra_key]) == TYPE_ARRAY and extra_key.ends_with("s"):
			var kind_guess := String(extra_key)
			if kind_guess.ends_with("s"):
				kind_guess = kind_guess.substr(0, kind_guess.length() - 1)
			if kind_guess not in [KIND_PLAYER, KIND_NPC, KIND_ENEMY, KIND_LOOT]:
				_reject_kind(kind_guess)
	_prune(keep)
	_attach_camera()


func apply_snapshot(state: Dictionary, interp_duration: float = 0.1) -> void:
	if not String(state.get("self_id", "")).is_empty():
		local_server_id = String(state.get("self_id", ""))
	var keep: Dictionary = {}
	_apply_kind(KIND_PLAYER, state.get("players", []), keep, true, interp_duration)
	var stale: Array = []
	for key in _nodes.keys():
		if String(key).begins_with("player:") and not keep.has(key):
			stale.append(key)
	for key in stale:
		var node: Node = _nodes[key]
		_nodes.erase(key)
		if is_instance_valid(node):
			node.queue_free()
	_attach_camera()


func advance_interpolation(delta: float) -> void:
	for key in _nodes.keys():
		var node: Node = _nodes[key]
		if node is WorldAvatar:
			(node as WorldAvatar).advance_interpolation(delta)


func apply_remote_poses(poses: Dictionary) -> void:
	for id in poses.keys():
		if String(id) == local_server_id:
			continue
		var node: Node2D = get_entity("%s:%s" % [KIND_PLAYER, String(id)])
		if node != null:
			node.position = poses[id]


func pose_local(pos: Vector2) -> void:
	var node: Node2D = get_entity("%s:%s" % [KIND_PLAYER, local_server_id])
	if node is WorldAvatar:
		(node as WorldAvatar).set_server_position(pos.x, pos.y)
	elif node != null:
		node.position = pos


func apply_unknown_kind(kind: String, _records: Array = []) -> void:
	_reject_kind(kind)


func _reject_kind(kind: String) -> void:
	if kind.is_empty():
		return
	if rejected_kinds.has(kind):
		return
	rejected_kinds.append(kind)


func _apply_kind(kind: String, records: Variant, keep: Dictionary, interpolate_remotes: bool = false, interp_duration: float = 0.1) -> void:
	if kind not in SCENE_PATHS:
		_reject_kind(kind)
		return
	if typeof(records) != TYPE_ARRAY:
		return
	for entry in records:
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		var record: Dictionary = entry
		var server_id := _id_for(kind, record)
		if server_id.is_empty():
			continue
		var key := "%s:%s" % [kind, server_id]
		keep[key] = true
		var pose := _pose(record)
		var node: Node2D = _nodes.get(key)
		var is_local := kind == KIND_PLAYER and server_id == local_server_id
		if node == null:
			node = _spawn(kind, server_id, record)
			if node == null:
				continue
			_nodes[key] = node
			add_child(node)
			node.position = pose
		elif node is WorldAvatar:
			(node as WorldAvatar).configure(kind, server_id, _name_for(kind, record), _visual_for(kind, record), is_local)
			if interpolate_remotes and kind == KIND_PLAYER:
				pass
			else:
				(node as WorldAvatar).set_server_position(pose.x, pose.y)
		else:
			node.position = pose


func _spawn(kind: String, server_id: String, record: Dictionary) -> Node2D:
	var packed: PackedScene = load(String(SCENE_PATHS[kind]))
	var node: Node2D
	if packed == null:
		node = Node2D.new()
		var label := Label.new()
		label.text = _name_for(kind, record)
		node.add_child(label)
	else:
		node = packed.instantiate() as Node2D
	if node is WorldAvatar:
		(node as WorldAvatar).configure(
			kind,
			server_id,
			_name_for(kind, record),
			_visual_for(kind, record),
			kind == KIND_PLAYER and server_id == local_server_id
		)
	return node


func _id_for(kind: String, record: Dictionary) -> String:
	if kind == KIND_PLAYER:
		return String(record.get("userId", record.get("user_id", "")))
	if kind == KIND_NPC:
		var npc := String(record.get("id", ""))
		if npc.is_empty():
			npc = String(record.get("npcId", ""))
		return npc
	if kind == KIND_ENEMY:
		var enemy := String(record.get("id", ""))
		if enemy.is_empty():
			enemy = String(record.get("enemyId", ""))
		return enemy
	return String(record.get("id", ""))


func _name_for(kind: String, record: Dictionary) -> String:
	var named := String(record.get("name", ""))
	if not named.is_empty():
		return named
	if kind == KIND_NPC:
		var npc_id := String(record.get("npcId", record.get("id", "")))
		var npc: Dictionary = ContentRegistry.get_by_id(npc_id)
		return String(npc.get("displayName", npc_id))
	if kind == KIND_ENEMY:
		var enemy_id := String(record.get("enemyId", ""))
		if enemy_id.is_empty():
			enemy_id = String(record.get("id", "")).split(":")[0]
		var enemy: Dictionary = ContentRegistry.get_by_id(enemy_id)
		return String(enemy.get("displayName", enemy_id))
	if kind == KIND_LOOT:
		var item_id := String(record.get("itemId", ""))
		var item: Dictionary = ContentRegistry.get_by_id(item_id)
		return String(item.get("displayName", item_id))
	return _id_for(kind, record)


func _visual_for(kind: String, record: Dictionary) -> Dictionary:
	var content_id := ""
	if kind == KIND_PLAYER:
		content_id = "player.base"
	elif kind == KIND_NPC:
		content_id = String(record.get("npcId", record.get("id", "")))
	elif kind == KIND_ENEMY:
		content_id = String(record.get("enemyId", ""))
		if content_id.is_empty():
			content_id = String(record.get("id", "")).split(":")[0]
	elif kind == KIND_LOOT:
		content_id = String(record.get("itemId", ""))
	var visual_id := ContentRegistry.visual_id_for_content(content_id)
	return ContentRegistry.resolve_visual(visual_id)


func _pose(record: Dictionary) -> Vector2:
	return Vector2(float(record.get("x", 0.0)), float(record.get("y", 0.0)))


func _prune(keep: Dictionary) -> void:
	var stale: Array = []
	for key in _nodes.keys():
		if not keep.has(key):
			stale.append(key)
	for key in stale:
		var node: Node = _nodes[key]
		_nodes.erase(key)
		if is_instance_valid(node):
			node.queue_free()


func _attach_camera() -> void:
	if follow_camera == null:
		return
	var local_key := "%s:%s" % [KIND_PLAYER, local_server_id]
	var avatar: Node2D = get_entity(local_key)
	if avatar == null:
		if follow_camera.get_parent() != self:
			follow_camera.reparent(self)
		return
	if follow_camera.get_parent() != avatar:
		follow_camera.reparent(avatar)
		follow_camera.position = Vector2.ZERO
	follow_camera.make_current()
