export interface SecurityControl {
  id: string;
  category: string;
  threat: string;
  validation: string;
  rateLimit: string;
  payloadLimit: string;
  idempotency: string;
  rejection: string;
  tests: string[];
}

function row(
  id: string,
  category: string,
  threat: string,
  validation: string,
  rateLimit: string,
  payloadLimit: string,
  idempotency: string,
  rejection: string,
  tests: string[],
): SecurityControl {
  return {
    id: id,
    category: category,
    threat: threat,
    validation: validation,
    rateLimit: rateLimit,
    payloadLimit: payloadLimit,
    idempotency: idempotency,
    rejection: rejection,
    tests: tests,
  };
}

const MATCH = "2048-byte match body; 24 msgs/tick";
const RPC = "Nakama RPC envelope; party 8/2s";
const AUTH = "auth 5/10s per identity";
const CHAT = "chat 4/2s; 200 chars";

export const SECURITY_CONTROLS: SecurityControl[] = [
  row("registration_spam", "accounts", "Flood email/device create", "Authenticate before-hook; production registration closed", AUTH, "Nakama account payload", "Repeated creates after limit rejected", "rate_limited / registration_disabled", ["auth_hooks.test.ts", "auth_privacy.test.ts"]),
  row("login_error_leakage", "accounts", "Distinguish unknown email vs bad password", "sanitizeAuthFailure maps both to invalid_credentials when create=false", AUTH, "n/a", "n/a", "invalid_credentials", ["auth_privacy.test.ts", "auth_privacy_test.gd"]),
  row("foreign_character_selection", "accounts", "Select another account's character", "Roster ownership + ticket character/user match", "select RPC not match-limited", RPC, "Tickets one-use", "selection_foreign / character_missing", ["character_lifecycle.test.ts", "match.test.ts"]),
  row("forged_character_ticket", "accounts", "Fabricate selectionTicket", "Server-issued ticket, TTL 300s, consumed on join", "join not match-limited", "join metadata strings", "Reuse is selection_invalidated", "selection_invalidated / selection_expired", ["character_lifecycle.test.ts"]),
  row("duplicate_name_reservation", "accounts", "Two accounts claim Alice", "Canonical name reservation OCC", "create RPC", RPC, "Loser is name_taken", "name_taken", ["character_lifecycle.test.ts"]),
  row("deleted_character_use", "accounts", "Select or join a soft-deleted slot", "Soft-delete flags roster; select rejects", "select RPC", RPC, "n/a", "character_deleted", ["character_lifecycle.test.ts"]),
  row("xp_injection", "progression", "Client sends xp/level/currentXp", "Outcome keys are stat_injection; grants only trusted events", "allocate 8/10 ticks", MATCH, "XP eventId unique", "stat_injection:xp", ["progression.test.ts", "protocol.test.ts", "xp_hooks.test.ts", "security.test.ts"]),
  row("level_injection", "progression", "Client sets level", "No client level field; level from curves", "allocate 8/10 ticks", MATCH, "n/a", "stat_injection:level", ["progression.test.ts", "protocol.test.ts"]),
  row("attribute_overspending", "progression", "Spend more points than unspent", "allocateAttributes checks amount and pool", "allocate 8/10 ticks", MATCH, "requestId replay", "insufficient_points / invalid_amount", ["progression.test.ts"]),
  row("skill_point_overspending", "progression", "Unlock with too few skill points", "unlockAbility checks unspentSkillPoints vs cost", "allocate 8/10 ticks", MATCH, "requestId replay", "insufficient_points", ["ability.test.ts"]),
  row("ability_unlock_bypass", "progression", "Use or hotbar a locked ability", "Server unlock list; hotbar is not ownership", "attack/allocate 8/10 ticks", MATCH, "n/a", "ability_locked", ["ability.test.ts", "protocol.test.ts"]),
  row("position_spoofing", "combat", "Send x/y as movement", "INPUT is axes+seq only", "input 20/10 ticks", MATCH, "stale seq ignored", "stat_injection:x", ["security.test.ts", "protocol.test.ts", "movement.test.ts"]),
  row("speed_hacking", "combat", "Oversized axis or implied teleport", "Server dt and moveSpeed; clamp unit vector", "input 20/10 ticks", MATCH, "n/a", "Applied speed matches content", ["movement.test.ts", "security.test.ts"]),
  row("target_spoofing", "combat", "Attack unknown or foreign IDs", "Match entity indexes", "attack 8/10 ticks", MATCH, "n/a", "invalid_target", ["combat.test.ts", "targeting.test.ts", "security.test.ts"]),
  row("range_bypass", "combat", "Hit from across the map", "Server Euclidean range", "attack 8/10 ticks", MATCH, "n/a", "out_of_range", ["combat.test.ts", "ability.test.ts", "security.test.ts"]),
  row("cooldown_bypass", "combat", "Fire faster than ICD/GCD", "Server cooldown clocks", "attack 8/10 ticks", MATCH, "duplicate requestId no second hit", "on_cooldown / on_global_cooldown", ["combat.test.ts", "ability.test.ts", "security.test.ts"]),
  row("resource_bypass", "combat", "Cast without mana/resource", "Server resource pools", "attack 8/10 ticks", MATCH, "n/a", "resource_missing", ["ability.test.ts"]),
  row("damage_spoofing", "combat", "Send damage/health", "Intention only; pipeline owns magnitude", "attack 8/10 ticks", MATCH, "eventId + requestId", "stat_injection:damage", ["combat.test.ts", "ability.test.ts", "protocol.test.ts", "security.test.ts"]),
  row("healing_spoofing", "combat", "Send heal/healing", "heal/healing are stat_injection", "attack 8/10 ticks", MATCH, "eventId", "stat_injection:heal", ["protocol.test.ts", "combat_pipeline.test.ts", "security.test.ts", "fuzz.test.ts"]),
  row("dead_character_actions", "combat", "Move/attack/loot/equip while dead", "Health check except RELEASE_RESPAWN", "per opcode bucket", MATCH, "n/a", "player_dead", ["combat.test.ts", "combat_pipeline.test.ts", "security.test.ts"]),
  row("pvp_attempts", "combat", "Damage another player", "Living players friendly; PvP off", "attack 8/10 ticks", MATCH, "n/a", "pvp_disabled", ["ability.test.ts", "combat_pipeline.test.ts"]),
  row("item_injection", "economy", "Grant opcode or storage write", "No grant opcode; permissionWrite 0", "inventory 8/10 ticks", MATCH, "n/a", "unknown_opcode / permissionWrite 0", ["protocol.test.ts", "inventory.test.ts", "security.test.ts"]),
  row("item_instance_injection", "economy", "Client instanceId on pickup", "instanceId on PICKUP is stat_injection", "pickup 8/10 ticks", MATCH, "Server generates IDs", "stat_injection:instanceId", ["security.test.ts", "protocol.test.ts"]),
  row("stack_overflow", "economy", "Quantity above maxStack", "addOrStackItem splits at maxStack; acceptItemFailureCode", "inventory 8/10 ticks", MATCH, "n/a", "inventory_full (no overstack)", ["inventory.test.ts"]),
  row("duplicate_loot", "economy", "Two pickups of one ground item", "First despawns; requestId replay", "pickup 8/10 ticks", MATCH, "requestId", "invalid_target / replay ok", ["inventory.test.ts", "security.test.ts"]),
  row("duplicate_quest_reward", "economy", "Replay turn-in", "requestId + already_completed", "quest 8/10 ticks", MATCH, "requestId / quest status", "already_completed", ["quest_reward.test.ts", "security.test.ts"]),
  row("negative_gold", "economy", "Negative gold offer or wallet", "amount must be finite >= 0; wallet clamps", "trade/vendor 8/10 ticks", MATCH, "txn requestId", "invalid_amount / insufficient_gold", ["transaction.test.ts", "trade.test.ts", "security.test.ts"]),
  row("vendor_price_spoofing", "economy", "Client price/gold on buy/sell", "price unknown_field; gold stat_injection", "vendor 8/10 ticks", MATCH, "requestId", "unknown_field:price / stat_injection:gold", ["vendor.test.ts", "protocol.test.ts"]),
  row("locked_item_mutation", "economy", "Equip/destroy/sell a locked stack", "lockReason checked", "equip/inventory/vendor 8/10 ticks", MATCH, "n/a", "item_locked", ["equipment.test.ts", "trade.test.ts", "vendor.test.ts"]),
  row("transaction_replay", "economy", "Replay requestId on gold/item txn", "transaction requestId map", "vendor/quest 8/10 ticks", MATCH, "requestId", "replay ok; no second mutate", ["transaction.test.ts", "vendor.test.ts"]),
  row("forged_membership", "parties", "Send members/creditUserIds", "stat_injection; server party record", "party RPC 8/2s", RPC, "n/a", "stat_injection:members", ["party.test.ts", "protocol.test.ts"]),
  row("party_over_capacity", "parties", "Sixth member", "MAX_PARTY_SIZE 5", "party RPC 8/2s", RPC, "n/a", "party_full", ["party.test.ts"]),
  row("unauthorized_kick", "parties", "Non-leader kick", "Leader-only kick/promote/disband", "party RPC 8/2s", RPC, "n/a", "not_leader", ["party.test.ts"]),
  row("group_credit_spoofing", "parties", "Nominate XP/loot recipients", "creditUserIds stat_injection; server eligibility", "attack 8/10 ticks", MATCH, "death eventId", "stat_injection:creditUserIds", ["party_credit_loot.test.ts", "protocol.test.ts"]),
  row("foreign_cave_entry", "parties", "Enter another party's cave", "Ownership + membership + ticket", "cave 8/10 ticks", MATCH, "one-time ticket", "not_cave_member / ticket_wrong_character", ["cave.test.ts"]),
  row("transfer_ticket_replay", "parties", "Reuse consumed ticket", "Tickets consumed on join", "cave 8/10 ticks", MATCH, "one-time", "ticket_reused", ["cave.test.ts"]),
  row("dual_match_presence", "parties", "Join two matches at once", "Canonical location; already_in_match / already_elsewhere", "join", "join metadata", "n/a", "already_in_match / already_elsewhere", ["cave.test.ts", "match.test.ts"]),
  row("rejoin_expired_cave", "parties", "Reconnect after cave gone", "60s grace then public-world fallback", "join", "join metadata", "n/a", "public fallback; no ghost cave", ["cave.test.ts"]),
  row("offer_revision_race", "trading", "Accept stale revision after offer change", "Accept must match current revision; offer bumps revision", "trade 8/10 ticks", MATCH, "revision", "revision_mismatch", ["trade.test.ts"]),
  row("acceptance_race", "trading", "Two accepts of different revisions", "Commit only both accepted current revision", "trade 8/10 ticks", MATCH, "requestId", "revision_mismatch", ["trade.test.ts"]),
  row("item_removal_during_trade", "trading", "Destroy offered stack", "Trade lock blocks destroy/equip/sell", "inventory/trade 8/10 ticks", MATCH, "n/a", "item_locked", ["trade.test.ts"]),
  row("gold_change_during_trade", "trading", "Spend reserved gold", "Reserved gold reduces spendable", "vendor/trade 8/10 ticks", MATCH, "n/a", "insufficient_gold", ["trade.test.ts"]),
  row("duplicate_commit", "trading", "Replay accept after commit", "Completed trade + requestId replay", "trade 8/10 ticks", MATCH, "requestId / completed record", "replay; no second grant", ["trade.test.ts"]),
  row("disconnect_during_commit", "trading", "Crash mid multiUpdate", "committing snapshot recovered", "trade 8/10 ticks", MATCH, "committing retry", "no duplicate items/gold", ["trade.test.ts"]),
  row("zone_transfer_during_trade", "trading", "CAVE_ENTER while open trade", "Transfer cancels open trade; committing recovered", "cave/trade 8/10 ticks", MATCH, "n/a", "trade cancelled; inventories valid", ["trade.test.ts"]),
  row("malformed_json", "protocol", "Broken JSON body", "parseClientMessage", "unknown 8/10 ticks", MATCH, "n/a", "malformed_json", ["protocol.test.ts", "security.test.ts", "fuzz.test.ts"]),
  row("unknown_fields", "protocol", "Extra JSON keys", "Strict allowlists", "per opcode", MATCH, "n/a", "unknown_field:*", ["protocol.test.ts", "security.test.ts", "fuzz.test.ts"]),
  row("unknown_opcode", "protocol", "Opcode 99/grant 50", "isClientOpcode", "unknown 8/10 ticks", MATCH, "n/a", "unknown_opcode", ["protocol.test.ts", "security.test.ts", "fuzz.test.ts"]),
  row("oversized_payload", "protocol", "Huge JSON", "MAX_MATCH_PAYLOAD_BYTES 2048", "24 msgs/tick", MATCH, "n/a", "payload_too_large", ["protocol.test.ts", "security.test.ts", "fuzz.test.ts"]),
  row("nan", "protocol", "NaN axes/amounts", "typeof number && isFinite", "input/trade", MATCH, "n/a", "invalid_input / invalid_amount", ["protocol.test.ts", "security.test.ts", "fuzz.test.ts"]),
  row("infinity", "protocol", "1e999 / Infinity", "isFinite checks", "input/trade", MATCH, "n/a", "invalid_input / invalid_amount", ["protocol.test.ts", "security.test.ts", "fuzz.test.ts"]),
  row("wrong_protocol_version", "protocol", "protocolVersion != 1", "Checked first", "resync/any", MATCH, "n/a", "protocol_mismatch", ["protocol.test.ts", "match.test.ts", "compatibility.test.ts", "fuzz.test.ts"]),
  row("wrong_content_hash", "protocol", "Mismatched catalog hash", "Optional hash must match", "resync/join", MATCH, "n/a", "content_mismatch", ["protocol.test.ts", "compatibility.test.ts", "fuzz.test.ts"]),
  row("resync_abuse", "protocol", "Flood RESYNC_REQUEST", "resync 2/10 ticks", "resync 2/10 ticks", MATCH, "n/a", "rate_limited", ["security.test.ts"]),
  row("chat_abuse", "protocol", "Flood/markup/oversize chat", "JSON {message}; Label no BBCode; 200 chars", CHAT, CHAT, "n/a", "rate_limited / message_too_long / invalid_payload", ["chat.test.ts", "security.test.ts"]),
];

