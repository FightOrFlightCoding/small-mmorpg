extends GdUnitTestSuite

## Debug-only e2e hooks must not run without the flag.


func before_test() -> void:
	SceneRouter.reset_for_tests()
	AppState.reset_for_tests()
	assert_bool(ContentRegistry.load_bundle()).is_true()


func test_e2e_flag_is_required() -> void:
	assert_bool(SliceJourney.cmdline_enabled(PackedStringArray())).is_false()
	assert_bool(SliceJourney.cmdline_enabled(PackedStringArray(["--dev-user=alice"]))).is_false()
	assert_bool(SliceJourney.cmdline_enabled(PackedStringArray([SliceJourney.FLAG]))).is_true()
	assert_bool(SliceJourney.can_run(PackedStringArray(["--dev-user=alice"]))).is_false()
	if OS.is_debug_build():
		assert_bool(SliceJourney.can_run(PackedStringArray([SliceJourney.FLAG]))).is_true()


func test_cert_five_flag_is_required() -> void:
	assert_bool(CertJourney.cmdline_enabled(PackedStringArray())).is_false()
	assert_bool(CertJourney.cmdline_enabled(PackedStringArray(["--e2e-slice"]))).is_false()
	assert_bool(CertJourney.cmdline_enabled(PackedStringArray([CertJourney.FLAG]))).is_true()
	assert_bool(CertJourney.can_run(PackedStringArray(["--e2e-slice"]))).is_false()
	if OS.is_debug_build():
		assert_bool(CertJourney.can_run(PackedStringArray([CertJourney.FLAG]))).is_true()


func test_approach_point_stays_off_the_target() -> void:
	var elder := Vector2(160.0, 320.0)
	var from := Vector2(240.0, 384.0)
	var point := SliceJourney.approach_point(from, elder, 36.0)
	assert_float(point.distance_to(elder)).is_equal_approx(36.0, 0.01)
	assert_bool(point.x > 176.0).is_true()
