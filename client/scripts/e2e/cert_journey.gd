class_name CertJourney
extends RefCounted

## Debug-only five-client foundation certification. Unavailable in release builds.

const FLAG := "--cert-five"
const FLAG_RESUME := "--cert-five-resume"
const QUEST_ID := "quest.slime_problem"
const NPC_ID := "npc.elder"
const VENDOR_ID := "npc.test_vendor"
const INN_ID := "npc.test_innkeeper"
const CERT_VENDOR_ID := "npc.cert_quartermaster"
const PORTAL_ID := "npc.test_cave_portal"
const EXIT_ID := "npc.test_cave_exit"
const POTION_ID := "item.test_potion"
const IRON_ID := "item.iron_sword"
const TRAINING_ID := "item.training_sword"
const MAIL_ID := "item.cert_mail"
const CLASS_VANGUARD := "test.class.vanguard"
const CLASS_ARCANIST := "test.class.arcanist"
const BOT_COUNT := 5


static func cmdline_enabled(args: PackedStringArray) -> bool:
	return args.has(FLAG)


static func cmdline_resume(args: PackedStringArray) -> bool:
	return args.has(FLAG_RESUME)


static func stamp_from_args(args: PackedStringArray) -> String:
	for arg in args:
		if String(arg).begins_with("--cert-stamp="):
			return String(arg).substr("--cert-stamp=".length())
	return str(Time.get_ticks_usec())


static func device_id(index: int, stamp: String) -> String:
	return "vibecode-cert-%s-%s" % [str(index), stamp]


static func can_run(args: PackedStringArray = PackedStringArray()) -> bool:
	var resolved := args
	if resolved.is_empty():
		resolved = OS.get_cmdline_user_args()
	return OS.is_debug_build() and (cmdline_enabled(resolved) or cmdline_resume(resolved))


