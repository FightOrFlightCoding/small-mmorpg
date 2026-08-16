class_name SliceJourney
extends RefCounted

## Debug-only two-client starter-zone journey. Unavailable in release builds.

const FLAG := "--e2e-slice"
const QUEST_ID := "quest.slime_problem"
const NPC_ID := "npc.elder"
const GEL_ID := "item.slime_gel"
const SWORD_ID := "item.iron_sword"


static func cmdline_enabled(args: PackedStringArray) -> bool:
	return args.has(FLAG)


static func can_run(args: PackedStringArray = PackedStringArray()) -> bool:
	var resolved := args
	if resolved.is_empty():
		resolved = OS.get_cmdline_user_args()
	return OS.is_debug_build() and cmdline_enabled(resolved)


static func approach_point(from: Vector2, toward: Vector2, standoff: float) -> Vector2:
	var delta := from - toward
	if delta.length_squared() <= 0.0001:
		return toward + Vector2(standoff, 0.0)
	return toward + delta.normalized() * standoff


static func run(host: Node) -> Dictionary:
	var tree := host.get_tree()
	var stamp := str(Time.get_ticks_usec())
	var alice := SliceSession.new(tree, "alice")
	var bob := SliceSession.new(tree, "bob")
	if not await alice.authenticate("vibecode-e2e-a-%s" % stamp, "a%s" % stamp):
		return _fail(alice.fail_reason)
	print("E2E step=alice_authenticated")
	if not await bob.authenticate("vibecode-e2e-b-%s" % stamp, "b%s" % stamp):
		return _fail(bob.fail_reason)
	print("E2E step=bob_authenticated")
	if not await alice.bootstrap(_unique_name("A", stamp)):
		return _fail(alice.fail_reason)
	if not await bob.bootstrap(_unique_name("B", stamp)):
		return _fail(bob.fail_reason)
	if not await alice.join_zone():
		return _fail(alice.fail_reason)
	print("E2E step=alice_joined")
	if not await bob.join_zone():
		return _fail(bob.fail_reason)
	print("E2E step=bob_joined")
	if not await alice.wait_until(func() -> bool: return alice.has_player(bob.user_id), 10.0):
		return _fail("alice_missing_bob")
	if not await bob.wait_until(func() -> bool: return bob.has_player(alice.user_id), 10.0):
		return _fail("bob_missing_alice")
	print("E2E step=full_state_peers")
	var origin := alice.self_pos()
	var move_target := origin + Vector2(96.0, 0.0)
	if not await alice.walk_to(move_target, 18.0, 12.0):
		return _fail(alice.fail_reason)
	if not await bob.wait_until(func() -> bool: return bob.player_pos(alice.user_id).x >= origin.x + 24.0, 8.0):
		return _fail("bob_did_not_see_alice_move")
	print("E2E step=alice_moved")
	var elder := alice.npc_pos(NPC_ID)
	if elder == Vector2.ZERO:
		elder = Vector2(160.0, 320.0)
	if not await alice.walk_to(approach_point(alice.self_pos(), elder, 36.0), 14.0, 16.0):
		return _fail(alice.fail_reason)
	var interacted: Dictionary = await alice.interact(NPC_ID)
	if not bool(interacted.get("result_ok", false)):
		return _fail("interact:%s" % String(interacted.get("code", "failed")))
	print("E2E step=alice_interacted")
	var accepted: Dictionary = await alice.send_action(
		MatchProtocol.CLIENT_QUEST_ACCEPT,
		{"questId": QUEST_ID}
	)
	if not bool(accepted.get("result_ok", false)):
		return _fail("quest_accept:%s" % String(accepted.get("code", "failed")))
	if not await alice.wait_until(func() -> bool: return alice.quest_status(QUEST_ID) == "accepted", 4.0):
		return _fail("quest_not_accepted")
	print("E2E step=alice_accepted_quest")
	if not await _kill_slime(alice):
		return _fail(alice.fail_reason if not alice.fail_reason.is_empty() else "slime_alive")
	print("E2E step=alice_killed_slime")
	if not await _pickup_gel(alice):
		return _fail(alice.fail_reason if not alice.fail_reason.is_empty() else "pickup_failed")
	print("E2E step=alice_picked_gel")
	if not await alice.walk_to(approach_point(alice.self_pos(), elder, 36.0), 14.0, 20.0):
		return _fail(alice.fail_reason)
	var turned: Dictionary = await alice.send_action(
		MatchProtocol.CLIENT_QUEST_TURN_IN,
		{"questId": QUEST_ID, "npcId": NPC_ID}
	)
	if not bool(turned.get("result_ok", false)):
		return _fail("turn_in:%s" % String(turned.get("code", "failed")))
	if not await alice.wait_until(func() -> bool: return alice.item_count(SWORD_ID) >= 1 and alice.gold() == 25, 4.0):
		return _fail("reward_missing sword=%s gold=%s" % [str(alice.item_count(SWORD_ID)), str(alice.gold())])
	print("E2E step=alice_turned_in")
	await alice.leave_zone()
	await tree.create_timer(0.4).timeout
	if not await alice.join_zone():
		return _fail(alice.fail_reason)
	if alice.quest_status(QUEST_ID) != "completed":
		return _fail("reconnect_quest")
	if alice.item_count(SWORD_ID) < 1:
		return _fail("reconnect_sword")
	if alice.gold() != 25:
		return _fail("reconnect_gold")
	print("E2E step=alice_reconnected")
	if not await alice.walk_to(approach_point(alice.self_pos(), elder, 36.0), 14.0, 12.0):
		return _fail(alice.fail_reason)
	var duplicate: Dictionary = await alice.send_action(
		MatchProtocol.CLIENT_QUEST_TURN_IN,
		{"questId": QUEST_ID, "npcId": NPC_ID}
	)
	if String(duplicate.get("code", "")) != "already_completed":
		return _fail("duplicate_turn_in:%s" % String(duplicate.get("code", "missing")))
	if alice.item_count(SWORD_ID) != 1 or alice.gold() != 25:
		return _fail("duplicate_reward_applied")
	print("E2E step=duplicate_turn_in")
	await alice.leave_zone()
	await bob.leave_zone()
	return {"ok": true, "alice_id": alice.user_id, "bob_id": bob.user_id}


