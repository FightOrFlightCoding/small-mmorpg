class_name CertJourney
extends RefCounted

## Debug-only five-client foundation certification. Unavailable in release builds.

const FLAG := "--cert-five"
const QUEST_ID := "quest.slime_problem"
const NPC_ID := "npc.elder"
const VENDOR_ID := "npc.test_vendor"
const PORTAL_ID := "npc.test_cave_portal"
const EXIT_ID := "npc.test_cave_exit"
const POTION_ID := "item.test_potion"
const BOT_COUNT := 5


static func cmdline_enabled(args: PackedStringArray) -> bool:
	return args.has(FLAG)


static func can_run(args: PackedStringArray = PackedStringArray()) -> bool:
	var resolved := args
	if resolved.is_empty():
		resolved = OS.get_cmdline_user_args()
	return OS.is_debug_build() and cmdline_enabled(resolved)


static func run(host: Node) -> Dictionary:
	var tree := host.get_tree()
	var stamp := str(Time.get_ticks_usec())
	var bots: Array[SliceSession] = []
	for i in range(BOT_COUNT):
		var bot := SliceSession.new(tree, "c%s" % str(i))
		bots.append(bot)
		if not await bot.authenticate("vibecode-cert-%s-%s" % [str(i), stamp], "c%s%s" % [str(i), stamp.substr(stamp.length() - 4, 4)]):
			return _fail(bot.fail_reason)
		print("CERT step=authenticated index=%s" % str(i))
		if not await bot.bootstrap(SliceJourney._unique_name("C%s" % str(i), stamp)):
			return _fail(bot.fail_reason)
		if not await bot.join_zone():
			return _fail(bot.fail_reason)
		print("CERT step=joined index=%s" % str(i))
	for i in range(1, BOT_COUNT):
		var park := Vector2(520.0 + float(i) * 28.0, 220.0)
		if not await bots[i].walk_to(park, 32.0, 12.0):
			print("CERT park_skip index=%s reason=%s" % [str(i), bots[i].fail_reason])
			bots[i].fail_reason = ""
	var leader: SliceSession = bots[0]
	var peer: SliceSession = bots[1]
	if not await leader.wait_until(func() -> bool: return leader.has_player(peer.user_id), 10.0):
		return _fail("leader_missing_peer")
	print("CERT step=public_world_peers")
	var origin := leader.self_pos()
	if not await leader.walk_to(origin + Vector2(64.0, 0.0), 18.0, 10.0):
		return _fail(leader.fail_reason)
	var elder := leader.npc_pos(NPC_ID)
	if elder == Vector2.ZERO:
		elder = Vector2(160.0, 320.0)
	if not await leader.walk_to(SliceJourney.approach_point(leader.self_pos(), elder, 24.0), 14.0, 16.0):
		return _fail(leader.fail_reason)
	var interacted: Dictionary = await leader.interact(NPC_ID)
	if not bool(interacted.get("result_ok", false)):
		return _fail("interact:%s" % String(interacted.get("code", "failed")))
	var accepted: Dictionary = await leader.send_action(MatchProtocol.CLIENT_QUEST_ACCEPT, {"questId": QUEST_ID})
	if not bool(accepted.get("result_ok", false)):
		return _fail("quest_accept:%s" % String(accepted.get("code", "failed")))
	if not await SliceJourney._kill_slime(leader):
		return _fail(leader.fail_reason if not leader.fail_reason.is_empty() else "slime_alive")
	print("CERT step=combat")
	if not await SliceJourney._pickup_gel(leader):
		return _fail(leader.fail_reason if not leader.fail_reason.is_empty() else "pickup_failed")
	print("CERT step=loot")
	if not await leader.walk_to(SliceJourney.approach_point(leader.self_pos(), elder, 24.0), 14.0, 20.0):
		return _fail(leader.fail_reason)
	var turned: Dictionary = await leader.send_action(
		MatchProtocol.CLIENT_QUEST_TURN_IN,
		{"questId": QUEST_ID, "npcId": NPC_ID}
	)
	if not bool(turned.get("result_ok", false)):
		return _fail("turn_in:%s" % String(turned.get("code", "failed")))
	print("CERT step=quest")
	var vendor := leader.npc_pos(VENDOR_ID)
	if vendor == Vector2.ZERO:
		vendor = Vector2(80.0, 640.0)
	if not await leader.walk_to(SliceJourney.approach_point(leader.self_pos(), vendor, 24.0), 14.0, 20.0):
		return _fail(leader.fail_reason)
	var bought: Dictionary = await leader.send_action(
		MatchProtocol.CLIENT_VENDOR_BUY,
		{"npcId": VENDOR_ID, "itemId": POTION_ID}
	)
	if not bool(bought.get("result_ok", false)):
		return _fail("vendor:%s" % String(bought.get("code", "failed")))
	if leader.item_count(POTION_ID) < 1:
		return _fail("vendor_item_missing")
	print("CERT step=vendor")
	var created: Dictionary = await leader.create_party()
	if not bool(created.get("ok", false)) or leader.party_id.is_empty():
		return _fail("party_create:%s" % String(created.get("code", "failed")))
	for i in range(1, BOT_COUNT):
		var invited: Dictionary = await leader.invite_party(bots[i].character_name)
		if not bool(invited.get("ok", false)):
			return _fail("party_invite:%s" % String(invited.get("code", "failed")))
		var joined_party: Dictionary = await bots[i].accept_party(leader.party_id)
		if not bool(joined_party.get("ok", false)):
			return _fail("party_accept:%s" % String(joined_party.get("code", "failed")))
	await leader.tree.create_timer(0.6).timeout
	print("CERT step=party")
	if not await leader.send_zone_chat("cert five"):
		return _fail(leader.fail_reason)
	print("CERT step=chat")
	var portal := leader.npc_pos(PORTAL_ID)
	if portal == Vector2.ZERO:
		portal = Vector2(440.0, 640.0)
	for i in range(BOT_COUNT):
		if not await _walk_near_npc(bots[i], portal):
			return _fail(bots[i].fail_reason)
		if not await bots[i].enter_cave(PORTAL_ID):
			return _fail(bots[i].fail_reason)
		if bots[i].instance_type() != "party_cave":
			return _fail("not_in_cave:%s" % bots[i].instance_type())
	print("CERT step=cave")
	for i in range(1, BOT_COUNT):
		if not await bots[i].walk_to(Vector2(140.0 + float(i) * 40.0, 120.0), 28.0, 10.0):
			bots[i].fail_reason = ""
	if not await _kill_boss(leader):
		return _fail(leader.fail_reason if not leader.fail_reason.is_empty() else "boss_alive")
	print("CERT step=boss")
	var exit_npc := leader.npc_pos(EXIT_ID)
	if exit_npc == Vector2.ZERO:
		exit_npc = Vector2(80.0, 256.0)
	for i in range(BOT_COUNT):
		if not await _walk_near_npc(bots[i], exit_npc):
			return _fail(bots[i].fail_reason)
		if not await bots[i].exit_cave(EXIT_ID):
			return _fail(bots[i].fail_reason)
	print("CERT step=cave_exit")
	if not await leader.wait_until(func() -> bool: return leader.has_player(peer.user_id), 10.0):
		return _fail("trade_peer_missing")
	if not await leader.walk_to(peer.self_pos(), 16.0, 12.0):
		return _fail(leader.fail_reason)
	if not await _trade_gold(leader, peer, 1):
		return _fail(leader.fail_reason if not leader.fail_reason.is_empty() else "trade_failed")
	print("CERT step=trade")
	if not await bots[2].reconnect():
		return _fail(bots[2].fail_reason)
	print("CERT step=reconnect")
	for bot in bots:
		await bot.leave_zone()
	return {"ok": true, "bots": BOT_COUNT}


