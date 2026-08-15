extends GdUnitTestSuite

## Content lookup, missing IDs, and hash exposure.


func before_test() -> void:
	SceneRouter.reset_for_tests()
	AppState.reset_for_tests()


func test_lookup_by_stable_id() -> void:
	var catalog := ContentCatalog.new()
	var text := FileAccess.get_file_as_string(ContentRegistry.DEFAULT_BUNDLE_PATH)
	assert_bool(catalog.parse_text(text)).is_true()
	var item: Dictionary = catalog.get_by_id("item.training_sword")
	assert_str(str(item.get("id", ""))).is_equal("item.training_sword")
	assert_str(str(item.get("equipSlot", ""))).is_equal("main_hand")
	assert_bool(catalog.has_id("zone.starter")).is_true()
	assert_bool(catalog.has_id("quest.slime_problem")).is_true()


func test_missing_id_returns_empty() -> void:
	var catalog := ContentCatalog.new()
	var text := FileAccess.get_file_as_string(ContentRegistry.DEFAULT_BUNDLE_PATH)
	assert_bool(catalog.parse_text(text)).is_true()
	assert_bool(catalog.has_id("item.does_not_exist")).is_false()
	var missing: Dictionary = catalog.get_by_id("item.does_not_exist")
	assert_int(missing.size()).is_equal(0)


func test_content_hash_is_exposed() -> void:
	assert_bool(ContentRegistry.load_bundle()).is_true()
	var hash := ContentRegistry.get_content_hash()
	assert_int(hash.length()).is_equal(64)
	assert_str(hash).is_equal("3db1de356fc85fb6eb96489ddc04f47049b906ef915d2baa241cae38159a6e85")
	assert_int(ContentRegistry.get_schema_version()).is_equal(1)