static func run(host: Node) -> Dictionary:
	var tree := host.get_tree()
	var args := OS.get_cmdline_user_args()
	var stamp := stamp_from_args(args)
	print("CERT stamp=%s" % stamp)
	var bots: Array[SliceSession] = []
	var classes: PackedStringArray = PackedStringArray()
	for i in range(BOT_COUNT):
		var class_id := CLASS_VANGUARD if i < 3 else CLASS_ARCANIST
		classes.append(class_id)
		var bot := SliceSession.new(tree, "c%s" % str(i))
		bots.append(bot)
		if not await bot.authenticate(device_id(i, stamp), "c%s%s" % [str(i), stamp.substr(maxi(stamp.length() - 4, 0), 4)]):
			return _fail(bot.fail_reason)
		print("CERT step=authenticated index=%s" % str(i))
		if not await bot.create_character(SliceJourney._unique_name("C%s" % str(i), stamp), class_id):
			return _fail(bot.fail_reason)
		if bot.class_id != class_id:
			return _fail("class_mismatch:%s" % bot.class_id)
		if not await bot.join_zone():
			return _fail(bot.fail_reason)
		print("CERT step=joined index=%s class=%s" % [str(i), class_id])
	if classes.find(CLASS_VANGUARD) < 0 or classes.find(CLASS_ARCANIST) < 0:
		return _fail("missing_second_class")
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
	var iron_id := leader.first_instance_id(IRON_ID)
	if iron_id.is_empty():
		return _fail("iron_missing")
	var equipped: Dictionary = await leader.send_action(
		MatchProtocol.CLIENT_EQUIP,
		{"instanceId": iron_id, "slot": "main_hand"}
	)
	if not bool(equipped.get("result_ok", false)):
		return _fail("equip_weapon:%s" % String(equipped.get("code", "failed")))
	print("CERT step=equip_weapon")
	var vendor := leader.npc_pos(VENDOR_ID)
	if vendor == Vector2.ZERO:
		vendor = Vector2(80.0, 640.0)
	if not await _walk_near_npc(leader, vendor):
		return _fail(leader.fail_reason)
	var bought: Dictionary = await leader.send_action(
		MatchProtocol.CLIENT_VENDOR_BUY,
		{"npcId": VENDOR_ID, "itemId": POTION_ID}
	)
	if not bool(bought.get("result_ok", false)):
		return _fail("vendor:%s" % String(bought.get("code", "failed")))
	if leader.item_count(POTION_ID) < 1:
		return _fail("vendor_item_missing")
	var potion_id := leader.first_instance_id(POTION_ID)
	var sold: Dictionary = await leader.send_action(
		MatchProtocol.CLIENT_VENDOR_SELL,
		{"npcId": VENDOR_ID, "instanceId": potion_id}
	)
	if not bool(sold.get("result_ok", false)):
		return _fail("vendor_sell:%s" % String(sold.get("code", "failed")))
	print("CERT step=vendor")
	var inn := leader.npc_pos(INN_ID)
	if inn == Vector2.ZERO:
		inn = Vector2(200.0, 640.0)
	if not await _walk_near_npc(leader, inn):
		return _fail(leader.fail_reason)
	var rested: Dictionary = await leader.send_action(
		MatchProtocol.CLIENT_INN_REST,
		{"npcId": INN_ID}
	)
	if not bool(rested.get("result_ok", false)):
		return _fail("inn:%s" % String(rested.get("code", "failed")))
	print("CERT step=inn")
	var cert_vendor := leader.npc_pos(CERT_VENDOR_ID)
	if cert_vendor == Vector2.ZERO:
		cert_vendor = Vector2(720.0, 640.0)
	if not await _walk_near_npc(leader, cert_vendor):
		return _fail(leader.fail_reason)
	var mail_bought: Dictionary = await leader.send_action(
		MatchProtocol.CLIENT_VENDOR_BUY,
		{"npcId": CERT_VENDOR_ID, "itemId": MAIL_ID}
	)
	if not bool(mail_bought.get("result_ok", false)):
		return _fail("cert_vendor:%s" % String(mail_bought.get("code", "failed")))
	var mail_id := leader.first_instance_id(MAIL_ID)
	if mail_id.is_empty():
		return _fail("mail_missing")
	var mail_equipped: Dictionary = await leader.send_action(
		MatchProtocol.CLIENT_EQUIP,
		{"instanceId": mail_id, "slot": "chest"}
	)
	if not bool(mail_equipped.get("result_ok", false)):
		return _fail("equip_armor:%s" % String(mail_equipped.get("code", "failed")))
	print("CERT step=equip_armor")
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
	if not await leader.send_party_chat("cert party"):
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
		await leader.tree.create_timer(0.35).timeout
	print("CERT step=cave")
	if not await bots[2].reconnect():
		return _fail(bots[2].fail_reason)
	if bots[2].instance_type() != "party_cave":
		return _fail("cave_reconnect:%s" % bots[2].instance_type())
	print("CERT step=cave_reconnect")
	# Members stay near cave spawn (96,256). That is inside the 512 px group-credit
	# radius of the boss at 480,256 without stacking five bodies onto the boss.
	# Walking everyone into melee pulled a wipe; inn bind is in the public world,
	# so RELEASE_RESPAWN inside the cave dumps the body onto the south collision.
	if not await _kill_boss(leader):
		return _fail(leader.fail_reason if not leader.fail_reason.is_empty() else "boss_alive")
	print("CERT step=boss")
	if not await leader.wait_until(func() -> bool: return leader.progression_level() >= 2, 8.0):
		return _fail("level:%s" % str(leader.progression_level()))
	if leader.unspent_attribute_points() < 1:
		return _fail("no_attribute_point")
	var allocated: Dictionary = await leader.send_action(
		MatchProtocol.CLIENT_ALLOCATE_ATTRIBUTES,
		{"attributeId": "test.attribute.might", "amount": 1}
	)
	if not bool(allocated.get("result_ok", false)):
		return _fail("allocate:%s" % String(allocated.get("code", "failed")))
	if leader.unspent_skill_points() < 1:
		return _fail("no_skill_point")
	var unlocked: Dictionary = await leader.send_action(
		MatchProtocol.CLIENT_UNLOCK_ABILITY,
		{"abilityId": "test.ability.small_heal"}
	)
	if not bool(unlocked.get("result_ok", false)):
		return _fail("unlock:%s" % String(unlocked.get("code", "failed")))
	print("CERT step=progression")
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
	if not await _trade_item_and_gold(leader, peer, 1):
		return _fail(leader.fail_reason if not leader.fail_reason.is_empty() else "trade_failed")
	print("CERT step=trade")
	var disbanded: Dictionary = await leader.disband_party()
	if not bool(disbanded.get("ok", false)):
		return _fail("party_disband:%s" % String(disbanded.get("code", "failed")))
	for bot in bots:
		await bot.logout()
	print("CERT step=logout")
	return {"ok": true, "bots": BOT_COUNT, "stamp": stamp}


