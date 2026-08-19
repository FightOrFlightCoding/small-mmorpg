extends GdUnitTestSuite

## Zone geometry and visual ID mapping.


func before_test() -> void:
	SceneRouter.reset_for_tests()
	AppState.reset_for_tests()
	NetworkService.reset_for_tests()
	TradeService.reset_for_tests()
	PartyService.reset_for_tests()
	assert_bool(ContentRegistry.load_bundle()).is_true()
	ContentRegistry.visuals.load_map()


func test_visual_ids_resolve_from_content() -> void:
	assert_str(ContentRegistry.visual_id_for_content("player.base")).is_equal("visual.player")
	assert_str(ContentRegistry.visual_id_for_content("npc.elder")).is_equal("visual.npc_elder")
	assert_str(ContentRegistry.visual_id_for_content("enemy.green_slime")).is_equal("visual.enemy_green_slime")
	assert_str(ContentRegistry.visual_id_for_content("zone.starter")).is_equal("visual.zone_starter")
	var slime: Dictionary = ContentRegistry.resolve_visual("visual.enemy_green_slime")
	assert_str(slime["visual_id"]).is_equal("visual.enemy_green_slime")
	assert_bool(bool(slime["missing"])).is_false()
	assert_str(slime["texture_path"]).contains("kenney_rpg_base")


func test_loot_uses_item_visual_without_character_set_warning() -> void:
	ContentRegistry.assets.missing_ids = PackedStringArray()
	ContentRegistry.assets.last_warning = ""
	var registry: EntityRegistry = auto_free(EntityRegistry.new())
	add_child(registry)
	registry.apply_full_state({
		"self_id": "user-alice",
		"players": [{"userId": "user-alice", "name": "Alice", "x": 0, "y": 0}],
		"npcs": [],
		"enemies": [],
		"loot": [
			{"id": "loot-gel-1", "itemId": "item.slime_gel", "x": 10, "y": 10},
			{"id": "loot-potion-1", "itemId": "item.test_potion", "x": 20, "y": 10},
			{"id": "loot-blade-1", "itemId": "item.test_relic_blade", "x": 30, "y": 10},
		],
	})
	var gel := registry.get_entity("loot:loot-gel-1") as WorldAvatar
	assert_object(gel).is_not_null()
	assert_bool(gel.used_fallback).is_false()
	assert_bool(ContentRegistry.assets.missing_ids.has("visual_set.item.slime_gel")).is_false()
	assert_bool(ContentRegistry.assets.missing_ids.has("visual_set.item.test_potion")).is_false()
	assert_bool(ContentRegistry.assets.missing_ids.has("visual_set.item.test_relic_blade")).is_false()


func test_missing_visual_id_is_visible_fallback() -> void:
	var visual: Dictionary = ContentRegistry.resolve_visual("visual.unknown")
	assert_bool(bool(visual["missing"])).is_true()
	assert_str(visual["texture_path"]).is_equal("")


func test_zone_view_renders_bounds_floor_collisions_and_spawn() -> void:
	var zone_view: ZoneView = auto_free(ZoneView.new())
	add_child(zone_view)
	zone_view.render_zone(ContentRegistry.get_by_id("zone.starter"))
	assert_object(zone_view.get_node_or_null("Floor")).is_not_null()
	assert_object(zone_view.get_node_or_null("FloorTiles")).is_not_null()
	assert_bool(zone_view.get_node("FloorTiles") is Polygon2D).is_true()
	assert_object(zone_view.get_node_or_null("Bounds")).is_not_null()
	assert_object(zone_view.get_node_or_null("PlayerSpawn")).is_not_null()
	assert_int(zone_view.collision_count()).is_equal(6)


func test_world_and_avatar_scenes_instantiate() -> void:
	var paths: PackedStringArray = PackedStringArray([
		"res://scenes/world/world.tscn",
		"res://scenes/world/player_avatar.tscn",
		"res://scenes/world/npc_avatar.tscn",
		"res://scenes/world/enemy_avatar.tscn",
		"res://scenes/world/loot_avatar.tscn",
		"res://scenes/world/world_hud.tscn",
		"res://scenes/world/entity_registry.tscn",
	])
	for path in paths:
		var scene: PackedScene = load(path)
		assert_object(scene).is_not_null()
		var instance: Node = auto_free(scene.instantiate())
		assert_object(instance).is_not_null()