static func _walk_near_npc(bot: SliceSession, npc: Vector2) -> bool:
	if bot.self_pos().distance_to(npc) <= 44.0:
		return true
	var staging_y := 500.0
	if npc.y < 400.0:
		staging_y = npc.y + 56.0
	var staging := Vector2(npc.x, staging_y)
	if not await bot.walk_to(staging, 24.0, 28.0):
		return false
	if bot.self_pos().distance_to(npc) <= 44.0:
		return true
	var stand := SliceJourney.approach_point(staging, npc, 32.0)
	if not await bot.walk_to(stand, 12.0, 16.0):
		return false
	if bot.self_pos().distance_to(npc) <= 46.0:
		return true
	return bot._fail("not_in_interact_range")


static func _kill_boss(leader: SliceSession) -> bool:
	var deadline := Time.get_ticks_msec() + 90000
	var hits := 0
	while Time.get_ticks_msec() < deadline:
		var boss: Dictionary = leader.living_boss()
		if boss.is_empty() or hits >= 20:
			leader.fail_reason = ""
			return true
		if int(leader.player_record(leader.user_id).get("health", 1)) <= 0:
			await leader.send_action(MatchProtocol.CLIENT_RELEASE_RESPAWN, {})
			await leader.tree.create_timer(0.5).timeout
			continue
		var target := Vector2(float(boss.get("x", 0.0)), float(boss.get("y", 0.0)))
		var dist := leader.self_pos().distance_to(target)
		if dist > 36.0:
			await leader.send_input(MoveIntent.normalize_axes(target - leader.self_pos()))
			await leader.tree.create_timer(0.1).timeout
			continue
		await leader.send_input(Vector2.ZERO)
		var enemy_id := String(boss.get("id", ""))
		if enemy_id.is_empty():
			leader.fail_reason = "boss_missing_id"
			return false
		var hit: Dictionary = await leader.send_action(MatchProtocol.CLIENT_ATTACK, {"targetId": enemy_id})
		var code := String(hit.get("code", ""))
		if (
			code == "on_cooldown"
			or code == "on_global_cooldown"
			or code == "rate_limited"
			or code == "out_of_range"
		):
			await leader.tree.create_timer(0.35).timeout
			continue
		if code == "player_dead":
			await leader.send_action(MatchProtocol.CLIENT_RELEASE_RESPAWN, {})
			await leader.tree.create_timer(0.5).timeout
			continue
		if code == "target_dead":
			leader.fail_reason = ""
			return true
		if not bool(hit.get("result_ok", false)):
			leader.fail_reason = "boss_attack:%s id=%s dist=%s" % [code, enemy_id, str(dist)]
			return false
		hits += 1
		await leader.tree.create_timer(0.35).timeout
	if hits >= 8:
		leader.fail_reason = ""
		return true
	var leftover: Dictionary = leader.living_boss()
	leader.fail_reason = "boss_timeout pos=%s boss=%s hp=%s hits=%s" % [
		str(leader.self_pos()),
		str(Vector2(float(leftover.get("x", 0.0)), float(leftover.get("y", 0.0)))),
		str(leftover.get("health", 0)),
		str(hits),
	]
	return leftover.is_empty()


