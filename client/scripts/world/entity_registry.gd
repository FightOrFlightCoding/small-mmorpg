class_name EntityRegistry
extends Node2D

## Creates, updates, and removes zone entities from authoritative state.

const KIND_PLAYER := "player"
const KIND_NPC := "npc"
const KIND_ENEMY := "enemy"
const KIND_LOOT := "loot"
const KIND_CORPSE := "corpse"
const KIND_GROUND := "ground"

const SCENE_PATHS := {
	KIND_PLAYER: "res://scenes/world/player_avatar.tscn",
	KIND_NPC: "res://scenes/world/npc_avatar.tscn",
	KIND_ENEMY: "res://scenes/world/enemy_avatar.tscn",
	KIND_LOOT: "res://scenes/world/loot_avatar.tscn",
	KIND_CORPSE: "res://scenes/world/corpse_avatar.tscn",
	KIND_GROUND: "res://scenes/world/ground_item_avatar.tscn",
}

var follow_camera: Camera2D
var local_server_id: String = ""
var rejected_kinds: PackedStringArray = PackedStringArray()
var last_server_tick: float = 0.0

var _nodes: Dictionary = {}


func entity_count() -> int:
	return _nodes.size()


func has_entity(key: String) -> bool:
	return _nodes.has(key)


func get_entity(key: String) -> Node2D:
	if not _nodes.has(key):
		return null
	return _nodes[key]


func npc_id_at_world_point(world_pos: Vector2) -> String:
	var best_id := ""
	var best_d := INF
	for key in _nodes.keys():
		var node: Node = _nodes[key]
		if not (node is NpcAvatar):
			continue
		var avatar := node as NpcAvatar
		if not avatar.contains_world_point(world_pos):
			continue
		var distance := world_pos.distance_to(avatar.global_position)
		if distance <= best_d:
			best_d = distance
			best_id = avatar.server_id
	return best_id


func corpse_id_at_world_point(world_pos: Vector2) -> String:
	var best_id := ""
	var best_d := INF
	for key in _nodes.keys():
		var node: Node = _nodes[key]
		if not (node is CorpseAvatar):
			continue
		var avatar := node as CorpseAvatar
		if not avatar.contains_world_point(world_pos):
			continue
		var distance := world_pos.distance_to(avatar.global_position)
		if distance <= best_d:
			best_d = distance
			best_id = avatar.server_id
	return best_id


func ground_entity_id_at_world_point(world_pos: Vector2) -> String:
	var best_id := ""
	var best_d := INF
	for key in _nodes.keys():
		var node: Node = _nodes[key]
		if not (node is GroundItemAvatar):
			continue
		var avatar := node as GroundItemAvatar
		if not avatar.contains_world_point(world_pos):
			continue
		var distance := world_pos.distance_to(avatar.global_position)
		if distance <= best_d:
			best_d = distance
			best_id = avatar.server_id
	return best_id


func apply_quest_markers(markers: Array) -> void:
	var by_id: Dictionary = {}
	for entry in markers:
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		var npc_id := String(entry.get("npcId", ""))
		if npc_id.is_empty():
			continue
		by_id[npc_id] = String(entry.get("marker", ""))
	for key in _nodes.keys():
		var node: Node = _nodes[key]
		if not (node is NpcAvatar):
			continue
		var avatar := node as NpcAvatar
		avatar.set_quest_marker(String(by_id.get(avatar.server_id, "")))


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
	last_server_tick = float(state.get("tick", 0))
	var keep: Dictionary = {}
	_apply_kind(KIND_PLAYER, state.get("players", []), keep, false)
	_apply_kind(KIND_NPC, state.get("npcs", []), keep, false)
	_apply_kind(KIND_ENEMY, state.get("enemies", []), keep, false)
	_apply_kind(KIND_LOOT, state.get("loot", []), keep, false)
	_apply_kind(KIND_CORPSE, state.get("corpses", []), keep, false)
	_apply_kind(KIND_GROUND, state.get("groundItems", []), keep, false)
	for extra_key in state.keys():
		if extra_key in ["players", "npcs", "enemies", "loot", "corpses", "groundItems", "quests", "npc_quest_markers", "npcQuestMarkers", "inventory", "equipment", "derived", "wallet", "progression", "abilities", "party", "instance", "self_id", "selfId", "tick", "zone_id", "zoneId", "protocol_version", "protocolVersion", "content_hash", "contentHash", "ack_seq"]:
			continue
		if typeof(state[extra_key]) == TYPE_ARRAY and extra_key.ends_with("s"):
			var kind_guess := String(extra_key)
			if kind_guess.ends_with("s"):
				kind_guess = kind_guess.substr(0, kind_guess.length() - 1)
			if kind_guess not in [KIND_PLAYER, KIND_NPC, KIND_ENEMY, KIND_LOOT, KIND_CORPSE, KIND_GROUND]:
				_reject_kind(kind_guess)
	_prune(keep)
	_attach_camera()