func test_world_hud_panels_do_not_cover_chat_or_allocate_buttons() -> void:
	var viewport := get_viewport()
	viewport.size = Vector2i(1280, 720)
	var hud: WorldHud = auto_free(preload("res://scenes/world/world_hud.tscn").instantiate())
	var chat: ChatPanel = auto_free(preload("res://scenes/world/chat_panel.tscn").instantiate())
	var overlay: NetDebugOverlay = auto_free(preload("res://scenes/world/net_debug_overlay.tscn").instantiate())
	add_child(hud)
	add_child(chat)
	add_child(overlay)
	await get_tree().process_frame
	assert_int(hud.layer).is_greater(chat.layer)
	var progression: Control = hud.get_node("Root/LeftColumn/Progression")
	var inventory: Control = hud.get_node("Root/Inventory")
	var journal: Control = hud.get_node("Root/Journal")
	var chat_root: Control = chat.get_node("Root")
	var debug_root: Control = overlay.get_node("Root")
	assert_bool(progression.get_global_rect().intersects(chat_root.get_global_rect())).is_false()
	assert_bool(inventory.get_global_rect().intersects(chat_root.get_global_rect())).is_false()
	assert_bool(journal.get_global_rect().intersects(inventory.get_global_rect())).is_false()
	var party: Control = hud.get_node("Root/LeftColumn/Party")
	assert_object(party).is_not_null()
	assert_bool(party.get_global_rect().intersects(chat_root.get_global_rect())).is_false()
	assert_bool(party.get_global_rect().intersects(progression.get_global_rect())).is_false()
	var left_column: Control = hud.get_node("Root/LeftColumn")
	assert_float(left_column.anchor_bottom).is_equal(1.0)
	var trade: Control = hud.get_node("Root/LeftColumn/TradePanel")
	assert_object(trade).is_not_null()
	assert_bool(trade.get_global_rect().intersects(party.get_global_rect())).is_false()
	assert_bool(trade.get_global_rect().intersects(progression.get_global_rect())).is_false()
	assert_bool(trade.get_global_rect().intersects(chat_root.get_global_rect())).is_false()
	assert_bool(trade.get_global_rect().intersects(inventory.get_global_rect())).is_false()
	assert_bool(trade.get_global_rect().intersects(journal.get_global_rect())).is_false()
	viewport.size = Vector2i(1280, 600)
	await get_tree().process_frame
	assert_bool(party.get_global_rect().intersects(progression.get_global_rect())).is_false()
	assert_bool(trade.get_global_rect().intersects(party.get_global_rect())).is_false()
	assert_bool(trade.get_global_rect().intersects(progression.get_global_rect())).is_false()
	assert_bool(left_column.get_global_rect().intersects(chat_root.get_global_rect())).is_false()
	viewport.size = Vector2i(1280, 720)
	var party_chat: Label = hud.get_node("Root/LeftColumn/Party/Margin/Scroll/VBox/ChatScroll/ChatHistory")
	assert_str(party_chat.get_class()).is_equal("Label")
	assert_str(party_chat.get_class()).is_not_equal("RichTextLabel")
	assert_bool(debug_root.get_global_rect().intersects(progression.get_global_rect())).is_false()
	assert_bool(debug_root.get_global_rect().intersects(chat_root.get_global_rect())).is_false()
	assert_int(int(debug_root.mouse_filter)).is_equal(Control.MOUSE_FILTER_IGNORE)


func test_trade_invite_resolves_nearby_character_name() -> void:
	var hud: WorldHud = auto_free(preload("res://scenes/world/world_hud.tscn").instantiate())
	add_child(hud)
	await get_tree().process_frame
	var state := {
		"self_id": "user-alice",
		"players": [
			{"userId": "user-alice", "name": "Alice", "health": 10, "maxHealth": 10},
			{"userId": "user-bob", "name": "Bob", "health": 10, "maxHealth": 10},
		],
	}
	hud.refresh(state, PackedStringArray(["Alice", "Bob"]))
	assert_str(hud.resolve_trade_target_id("Bob", state)).is_equal("user-bob")
	assert_str(hud.resolve_trade_target_id("bob", state)).is_equal("user-bob")
	assert_str(hud.resolve_trade_target_id("Alice", state)).is_equal("")
	assert_str(hud.resolve_trade_target_id("nobody", state)).is_equal("")
	var name_edit: LineEdit = hud.find_child("TradeName", true, false)
	assert_object(name_edit).is_not_null()
	assert_str(name_edit.text).is_equal("Bob")