static func resume(host: Node) -> Dictionary:
	var tree := host.get_tree()
	var stamp := stamp_from_args(OS.get_cmdline_user_args())
	if stamp.is_empty():
		return _fail("resume_missing_stamp")
	print("CERT resume stamp=%s" % stamp)
	var bots: Array[SliceSession] = []
	for i in range(BOT_COUNT):
		var bot := SliceSession.new(tree, "r%s" % str(i))
		bots.append(bot)
		if not await bot.authenticate(device_id(i, stamp), "c%s%s" % [str(i), stamp.substr(maxi(stamp.length() - 4, 0), 4)]):
			return _fail(bot.fail_reason)
		if not await bot.load_existing_character():
			return _fail(bot.fail_reason)
		if not await bot.join_zone():
			return _fail(bot.fail_reason)
		if bot.instance_type() != "public_world":
			return _fail("resume_not_public:%s" % bot.instance_type())
		print("CERT step=resume_joined index=%s" % str(i))
	var leader: SliceSession = bots[0]
	if leader.quest_status(QUEST_ID) != "completed":
		return _fail("resume_quest:%s" % leader.quest_status(QUEST_ID))
	if leader.gold() <= 0:
		return _fail("resume_gold")
	if leader.item_count(IRON_ID) < 1 and leader.equipped_instance("main_hand").is_empty():
		return _fail("resume_item")
	if not await leader.wait_until(func() -> bool: return leader.has_player(bots[1].user_id), 10.0):
		return _fail("resume_peer_missing")
	for bot in bots:
		await bot.logout()
	return {"ok": true, "bots": BOT_COUNT, "stamp": stamp}


