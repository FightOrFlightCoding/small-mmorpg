extends GdUnitTestSuite

## Prompt 35 asset-manifest replacement proof. No gameplay scripts are required.


func before_test() -> void:
	SceneRouter.reset_for_tests()
	AppState.reset_for_tests()


func test_asset_manifest_replacements_do_not_need_gameplay_scripts() -> void:
	var manifest := AssetManifest.new()
	assert_bool(manifest.load_manifest()).is_true()
	var player: Dictionary = manifest.resolve_set_for_content("player.base")
	assert_str(String(player.get("spriteVisualId", ""))).is_equal("visual.class_vanguard")
	var enemy: Dictionary = manifest.resolve_set_for_content("enemy.proof_critter")
	assert_str(String(enemy.get("spriteVisualId", ""))).is_equal("visual.enemy_test_melee")
	var npc: Dictionary = manifest.resolve_set_for_content("npc.proof_giver")
	assert_str(String(npc.get("spriteVisualId", ""))).is_equal("visual.npc_herald")
	assert_str(manifest.icon_visual_id("item", "item.proof_token")).is_equal("visual.item_potion")
	assert_str(manifest.icon_visual_id("ability", "test.ability.small_heal")).is_equal("visual.ability_buff_icon")
	var root: Variant = JSON.parse_string(FileAccess.get_file_as_string("res://content/asset_manifest.json"))
	assert_bool(typeof(root) == TYPE_DICTIONARY).is_true()
	var tilesets: Dictionary = (root as Dictionary).get("tilesets", {})
	assert_str(String(tilesets.get("test.zone.systems_lab", ""))).is_equal("visual.zone_starter")
	var hit: Dictionary = manifest.audio_entry("audio.world.hit")
	assert_str(String(hit.get("stream", ""))).is_equal("res://assets/audio/cert_hit.wav")
	assert_bool(bool(hit.get("missing", true))).is_false()
	assert_bool(ContentRegistry.load_bundle()).is_true()
	assert_bool(ContentRegistry.has_id("item.cert_mail")).is_true()
	assert_bool(ContentRegistry.has_id("quest.cert_scout")).is_true()