func test_trade_nearby_lists_far_players_with_distance() -> void:
	var hud: WorldHud = auto_free(preload("res://scenes/world/world_hud.tscn").instantiate())
	add_child(hud)
	await get_tree().process_frame
	var state := {
		"self_id": "user-alice",
		"players": [
			{"userId": "user-alice", "name": "Alice", "health": 10, "x": 0, "y": 0},
			{"userId": "user-bob", "name": "Bob", "health": 10, "x": 400, "y": 0},
		],
	}
	hud.refresh(state, PackedStringArray(["Alice", "Bob"]))
	var nearby: OptionButton = hud.find_child("Nearby", true, false)
	assert_object(nearby).is_not_null()
	assert_int(nearby.item_count).is_equal(2)
	assert_str(nearby.get_item_text(0)).is_equal("Nearby players")
	assert_str(nearby.get_item_text(1)).contains("Bob")
	assert_str(nearby.get_item_text(1)).contains("walk closer")
	assert_str(nearby.get_item_metadata(1)).is_equal("user-bob")
	var name_edit: LineEdit = hud.find_child("TradeName", true, false)
	assert_str(name_edit.text).is_equal("")
	var hint: Label = hud.find_child("Hint", true, false)
	assert_str(hint.text).contains("80")


func test_trade_invitee_hud_labels_accept_invite() -> void:
	var hud: WorldHud = auto_free(preload("res://scenes/world/world_hud.tscn").instantiate())
	add_child(hud)
	await get_tree().process_frame
	AppState.character_view = {"character_id": "char-a", "name": "Alice"}
	TradeService.apply_trade({
		"tradeId": "trade-1",
		"state": "inviting",
		"revision": 0,
		"participantA": {"characterId": "char-b", "displayName": "Bob"},
		"participantB": {"characterId": "char-a", "displayName": "Alice"},
	})
	hud.refresh_trade()
	var status: Label = hud.find_child("TradeStatus", true, false)
	assert_object(status).is_not_null()
	assert_str(status.text).contains("Trade invite from Bob")
	var accept: Button = hud.find_child("TradeAcceptButton", true, false)
	assert_object(accept).is_not_null()
	assert_str(accept.text).is_equal("Accept invite")
	assert_bool(accept.visible).is_true()
	var decline: Button = hud.find_child("TradeDeclineButton", true, false)
	assert_object(decline).is_not_null()
	assert_bool(decline.visible).is_true()


func test_party_invite_prompts_to_create_first() -> void:
	var hud: WorldHud = auto_free(preload("res://scenes/world/world_hud.tscn").instantiate())
	add_child(hud)
	await get_tree().process_frame
	hud._on_party_invite()
	var notice: Label = hud.get_node("Root/Notice")
	assert_str(notice.text).contains("Create a party first")


func test_quit_dialog_offers_safe_and_unsafe_paths() -> void:
	var hud: WorldHud = auto_free(preload("res://scenes/world/world_hud.tscn").instantiate())
	add_child(hud)
	await get_tree().process_frame
	hud.show_quit_dialog(true)
	var overlay: ColorRect = hud.find_child("QuitDialog", true, false)
	assert_object(overlay).is_not_null()
	assert_bool(overlay.visible).is_true()
	var safely: Button = hud.find_child("Quit Safely", true, false)
	if safely == null:
		for child in overlay.find_children("*", "Button", true, false):
			if child is Button and String((child as Button).text) == "Quit Safely":
				safely = child as Button
	assert_object(safely).is_not_null()
	assert_bool(safely.visible).is_true()
	hud.show_quit_dialog(false)
	var body: Label = null
	for child in overlay.find_children("*", "Label", true, false):
		if child is Label and String((child as Label).text).contains("ten seconds"):
			body = child as Label
	assert_object(body).is_not_null()
	var anyway: Button = null
	var cancel: Button = null
	for child in overlay.find_children("*", "Button", true, false):
		if child is Button and String((child as Button).text) == "Quit Anyway":
			anyway = child as Button
		if child is Button and String((child as Button).text) == "Cancel":
			cancel = child as Button
	assert_object(anyway).is_not_null()
	assert_bool(anyway.visible).is_true()
	assert_object(cancel).is_not_null()
	assert_bool(cancel.visible).is_true()