export const REQUIRED_SECURITY_IDS: string[] = [
  "registration_spam",
  "login_error_leakage",
  "foreign_character_selection",
  "forged_character_ticket",
  "duplicate_name_reservation",
  "deleted_character_use",
  "xp_injection",
  "level_injection",
  "attribute_overspending",
  "skill_point_overspending",
  "ability_unlock_bypass",
  "position_spoofing",
  "speed_hacking",
  "target_spoofing",
  "range_bypass",
  "cooldown_bypass",
  "resource_bypass",
  "damage_spoofing",
  "healing_spoofing",
  "dead_character_actions",
  "pvp_attempts",
  "item_injection",
  "item_instance_injection",
  "stack_overflow",
  "duplicate_loot",
  "duplicate_quest_reward",
  "negative_gold",
  "vendor_price_spoofing",
  "locked_item_mutation",
  "transaction_replay",
  "forged_membership",
  "party_over_capacity",
  "unauthorized_kick",
  "group_credit_spoofing",
  "foreign_cave_entry",
  "transfer_ticket_replay",
  "dual_match_presence",
  "rejoin_expired_cave",
  "offer_revision_race",
  "acceptance_race",
  "item_removal_during_trade",
  "gold_change_during_trade",
  "duplicate_commit",
  "disconnect_during_commit",
  "zone_transfer_during_trade",
  "malformed_json",
  "unknown_fields",
  "unknown_opcode",
  "oversized_payload",
  "nan",
  "infinity",
  "wrong_protocol_version",
  "wrong_content_hash",
  "resync_abuse",
  "chat_abuse",
];

export function securityControlById(id: string): SecurityControl | null {
  for (let i = 0; i < SECURITY_CONTROLS.length; i++) {
    if (SECURITY_CONTROLS[i].id === id) {
      return SECURITY_CONTROLS[i];
    }
  }
  return null;
}
