extends GdUnitTestSuite

## Quantity selector and uncommon+ public confirmation for ground drops.


func test_quantity_defaults_to_the_whole_stack() -> void:
	var dialog: GroundDropDialog = auto_free(GroundDropDialog.new())
	add_child(dialog)
	await get_tree().process_frame
	assert_bool(dialog.open_for("inst-cloth", 7, false)).is_true()
	assert_int(dialog.selected_quantity()).is_equal(7)
	assert_bool(dialog._warning.visible).is_false()
	assert_bool(dialog._drop_button.disabled).is_false()


func test_uncommon_requires_public_warning_and_checkbox() -> void:
	var dialog: GroundDropDialog = auto_free(GroundDropDialog.new())
	add_child(dialog)
	await get_tree().process_frame
	assert_bool(dialog.open_for("inst-iron", 1, true)).is_true()
	assert_str(dialog._warning.text).is_equal(GroundDropDialog.PUBLIC_WARNING)
	assert_bool(dialog._warning.visible).is_true()
	assert_bool(dialog._drop_button.disabled).is_true()
	dialog._on_confirm()
	assert_bool(dialog.visible).is_true()
	dialog._confirm_check.button_pressed = true
	dialog._on_confirm_toggled(true)
	assert_bool(dialog._drop_button.disabled).is_false()
