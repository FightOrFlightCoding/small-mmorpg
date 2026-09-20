import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  ITEM_SECURITY_CONTROLS,
  ITEM_SECURITY_REQUIRED_FIELDS,
  itemSecurityControlById,
} from "../src/domain/item_security_catalog";

function repoRoot(): string {
  const candidates = [
    join(__dirname, "..", "..", ".."),
    join(__dirname, "..", ".."),
    join(__dirname, ".."),
  ];
  for (let i = 0; i < candidates.length; i++) {
    if (existsSync(join(candidates[i], "content", "source"))) {
      return candidates[i];
    }
  }
  return candidates[0];
}

function serverRoot(): string {
  const candidates = [join(__dirname, "..", ".."), join(__dirname, "..")];
  for (let i = 0; i < candidates.length; i++) {
    if (existsSync(join(candidates[i], "tests", "inventory.test.ts"))) {
      return candidates[i];
    }
  }
  return candidates[0];
}

const SERVER_ROOT = serverRoot();
const REPO_ROOT = repoRoot();

const REQUIRED_THREATS = [
  "bag_invalid_slot",
  "bag_negative_slot",
  "bag_invalid_quantity",
  "bag_stack_overflow",
  "bag_client_instance_id",
  "bag_foreign_item",
  "bag_locked_item",
  "bag_stale_revision",
  "bag_duplicate_request",
  "bag_rate_flood",
  "bag_unknown_fields",
  "bag_nonfinite",
  "equip_wrong_slot",
  "equip_wrong_class",
  "equip_wrong_level",
  "equip_full_bag_unequip",
  "equip_duplicate_source",
  "equip_stat_injection",
  "corpse_forged_id",
  "corpse_wrong_match",
  "corpse_out_of_range",
  "corpse_private_bypass",
  "corpse_late_party_join",
  "corpse_duplicate_claim",
  "corpse_concurrent_claim",
  "corpse_after_expiry",
  "corpse_public_transition_race",
  "corpse_gold_replay",
  "corpse_loot_reroll",
  "roll_ineligible",
  "roll_duplicate_choice",
  "roll_choice_change",
  "roll_late_choice",
  "roll_client_number",
  "roll_client_winner",
  "roll_result_replay",
  "roll_public_before_resolution",
  "roll_pending_theft",
  "merchant_price_spoof",
  "merchant_qty_overflow",
  "merchant_fake_stock",
  "merchant_invalid_session",
  "merchant_duplicate_purchase",
  "merchant_gold_underflow",
  "merchant_stale_inventory",
  "ground_arbitrary_coord",
  "ground_distant_drop",
  "ground_drop_locked",
  "ground_duplicate_entity",
  "ground_concurrent_pickup",
  "ground_after_expiry",
  "ground_public_race",
  "ground_drop_interrupt",
  "trade_foreign",
  "trade_twenty_first",
  "trade_invalid_quantity",
  "trade_revision_race",
  "trade_acceptance_race",
  "trade_item_mutation",
  "trade_gold_mutation",
  "trade_duplicate_commit",
  "trade_disconnect_commit",
  "trade_range_zone",
  "trade_lock_leak",
  "quest_client_grant",
  "quest_duplicate_event",
  "quest_count_injection",
  "quest_partial_reward",
  "quest_unrecoverable_source",
  "recovery_silent_delete",
];

test("every ITEM-11 threat has the nine required controls and mapped tests", () => {
  const ids: { [id: string]: number } = {};
  for (let i = 0; i < ITEM_SECURITY_CONTROLS.length; i++) {
    const row = ITEM_SECURITY_CONTROLS[i];
    assert.equal(ids[row.id], undefined, "duplicate control " + row.id);
    ids[row.id] = 1;
    for (let f = 0; f < ITEM_SECURITY_REQUIRED_FIELDS.length; f++) {
      const key = ITEM_SECURITY_REQUIRED_FIELDS[f];
      const value = row[key];
      if (key === "tests") {
        assert.ok(Array.isArray(value) && (value as string[]).length > 0, row.id + " tests");
        continue;
      }
      assert.equal(typeof value, "string", row.id + " " + key);
      assert.ok(String(value).length > 0, row.id + " " + key + " empty");
    }
    const tests = row.tests;
    for (let t = 0; t < tests.length; t++) {
      const name = tests[t];
      const serverPath = join(SERVER_ROOT, "tests", name);
      const toolsPath = join(REPO_ROOT, "tools", "content-build", "tests", name);
      assert.ok(existsSync(serverPath) || existsSync(toolsPath), row.id + " missing test file " + name);
    }
  }
  for (let r = 0; r < REQUIRED_THREATS.length; r++) {
    assert.ok(itemSecurityControlById(REQUIRED_THREATS[r]) !== null, "missing " + REQUIRED_THREATS[r]);
  }
});
