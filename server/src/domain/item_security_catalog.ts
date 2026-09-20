/** ITEM-11 security matrix. Every live item operation has the nine required controls. */

export interface ItemSecurityControl {
  id: string;
  category: string;
  threat: string;
  validation: string;
  rateLimit: string;
  payloadLimit: string;
  idempotency: string;
  lockRule: string;
  expectedRejection: string;
  auditEvent: string;
  tests: string[];
}

const MATCH = "2048-byte match body";
const INV = "inventory 8/10 ticks";
const EQUIP = "equip 8/10 ticks";
const PICKUP = "pickup 8/10 ticks";
const VENDOR = "vendor 8/10 ticks";
const TRADE = "trade 8/10 ticks";
const QUEST = "quest 8/10 ticks";
const GM = "gm_command RPC; allowlist only";
const NONE = "none (reject before mutate)";
const REQ = "requestId journal / mutationByRequestId";
const TRADE_ID = "tradeId + requestId; completed replay";
const CORP_REQ = "corpse claimByRequestId";
const ROLL_REQ = "roll requestId; one final choice";
const GRANT_EVT = "grant eventId journal";
const TURN_IN = "quest turn-in requestId + multiUpdate";

function row(
  id: string,
  category: string,
  threat: string,
  validation: string,
  rateLimit: string,
  payloadLimit: string,
  idempotency: string,
  lockRule: string,
  expectedRejection: string,
  auditEvent: string,
  tests: string[],
): ItemSecurityControl {
  return {
    id: id,
    category: category,
    threat: threat,
    validation: validation,
    rateLimit: rateLimit,
    payloadLimit: payloadLimit,
    idempotency: idempotency,
    lockRule: lockRule,
    expectedRejection: expectedRejection,
    auditEvent: auditEvent,
    tests: tests,
  };
}

