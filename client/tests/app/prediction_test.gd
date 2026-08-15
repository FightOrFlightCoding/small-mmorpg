extends GdUnitTestSuite

## Pure movement prediction, reconciliation, and snapshot-buffer rules.


func before_test() -> void:
	SceneRouter.reset_for_tests()
	AppState.reset_for_tests()
	NetworkService.reset_for_tests()


func _reconciler() -> MovementReconciler:
	return MovementReconciler.new(MovementSim.new())


func test_no_correction_when_state_agrees() -> void:
	var rec := _reconciler()
	rec.reset(Vector2(400, 400))
	rec.predict(1, Vector2.RIGHT)
	rec.advance(MovementSim.TICK_DT, Vector2.RIGHT)
	var result: Dictionary = rec.reconcile(Vector2(412, 400), 1)
	assert_str(String(result["correction"])).is_equal("none")
	assert_float(float(result["error"])).is_less_equal(MovementReconciler.AGREE_EPSILON)
	assert_vector(result["display"]).is_equal_approx(Vector2(412, 400), Vector2(0.01, 0.01))
	assert_int(int(result["pending"])).is_equal(0)


func test_display_advances_per_frame_instead_of_per_tick() -> void:
	var rec := _reconciler()
	rec.reset(Vector2(400, 400))
	rec.advance(1.0 / 60.0, Vector2.RIGHT)
	var moved := rec.display.x - 400.0
	assert_float(moved).is_equal_approx(120.0 / 60.0, 0.05)
	assert_float(moved).is_less(12.0)
	assert_int(rec.pending_count()).is_equal(0)


func test_acknowledged_input_is_removed() -> void:
	var rec := _reconciler()
	rec.reset(Vector2(400, 400))
	rec.predict(1, Vector2.RIGHT)
	rec.predict(2, Vector2.RIGHT)
	rec.predict(3, Vector2.DOWN)
	rec.reconcile(Vector2(412, 400), 1)
	assert_int(rec.pending_count()).is_equal(2)
	var seqs := rec.pending_seqs()
	assert_int(seqs[0]).is_equal(2)
	assert_int(seqs[1]).is_equal(3)


func test_remaining_input_is_replayed() -> void:
	var rec := _reconciler()
	rec.reset(Vector2(400, 400))
	rec.predict(1, Vector2.RIGHT)
	rec.advance(MovementSim.TICK_DT, Vector2.RIGHT)
	rec.predict(2, Vector2.RIGHT)
	rec.advance(MovementSim.TICK_DT, Vector2.RIGHT)
	var result: Dictionary = rec.reconcile(Vector2(412, 400), 1)
	assert_int(int(result["pending"])).is_equal(1)
	assert_vector(result["predicted"]).is_equal_approx(Vector2(424, 400), Vector2(0.01, 0.01))
	assert_str(String(result["correction"])).is_equal("none")


func test_small_correction_is_smoothed() -> void:
	var rec := _reconciler()
	rec.reset(Vector2(400, 400))
	rec.predict(1, Vector2.RIGHT)
	rec.advance(MovementSim.TICK_DT, Vector2.RIGHT)
	var result: Dictionary = rec.reconcile(Vector2(410, 400), 1)
	assert_str(String(result["correction"])).is_equal("smooth")
	var x := float((result["display"] as Vector2).x)
	assert_float(x).is_greater(410.0)
	assert_float(x).is_less(412.0)
	assert_vector(result["predicted"]).is_equal(Vector2(410, 400))


func test_large_correction_snaps() -> void:
	var rec := _reconciler()
	rec.reset(Vector2(400, 400))
	rec.predict(1, Vector2.RIGHT)
	rec.advance(MovementSim.TICK_DT, Vector2.RIGHT)
	var result: Dictionary = rec.reconcile(Vector2(500, 400), 1)
	assert_str(String(result["correction"])).is_equal("snap")
	assert_float(float(result["error"])).is_greater(MovementReconciler.SNAP_THRESHOLD)
	assert_vector(result["display"]).is_equal(Vector2(500, 400))