static func _kill_slime(alice: SliceSession) -> bool:
	var deadline := Time.get_ticks_msec() + 25000
	while Time.get_ticks_msec() < deadline:
		var slime: Dictionary = alice.living_slime()
		if slime.is_empty():
			return true
		var target := Vector2(float(slime.get("x", 0.0)), float(slime.get("y", 0.0)))
		if alice.self_pos().distance_to(target) > 32.0:
			await alice.walk_to(approach_point(alice.self_pos(), target, 28.0), 12.0, 6.0)
			continue
		await alice.send_input(Vector2.ZERO)
		var enemy_id := String(slime.get("id", "enemy.green_slime:0"))
		var hit: Dictionary = await alice.send_action(MatchProtocol.CLIENT_ATTACK, {"targetId": enemy_id})
		var code := String(hit.get("code", ""))
		if code == "on_cooldown" or code == "rate_limited" or code == "out_of_range":
			await alice.tree.create_timer(0.75).timeout
			continue
		if not bool(hit.get("result_ok", false)) and code != "target_dead":
			alice.fail_reason = "attack:%s" % code
			return false
		await alice.tree.create_timer(0.75).timeout
	alice.fail_reason = "slime_timeout"
	return alice.living_slime().is_empty()


static func _pickup_gel(alice: SliceSession) -> bool:
	if not await alice.wait_until(func() -> bool: return not alice.gel_loot().is_empty(), 6.0):
		alice.fail_reason = "loot_missing"
		return false
	var loot: Dictionary = alice.gel_loot()
	var loot_pos := Vector2(float(loot.get("x", 0.0)), float(loot.get("y", 0.0)))
	if not await alice.walk_to(loot_pos, 16.0, 8.0):
		return false
	var picked: Dictionary = await alice.send_action(
		MatchProtocol.CLIENT_PICKUP,
		{"lootId": String(loot.get("id", ""))}
	)
	if not bool(picked.get("result_ok", false)):
		alice.fail_reason = "pickup:%s" % String(picked.get("code", "failed"))
		return false
	return await alice.wait_until(func() -> bool: return alice.item_count(GEL_ID) >= 1, 4.0)


static func _unique_name(prefix: String, stamp: String) -> String:
	var body := prefix + stamp
	if body.length() > 16:
		body = prefix + stamp.substr(stamp.length() - (16 - prefix.length()), 16 - prefix.length())
	if body.length() < 3:
		body = (body + "aaa").substr(0, 3)
	return body


static func _fail(reason: String) -> Dictionary:
	return {"ok": false, "reason": reason}