export const ITEM_SECURITY_CONTROLS: ItemSecurityControl[] = [
  row("bag_invalid_slot", "bag", "Slot index outside 0–29", "toSlotIndex integer in 0..capacity-1", INV, MATCH, REQ, "Locked stacks immovable", "invalid_slot", "item_move fail", ["inventory.test.ts", "item_security.test.ts"]),
  row("bag_negative_slot", "bag", "Negative slot", "Finite integer; negatives rejected", INV, MATCH, REQ, NONE, "invalid_slot", "item_move fail", ["item_security.test.ts"]),
  row("bag_invalid_quantity", "bag", "Quantity 0 / non-integer", "Finite integer 1..stack", INV, MATCH, REQ, NONE, "invalid_quantity / invalid_amount", "item_split fail", ["inventory.test.ts", "item_security.test.ts"]),
  row("bag_stack_overflow", "bag", "Quantity above maxStack", "Split at maxStack; never overstack", INV, MATCH, REQ, NONE, "inventory_full (no overstack)", "item_acquire", ["inventory.test.ts", "item_model.test.ts"]),
  row("bag_client_instance_id", "bag", "Client-created instance id on pickup/grant", "PICKUP instanceId is stat_injection; server uuidv4", PICKUP, MATCH, REQ, NONE, "stat_injection:instanceId", "none", ["security.test.ts", "item_security.test.ts"]),
  row("bag_foreign_item", "bag", "Mutate another character's instance", "findItem on that inventory only", INV, MATCH, REQ, NONE, "item_not_owned / item_not_found", "item_move fail", ["inventory.test.ts", "item_security.test.ts"]),
  row("bag_locked_item", "bag", "Move/split/destroy a locked stack", "isItemLocked / stackIsImmovable", INV, MATCH, REQ, "Whole stack immovable while lock live", "item_locked", "item_move fail", ["equipment.test.ts", "trade.test.ts", "item_txn.test.ts"]),
  row("bag_stale_revision", "bag", "Stale expectedRevision", "Optional; mismatch → no mutate + FULL_STATE", INV, MATCH, "inventory_stale is not terminal", NONE, "inventory_stale", "none", ["inventory.test.ts", "item_txn.test.ts"]),
  row("bag_duplicate_request", "bag", "Replay successful requestId", "mutationByRequestId / journal", INV, MATCH, REQ, NONE, "replay ok; no second mutate", "original audit only", ["inventory.test.ts", "item_txn.test.ts"]),
  row("bag_rate_flood", "bag", "Excessive inventory opcodes", "ACTION_LIMITS.inventory 8/10 ticks", INV, MATCH, NONE, NONE, "rate_limited", "none", ["security.test.ts", "item_security.test.ts"]),
  row("bag_unknown_fields", "bag", "Unknown JSON keys", "Strict parse", INV, MATCH, NONE, NONE, "unknown_field:<key>", "none", ["protocol.test.ts", "item_security.test.ts"]),
  row("bag_nonfinite", "bag", "NaN / Infinity slot or quantity", "isFinite integer checks", INV, MATCH, NONE, NONE, "invalid_slot / invalid_amount", "none", ["fuzz.test.ts", "item_security.test.ts"]),
  row("equip_wrong_slot", "equipment", "Equip into a tag the item lacks", "equipmentSlotTags vs slot", EQUIP, MATCH, REQ, "EQUIPMENT_TRANSITION during plan", "invalid_slot / incompatible", "equipment", ["equipment.test.ts"]),
  row("equip_wrong_class", "equipment", "Class-gated gear on another class", "classRequirements", EQUIP, MATCH, REQ, NONE, "class_requirement", "equipment fail", ["equipment.test.ts"]),
  row("equip_wrong_level", "equipment", "Below levelRequirement", "Server progression level", EQUIP, MATCH, REQ, NONE, "level_requirement", "equipment fail", ["equipment.test.ts"]),
  row("equip_full_bag_unequip", "equipment", "Unequip with no free bag slot", "planCapacity equipment-to-bag", EQUIP, MATCH, REQ, "Stay equipped", "inventory_full", "none", ["equipment.test.ts", "item_model.test.ts"]),
  row("equip_duplicate_source", "equipment", "Two sources into one unique slot", "uniquePolicy + occupied slot swap", EQUIP, MATCH, REQ, NONE, "already_equipped / unique", "equipment", ["equipment.test.ts"]),
  row("equip_stat_injection", "equipment", "Client attackBonus / stats", "OUTCOME_KEYS; derived from instances", EQUIP, MATCH, NONE, NONE, "stat_injection:attackBonus / stats", "none", ["protocol.test.ts", "item_security.test.ts"]),
  row("corpse_forged_id", "corpse", "Forged corpseId", "Live match corpses index", PICKUP, MATCH, CORP_REQ, NONE, "invalid_target", "none", ["corpse.test.ts", "item_security.test.ts"]),
  row("corpse_wrong_match", "corpse", "Corpse id from another match", "Match-local list only", PICKUP, MATCH, NONE, NONE, "invalid_target", "none", ["item_security.test.ts"]),
  row("corpse_out_of_range", "corpse", "Claim from across the map", "pickupRange Euclidean", PICKUP, MATCH, CORP_REQ, NONE, "out_of_range", "none", ["corpse.test.ts"]),
  row("corpse_private_bypass", "corpse", "Non-roster loot during private window", "tag + roster + privateUntilTick", PICKUP, MATCH, CORP_REQ, NONE, "not_eligible", "none", ["corpse.test.ts"]),
  row("corpse_late_party_join", "corpse", "Join party after tag for loot rights", "Immutable encounter roster", PICKUP, MATCH, NONE, NONE, "not_eligible", "none", ["enemy_tag.test.ts", "corpse.test.ts"]),
  row("corpse_duplicate_claim", "corpse", "Replay claim requestId", "claimByRequestId", PICKUP, MATCH, CORP_REQ, "LOOT_CLAIM in flight", "replay; no second grant", "loot", ["corpse.test.ts"]),
  row("corpse_concurrent_claim", "corpse", "Two players claim one entry", "One reservation", PICKUP, MATCH, CORP_REQ, "LOOT_CLAIM", "loot_item_no_longer_available", "loot", ["corpse.test.ts", "item_concurrency.test.ts"]),
  row("corpse_after_expiry", "corpse", "Loot after five minutes", "expiresAtTick; corpse removed", PICKUP, MATCH, NONE, NONE, "invalid_target", "corpse_removed", ["corpse.test.ts"]),
  row("corpse_public_transition_race", "corpse", "Claim interleaved with 60s public", "tick: resolve rolls then public then claims", PICKUP, MATCH, CORP_REQ, NONE, "roll_pending / not_eligible / ok", "loot / loot_roll", ["loot_roll.test.ts", "item_concurrency.test.ts"]),
  row("corpse_gold_replay", "corpse", "Replay gold claim", "Exactly-once per corpse share", PICKUP, MATCH, CORP_REQ, NONE, "replay; gold once", "loot", ["corpse.test.ts"]),
  row("corpse_loot_reroll", "corpse", "Open corpse to regenerate loot", "Loot generated once at death", PICKUP, MATCH, NONE, NONE, "open does not reroll", "none", ["corpse.test.ts", "item_repository_audit.test.ts"]),
  row("roll_ineligible", "need_greed", "Ineligible roller", "deathEligibleRoster only", PICKUP, MATCH, ROLL_REQ, NONE, "not_eligible", "none", ["loot_roll.test.ts"]),
  row("roll_duplicate_choice", "need_greed", "Duplicate choice requestId", "One accepted final choice", PICKUP, MATCH, ROLL_REQ, NONE, "replay original", "loot_roll", ["loot_roll.test.ts"]),
  row("roll_choice_change", "need_greed", "Change Need/Greed/Pass after submit", "First accepted choice sticks", PICKUP, MATCH, ROLL_REQ, NONE, "already_chosen / replay", "none", ["loot_roll.test.ts"]),
  row("roll_late_choice", "need_greed", "Choice after 60s deadline", "Missing → Pass; late rejected", PICKUP, MATCH, ROLL_REQ, NONE, "roll_closed / not_eligible", "loot_roll", ["loot_roll.test.ts"]),
  row("roll_client_number", "need_greed", "Client roll integer", "stat_injection:roll; server 1–100", PICKUP, MATCH, NONE, NONE, "stat_injection:roll", "none", ["loot_roll.test.ts", "item_security.test.ts"]),
  row("roll_client_winner", "need_greed", "Client nominates winner", "No winner field; server resolve", PICKUP, MATCH, NONE, NONE, "unknown_field:winner / stat_injection", "none", ["protocol.test.ts", "item_security.test.ts"]),
  row("roll_result_replay", "need_greed", "Replay award request", "Award journal / pending pickup", PICKUP, MATCH, ROLL_REQ, "ROLL_AWARD", "replay; no second grant", "loot", ["loot_roll.test.ts"]),
  row("roll_public_before_resolution", "need_greed", "Public claim before rolls resolve", "ROLL_PENDING rejects until resolve", PICKUP, MATCH, NONE, NONE, "roll_pending", "none", ["loot_roll.test.ts"]),
  row("roll_pending_theft", "need_greed", "Non-winner takes pending award", "Winner-only AWARDED_PENDING_PICKUP", PICKUP, MATCH, CORP_REQ, "ROLL_AWARD", "not_eligible", "none", ["loot_roll.test.ts"]),
  row("merchant_price_spoof", "merchant", "Client price/gold on buy", "unknown_field:price; stat_injection:gold", VENDOR, MATCH, REQ, NONE, "unknown_field:price / stat_injection:gold", "none", ["npc_vendor.test.ts", "vendor.test.ts"]),
  row("merchant_qty_overflow", "merchant", "Quantity > 99 or overflow", "VENDOR_MAX_QUANTITY 1–99 finite", VENDOR, MATCH, REQ, NONE, "invalid_amount", "none", ["npc_vendor.test.ts"]),
  row("merchant_fake_stock", "merchant", "Unauthored stockEntryId / itemId", "Vendor catalog only", VENDOR, MATCH, REQ, NONE, "invalid_id", "none", ["npc_vendor.test.ts"]),
  row("merchant_invalid_session", "merchant", "Forged/expired/foreign session", "Live interactionSessionId owner", VENDOR, MATCH, REQ, NONE, "invalid_session / session_expired", "none", ["npc_security.test.ts", "npc_vendor.test.ts"]),
  row("merchant_duplicate_purchase", "merchant", "Replay buy requestId", "mutationByRequestId", VENDOR, MATCH, REQ, NONE, "replay; gold/items once", "vendor", ["npc_vendor.test.ts", "vendor.test.ts"]),
  row("merchant_gold_underflow", "merchant", "Buy without gold", "Spendable balance vs server price", VENDOR, MATCH, REQ, NONE, "insufficient_gold", "none", ["vendor.test.ts"]),
  row("merchant_stale_inventory", "merchant", "Stale bag revision on buy", "expectedRevision", VENDOR, MATCH, "not terminal", NONE, "inventory_stale", "none", ["npc_vendor.test.ts"]),
  row("ground_arbitrary_coord", "ground", "Client x/y drop coordinate", "stat_injection:x / y; server placeGroundDrop", INV, MATCH, REQ, "DROP_INTENT", "stat_injection:x", "none", ["ground_item.test.ts", "item_security.test.ts"]),
  row("ground_distant_drop", "ground", "Hint that would place through walls/out of bounds", "Server pose + hint + walkable", INV, MATCH, REQ, "DROP_INTENT", "clamped / invalid placement", "item_drop", ["ground_item.test.ts"]),
  row("ground_drop_locked", "ground", "Drop a locked stack", "stackIsImmovable", INV, MATCH, REQ, "Existing lock wins", "item_locked", "none", ["ground_item.test.ts"]),
  row("ground_duplicate_entity", "ground", "Replay drop to spawn twice", "executeDropIntent journal", INV, MATCH, REQ, "DROP_INTENT until spawn", "replay; one entity", "item_drop", ["ground_item.test.ts"]),
  row("ground_concurrent_pickup", "ground", "Two pickups of one entity", "First claimant; others unavailable", PICKUP, MATCH, REQ, "LOOT_CLAIM", "ground_item_no_longer_available", "item_acquire", ["ground_item.test.ts", "item_concurrency.test.ts"]),
  row("ground_after_expiry", "ground", "Pickup after five minutes", "expiresAtTick; entity removed", PICKUP, MATCH, NONE, NONE, "invalid_target / ground_item_no_longer_available", "ground_item_removed", ["ground_item.test.ts"]),
  row("ground_public_race", "ground", "Simultaneous public pickup", "Single-winner reservation", PICKUP, MATCH, REQ, "LOOT_CLAIM", "one ok; others unavailable", "item_acquire", ["ground_item.test.ts", "item_concurrency.test.ts"]),
  row("ground_drop_interrupt", "ground", "COMMITTING drop without entity", "Compensate bag/overflow; no spawn", INV, MATCH, REQ, "DROP_INTENT released", "compensated; no duplicate", "item_drop", ["ground_item.test.ts", "item_txn.test.ts"]),
  row("trade_foreign", "trade", "Act on another pair's tradeId", "Participants only", TRADE, MATCH, TRADE_ID, NONE, "invalid_trade / not_participant", "none", ["trade.test.ts", "item_security.test.ts"]),
  row("trade_twenty_first", "trade", "21st offer stack", "TRADE_OFFER_SLOTS 20", TRADE, MATCH, TRADE_ID, NONE, "offer_full", "none", ["trade.test.ts"]),
  row("trade_invalid_quantity", "trade", "Offer qty 0 / above stack", "1..stack finite integer", TRADE, MATCH, TRADE_ID, "TRADE lock on source", "invalid_quantity", "none", ["trade.test.ts"]),
  row("trade_revision_race", "trade", "Accept stale revision", "revision must match", TRADE, MATCH, TRADE_ID, "Locks held", "revision_mismatch", "none", ["trade.test.ts"]),
  row("trade_acceptance_race", "trade", "Simultaneous accept of different revisions", "Both must accept current revision", TRADE, MATCH, TRADE_ID, "Locks held until commit/cancel", "revision_mismatch / not both accepted", "none", ["trade.test.ts", "item_concurrency.test.ts"]),
  row("trade_item_mutation", "trade", "Bag mutation while trade open", "Capacity-relevant mutation bumps revision, clears accept", TRADE, MATCH, TRADE_ID, "Offer locks remain", "The trade has changed", "none", ["trade.test.ts"]),
  row("trade_gold_mutation", "trade", "Gold spend while gold offered", "Reserved gold; commit revalidates", TRADE, MATCH, TRADE_ID, "Gold reserved not transferred", "insufficient_gold at commit", "none", ["trade.test.ts"]),
  row("trade_duplicate_commit", "trade", "Replay commit requestId", "Completed + requestId", TRADE, MATCH, TRADE_ID, "Locks released after success", "replay; no second transfer", "trade", ["trade.test.ts"]),
  row("trade_disconnect_commit", "trade", "Disconnect during committing", "Snapshot retry; no duplicate", TRADE, MATCH, TRADE_ID, "Locks held until recover", "recover once", "trade", ["trade.test.ts"]),
  row("trade_range_zone", "trade", "Trade across range or after transfer", "TRADE_RANGE_PX; same match; transfer cancels", TRADE, MATCH, TRADE_ID, "Locks released on cancel", "out_of_range / cancelled", "none", ["trade.test.ts"]),
  row("trade_lock_leak", "trade", "Cancel/complete leaves TRADE locks", "clearLocksByLockId; TTL; orphan scan", TRADE, MATCH, TRADE_ID, "Must release", "no leftover lock", "item_recovery", ["trade.test.ts", "item_recovery.test.ts"]),
  row("quest_client_grant", "quest_source", "Client generic grant opcode", "No player grant opcode; grantItemFromSource trusted-server", QUEST, MATCH, NONE, NONE, "unknown_opcode / unknown_field", "none", ["protocol.test.ts", "item_grant.test.ts", "item_security.test.ts"]),
  row("quest_duplicate_event", "quest_source", "Duplicate grant eventId", "journalByRequestId[eventId]", GM, MATCH, GRANT_EVT, NONE, "replay; no second grant", "item_grant", ["item_grant.test.ts"]),
  row("quest_count_injection", "quest_source", "Client objective current/required", "Server possession recount", QUEST, MATCH, NONE, NONE, "unknown_field / stat_injection", "none", ["item_security.test.ts", "quest.test.ts"]),
  row("quest_partial_reward", "quest_source", "Consume then fail reward capacity", "planCapacity consume+rewards first", QUEST, MATCH, TURN_IN, "QUEST_TURN_IN", "inventory_full; no consume/XP/gold/complete", "none", ["item_quest.test.ts", "quest_reward.test.ts"]),
  row("quest_unrecoverable_source", "quest_source", "Production consume of one-time quest item", "itemReacquisition repeatable source required", "content build", "n/a", "n/a", NONE, "missing_reacquisition / unrecoverable_quest_item", "content validate", ["content-build.test.ts"]),
  row("recovery_silent_delete", "recovery", "Repair deletes unexplained items", "Scan reports; missing defs are report-only", GM, "gm_command payload", "requestId audit", "ADMIN_REPAIR only on safe repairs", "items preserved", "gm_audit + item_recovery", ["item_recovery.test.ts"]),
];

export function itemSecurityControlById(id: string): ItemSecurityControl | null {
  for (let i = 0; i < ITEM_SECURITY_CONTROLS.length; i++) {
    if (ITEM_SECURITY_CONTROLS[i].id === id) {
      return ITEM_SECURITY_CONTROLS[i];
    }
  }
  return null;
}

export const ITEM_SECURITY_REQUIRED_FIELDS: Array<keyof ItemSecurityControl> = [
  "id",
  "category",
  "threat",
  "validation",
  "rateLimit",
  "payloadLimit",
  "idempotency",
  "lockRule",
  "expectedRejection",
  "auditEvent",
  "tests",
];