func test_old_snapshots_are_rejected() -> void:
	var buffer := SnapshotBuffer.new()
	assert_bool(buffer.push(5, {"user-bob": Vector2(10, 20)})).is_true()
	assert_bool(buffer.push(4, {"user-bob": Vector2(1, 1)})).is_false()
	assert_bool(buffer.push(5, {"user-bob": Vector2(1, 1)})).is_false()
	assert_bool(buffer.push(6, {"user-bob": Vector2(30, 20)})).is_true()
	assert_int(buffer.depth()).is_equal(2)
	assert_int(buffer.latest_tick()).is_equal(6)


func test_remote_sample_interpolates_and_does_not_extrapolate() -> void:
	var buffer := SnapshotBuffer.new()
	buffer.push(10, {"player:user-bob": Vector2(0, 0)})
	buffer.push(11, {"player:user-bob": Vector2(100, 0)})
	var mid: Dictionary = buffer.sample(10.5)
	assert_float((mid["player:user-bob"] as Vector2).x).is_equal_approx(50.0, 0.01)
	var late: Dictionary = buffer.sample(40.0)
	assert_vector(late["player:user-bob"]).is_equal(Vector2(100, 0))
	buffer.frozen = true
	assert_bool(buffer.push(12, {"player:user-bob": Vector2(200, 0)})).is_false()
	assert_int(buffer.depth()).is_equal(2)


func test_render_tick_advances_between_snapshots_without_extrapolating() -> void:
	var buffer := SnapshotBuffer.new()
	buffer.push(11, {"player:user-bob": Vector2(0, 0), "npc:npc.elder": Vector2(160, 320)})
	buffer.push(12, {"player:user-bob": Vector2(100, 0), "npc:npc.elder": Vector2(160, 320)})
	assert_float(buffer.render_tick()).is_equal_approx(11.0, 0.0001)
	buffer.advance(0.04)
	assert_float(buffer.render_tick()).is_equal_approx(11.4, 0.0001)
	var mid: Dictionary = buffer.sample(buffer.render_tick())
	assert_float((mid["player:user-bob"] as Vector2).x).is_equal_approx(40.0, 0.01)
	assert_vector(mid["npc:npc.elder"]).is_equal(Vector2(160, 320))
	buffer.advance(0.20)
	assert_float(buffer.render_tick()).is_equal_approx(12.0, 0.0001)
	assert_vector(buffer.sample(buffer.render_tick())["player:user-bob"]).is_equal(Vector2(100, 0))
	buffer.frozen = true
	var frozen_tick := buffer.render_tick()
	buffer.advance(0.05)
	assert_float(buffer.render_tick()).is_equal(frozen_tick)


func test_debug_overlay_hides_in_release() -> void:
	var overlay: NetDebugOverlay = auto_free(preload("res://scenes/world/net_debug_overlay.tscn").instantiate())
	add_child(overlay)
	await get_tree().process_frame
	overlay.set_debug_build(false)
	assert_bool(overlay.visible).is_false()
	overlay.set_debug_build(true)
	overlay.ping_ms = 42
	overlay.fps = 60
	overlay.frame_ms = 16.6
	overlay.server_tick = 9
	overlay.last_sent_seq = 11
	overlay.last_ack_seq = 8
	overlay.prediction_error = 1.5
	overlay.snapshot_depth = 3
	overlay.protocol_version = 1
	overlay.content_hash_prefix = "3db1de35"
	overlay.refresh()
	assert_bool(overlay.visible).is_true()
	var text := String(overlay.get_node("Root/Panel/Label").text)
	assert_str(text).contains("fps 60 (16.6ms)")
	assert_str(text).contains("ping 42ms")
	assert_str(text).contains("tick 9")
	assert_str(text).contains("sent seq 11")
	assert_str(text).contains("ack seq 8")
	assert_str(text).contains("snap buf 3")
	assert_str(text).contains("proto v1")
	assert_str(text).contains("hash 3db1de35")