func apply_snapshot(state: Dictionary, interp_duration: float = 0.1) -> void:
	if not String(state.get("self_id", "")).is_empty():
		local_server_id = String(state.get("self_id", ""))
	if state.has("tick"):
		last_server_tick = float(state.get("tick"))
	var keep: Dictionary = {}
	var prune_prefixes: PackedStringArray = PackedStringArray(["player:"])
	_apply_kind(KIND_PLAYER, state.get("players", []), keep, true, interp_duration)
	if state.has("npcs"):
		prune_prefixes.append("npc:")
		_apply_kind(KIND_NPC, state.get("npcs", []), keep, true, interp_duration)
	if state.has("enemies"):
		prune_prefixes.append("enemy:")
		_apply_kind(KIND_ENEMY, state.get("enemies", []), keep, true, interp_duration)
	if state.has("loot"):
		prune_prefixes.append("loot:")
		_apply_kind(KIND_LOOT, state.get("loot", []), keep, true, interp_duration)
	if state.has("corpses"):
		prune_prefixes.append("corpse:")
		_apply_kind(KIND_CORPSE, state.get("corpses", []), keep, true, interp_duration)
	if state.has("groundItems"):
		prune_prefixes.append("ground:")
		_apply_kind(KIND_GROUND, state.get("groundItems", []), keep, true, interp_duration)
	var stale: Array = []
	for key in _nodes.keys():
		var key_text := String(key)
		var tracked := false
		for prefix in prune_prefixes:
			if key_text.begins_with(prefix):
				tracked = true
				break
		if tracked and not keep.has(key):
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
	var local_key := "%s:%s" % [KIND_PLAYER, local_server_id]
	for id in poses.keys():
		var key := String(id)
		if key == local_key:
			continue
		var node: Node2D = get_entity(key)
		if node == null and not key.contains(":"):
			node = get_entity("%s:%s" % [KIND_PLAYER, key])
		if node is NpcAvatar:
			continue
		if node != null:
			var next: Vector2 = poses[id]
			if node is WorldAvatar:
				var avatar := node as WorldAvatar
				avatar.set_move_vector(next - avatar.position)
				avatar.position = next
			else:
				node.position = next


func pose_local(pos: Vector2, facing: Variant = null) -> void:
	## Facing is optional. Snapshot/reconcile pose updates must not pass Vector2.ZERO
	## or they stop AnimatedSprite2D every tick and leave a static walk frame.
	var node: Node2D = get_entity("%s:%s" % [KIND_PLAYER, local_server_id])
	if node is WorldAvatar:
		var avatar := node as WorldAvatar
		avatar.set_server_position(pos.x, pos.y)
		if facing is Vector2:
			avatar.set_move_vector(facing as Vector2)
	elif node != null:
		node.position = pos