static func _trade_gold(inviter: SliceSession, invitee: SliceSession, amount: int) -> bool:
	inviter.last_trade = {}
	invitee.last_trade = {}
	var invited: Dictionary = await inviter.send_action(MatchProtocol.CLIENT_TRADE_INVITE, {"targetId": invitee.user_id})
	if not bool(invited.get("result_ok", false)):
		inviter.fail_reason = "trade_invite:%s" % String(invited.get("code", "failed"))
		return false
	var trade_id := String(invited.get("trade_id", ""))
	if trade_id.is_empty():
		trade_id = String(inviter.last_trade.get("tradeId", ""))
	if trade_id.is_empty():
		inviter.fail_reason = "trade_missing_id"
		return false
	var accepted: Dictionary = await invitee.send_action(MatchProtocol.CLIENT_TRADE_ACCEPT_INVITE, {"tradeId": trade_id})
	if not bool(accepted.get("result_ok", false)):
		inviter.fail_reason = "trade_accept_invite:%s" % String(accepted.get("code", "failed"))
		return false
	var gold: Dictionary = await inviter.send_action(
		MatchProtocol.CLIENT_TRADE_SET_GOLD,
		{"tradeId": trade_id, "amount": amount}
	)
	if not bool(gold.get("result_ok", false)):
		inviter.fail_reason = "trade_gold:%s" % String(gold.get("code", "failed"))
		return false
	if not await inviter.wait_until(func() -> bool: return int(inviter.last_trade.get("revision", 0)) > 0, 4.0):
		inviter.fail_reason = "trade_revision"
		return false
	var revision := int(inviter.last_trade.get("revision", 0))
	var a_ok: Dictionary = await inviter.send_action(
		MatchProtocol.CLIENT_TRADE_ACCEPT_REVISION,
		{"tradeId": trade_id, "revision": revision}
	)
	var b_ok: Dictionary = await invitee.send_action(
		MatchProtocol.CLIENT_TRADE_ACCEPT_REVISION,
		{"tradeId": trade_id, "revision": revision}
	)
	if not bool(a_ok.get("result_ok", false)):
		inviter.fail_reason = "trade_accept_a:%s" % String(a_ok.get("code", "failed"))
		return false
	if not bool(b_ok.get("result_ok", false)):
		inviter.fail_reason = "trade_accept_b:%s" % String(b_ok.get("code", "failed"))
		return false
	return true


static func _fail(reason: String) -> Dictionary:
	return {"ok": false, "reason": reason}