static func _walk_near_npc(bot: SliceSession, npc: Vector2) -> bool:
	if bot.self_pos().distance_to(npc) <= 44.0:
		return true
	if npc.y >= 560.0:
		var south := Vector2(bot.self_pos().x, 700.0)
		if bot.self_pos().y < 680.0:
			if not await bot.walk_to(south, 20.0, 12.0):
				bot.fail_reason = ""
		if not await bot.walk_to(Vector2(npc.x, 700.0), 24.0, 36.0):
			return false
		if bot.self_pos().distance_to(npc) <= 44.0:
			return true
		if not await bot.walk_to(SliceJourney.approach_point(Vector2(npc.x, 700.0), npc, 32.0), 12.0, 16.0):
			return false
		if bot.self_pos().distance_to(npc) <= 46.0:
			return true
		return bot._fail("not_in_interact_range")
	var staging_y := 500.0
	if npc.y < 400.0:
		staging_y = npc.y + 56.0
	var staging := Vector2(npc.x, staging_y)
	if not await bot.walk_to(staging, 24.0, 36.0):
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
	# Cave placement uses respawnDelay 0, so the boss does not stay dead. A kill
	# is the first wrap from low health back to max (and XP/level follow).
	var lowest := 9999
	var deadline := Time.get_ticks_msec() + 60000
	while Time.get_ticks_msec() < deadline:
		var boss: Dictionary = leader.living_boss()
		if boss.is_empty():
			leader.fail_reason = ""
			return true
		var hp := int(boss.get("health", 0))
		if hp < lowest:
			lowest = hp
		if lowest <= 12 and hp >= 70:
			print("CERT boss_kill wrap lowest=%s hp=%s" % [str(lowest), str(hp)])
			await leader.tree.create_timer(0.8).timeout
			leader.fail_reason = ""
			return true
		if leader.progression_level() >= 2:
			leader.fail_reason = ""
			return true
		if int(leader.player_record(leader.user_id).get("health", 1)) <= 0:
			await leader.tree.create_timer(0.5).timeout
			continue
		var target := Vector2(float(boss.get("x", 0.0)), float(boss.get("y", 0.0)))
		var pos := leader.self_pos()
		if absf(pos.y - 256.0) > 32.0:
			await leader.walk_to(Vector2(clampf(pos.x, 48.0, 560.0), 256.0), 18.0, 8.0)
			leader.fail_reason = ""
			pos = leader.self_pos()
		if pos.distance_to(target) > 28.0:
			await leader.walk_to(Vector2(target.x - 24.0, 256.0), 10.0, 12.0)
			leader.fail_reason = ""
			continue
		await leader.send_input(Vector2.ZERO)
		var enemy_id := String(boss.get("id", "test.enemy.cave_boss:0"))
		var hit: Dictionary = await leader.send_action(MatchProtocol.CLIENT_ATTACK, {"targetId": enemy_id})
		var code := String(hit.get("code", ""))
		if code == "on_cooldown" or code == "rate_limited" or code == "out_of_range" or code == "timeout" or code == "player_dead":
			await leader.tree.create_timer(0.75).timeout
			continue
		if not bool(hit.get("result_ok", false)) and code != "target_dead":
			await leader.tree.create_timer(0.75).timeout
			continue
		await leader.tree.create_timer(0.75).timeout
	if leader.progression_level() >= 2:
		leader.fail_reason = ""
		return true
	var leftover: Dictionary = leader.living_boss()
	if leftover.is_empty():
		leader.fail_reason = ""
		return true
	leader.fail_reason = "boss_timeout pos=%s hp=%s boss=%s boss_hp=%s lowest=%s" % [
		str(leader.self_pos()),
		str(leader.player_record(leader.user_id).get("health", 0)),
		str(Vector2(float(leftover.get("x", 0.0)), float(leftover.get("y", 0.0)))),
		str(leftover.get("health", 0)),
		str(lowest),
	]
	return false


static func _trade_item_and_gold(inviter: SliceSession, invitee: SliceSession, amount: int) -> bool:
	inviter.last_trade = {}
	invitee.last_trade = {}
	var instance_id := inviter.first_instance_id(TRAINING_ID)
	if instance_id.is_empty():
		inviter.fail_reason = "trade_item_missing"
		return false
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
	var offered: Dictionary = await inviter.send_action(
		MatchProtocol.CLIENT_TRADE_SET_OFFER,
		{"tradeId": trade_id, "instanceId": instance_id, "quantity": 1}
	)
	if not bool(offered.get("result_ok", false)):
		inviter.fail_reason = "trade_offer:%s" % String(offered.get("code", "failed"))
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
	if not await inviter.wait_until(
		func() -> bool: return String(inviter.last_trade.get("state", "")) == "completed",
		6.0
	):
		inviter.fail_reason = "trade_not_completed:%s" % String(inviter.last_trade.get("state", ""))
		return false
	if invitee.item_count(TRAINING_ID) < 1:
		inviter.fail_reason = "trade_item_not_received"
		return false
	return true


static func _fail(reason: String) -> Dictionary:
	return {"ok": false, "reason": reason}