func set_local_idle_facing(direction: Vector2) -> void:
	var node: Node2D = get_entity("%s:%s" % [KIND_PLAYER, local_server_id])
	if node is WorldAvatar:
		(node as WorldAvatar).set_idle_facing(direction)


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
		var named := _name_for(kind, record)
		if node == null:
			node = _spawn(kind, server_id, record)
			if node == null:
				continue
			_nodes[key] = node
			add_child(node)
			node.position = pose
			if node is NpcAvatar:
				(node as NpcAvatar).apply_server_npc(record, last_server_tick, true)
			if node is GroundItemAvatar:
				(node as GroundItemAvatar).apply_ground_item(record)
			if node is WorldAvatar:
				_apply_vitals(node as WorldAvatar, kind, record)
		elif node is NpcAvatar:
			var npc_avatar := node as NpcAvatar
			if (
				npc_avatar.kind != kind
				or npc_avatar.server_id != server_id
				or npc_avatar.display_name != named
			):
				npc_avatar.configure(kind, server_id, named, _visual_for(kind, record), false)
			npc_avatar.apply_server_npc(record, last_server_tick, not interpolate_remotes)
		elif node is WorldAvatar:
			var avatar := node as WorldAvatar
			if (
				avatar.kind != kind
				or avatar.server_id != server_id
				or avatar.display_name != named
				or avatar.is_local != is_local
			):
				avatar.configure(kind, server_id, named, _visual_for(kind, record), is_local)
			if node is GroundItemAvatar:
				(node as GroundItemAvatar).apply_ground_item(record)
			if interpolate_remotes:
				pass
			else:
				avatar.set_server_position(pose.x, pose.y)
			_apply_vitals(avatar, kind, record)
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
	if kind == KIND_GROUND:
		var ground := String(record.get("groundEntityId", ""))
		if ground.is_empty():
			ground = String(record.get("id", ""))
		return ground
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
	if kind == KIND_CORPSE:
		var enemy_id := String(record.get("enemyId", ""))
		if not enemy_id.is_empty():
			var enemy: Dictionary = ContentRegistry.get_by_id(enemy_id)
			var remains := String(enemy.get("displayName", ""))
			if not remains.is_empty():
				return "%s remains" % remains
		return "Corpse"
	if kind == KIND_GROUND:
		var item_id := String(record.get("itemId", ""))
		var item: Dictionary = ContentRegistry.get_by_id(item_id)
		var rarity := ItemPresentation.rarity_label(item)
		var named := String(item.get("displayName", item_id))
		if rarity.is_empty():
			return named
		return "%s %s" % [rarity, named]
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
	elif kind == KIND_GROUND:
		content_id = String(record.get("itemId", ""))
	elif kind == KIND_CORPSE:
		return {
			"visual_id": "visual.corpse",
			"missing": false,
			"fallback_color": Color(0.42, 0.32, 0.24, 1),
			"visual_set": {},
			"direction_count": 4,
		}
	var visual_id := ContentRegistry.visual_id_for_content(content_id)
	if visual_id.is_empty() and (kind == KIND_LOOT or kind == KIND_GROUND) and not content_id.is_empty():
		visual_id = ContentRegistry.assets.icon_visual_id("item", content_id)
	if visual_id.is_empty() and not content_id.is_empty():
		visual_id = "visual.unmapped:%s" % content_id
	var visual: Dictionary = ContentRegistry.resolve_visual(visual_id)
	var vis_set: Dictionary = {}
	if (kind != KIND_LOOT and kind != KIND_GROUND) or ContentRegistry.assets.has_set_for_content(content_id):
		vis_set = ContentRegistry.resolve_visual_set_for_content(content_id)
	visual["visual_set"] = vis_set
	visual["direction_count"] = int(vis_set.get("directionCount", 4))
	return visual


func _pose(record: Dictionary) -> Vector2:
	return Vector2(float(record.get("x", 0.0)), float(record.get("y", 0.0)))


func _apply_vitals(avatar: WorldAvatar, kind: String, record: Dictionary) -> void:
	if kind != KIND_PLAYER and kind != KIND_ENEMY:
		return
	var max_health := int(record.get("maxHealth", record.get("max_health", 1)))
	var health := int(record.get("health", max_health))
	var alive := health > 0
	if record.has("alive"):
		alive = bool(record["alive"])
	avatar.set_vitals(health, max_health, alive)


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
	if not follow_camera.is_current():
		follow_camera.make_current()
