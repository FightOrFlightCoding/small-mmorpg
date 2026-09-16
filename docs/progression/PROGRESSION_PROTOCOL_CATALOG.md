# Progression protocol catalog

PROG-07 allocates opcode **38**. Existing progression/ability traffic stays. The client never sends XP amounts, levels, derived totals, gold costs, talent ranks as facts, or unlock lists.

Related: [PROTOCOL_CATALOG.md](../PROTOCOL_CATALOG.md).

## Current client → server

| Opcode | Name | Intention | Authority |
| --- | --- | --- | --- |
| 9 | `ALLOCATE_ATTRIBUTES` | `{ attributeId? or statId, amount, requestId }` | Production `stat.*` free points, any of the eight stats, no cap; test classes keep Foundation unspent attributes |
| 13 | `USE_ABILITY` | ability id, target, requestId | Ownership, range, resources, CD |
| 14 | `CANCEL_CAST` | requestId | Active cast |
| 15 | `ASSIGN_HOTBAR` | `{ slotIndex, abilityId?, requestId }` | Production: owned active, 4 slots, no duplicates, no passives. Foundation test classes: 8-slot unlock list |
| 16 | `UNLOCK_ABILITY` | `{ abilityId, requestId }` | Foundation skill-point path only. Production `class.*` → `unsupported_class` |
| 33 | `SELECT_BRANCH` | `{ branchId, requestId }` | Level ≥ 5, class roster, unset branch, safe-leave. Grants pending signature/capstone |
| 34 | `SET_AUTO_ASSIGN` | `{ enabled, requestId }` | Flag only; turning on does not spend existing points |
| 35 | `AUTO_ASSIGN_UNSPENT_POINTS` | `{ requestId }` | Spends all current unspent free points on the class template |
| 36 | `ALLOCATE_ATTRIBUTES_BATCH` | `{ allocations, requestId }` | Atomic confirmed multi-stat spend |
| 37 | `TRAINER_RESPEC` | `{ npcId, requestId }` | Trainer `respec` service; gold `50 × level`; refunds eligible points |
| 38 | `PURCHASE_TALENT` | `{ treeId, nodeId, requestedRank, requestId }` | Class/branch pools, tiers, prerequisites, derived ownership |

The client must never send level, XP amounts, derived totals, talent ranks as facts, damage/heal/crit/mana/cooldown outcomes, crit rolls, or respec results.

## Current server → client

| Opcode | Name | Body today |
| --- | --- | --- |
| 111 | `PROGRESSION_STATE` | class, level, XP, attributes, derived, unspent points, pending branch, purchased nodes, optional `events` |
| 112 | `ABILITY_STATE` | unlocked ids, hotbar (4 production / 8 test), `hotbarAssignments`, ranks, resources, cooldowns, cast, effects |
| 101 | `FULL_STATE` | includes progression + abilities |

Ephemeral progression `events` (xp/level/points/unlocks/cap) are included on the `PROGRESSION_STATE` for that grant. They are not storage authority.

GM `reset_attribute_allocation` / `reset_skill_allocation` remain debug/ops, not the player respec. PROG-14 progression GM commands are also `gm_command` only.

## Hotbar validity

Active hotbar length **4**. Auto-attack is not a slot. Frenzy (`ability.warrior.frenzy`) is illegal on the active hotbar. Server rejects extra slots and unknown/unowned ids.

## GM progression commands (`gm_command`)

All of the following share:

| Field | Value |
| --- | --- |
| Direction | Client → server HTTP RPC `gm_command` (debug UI may also signal the live match) |
| Authority | Server allowlist `gm` / `allowlist`. Debug client UI is presentation only. No player opcode sets level or stats. |
| Auth | Nakama session plus allowlist (`enabled` + userId / customId / email) |
| Rate limit | None in-app (same as other GM commands) |
| Audit | Every call writes `gm_audit` |
| Tests | `server/tests/gm.test.ts`, `server/tests/progression_lifecycle.test.ts`, `client/tests/app/gm_service_test.gd` |

### `inspect_progression`

| Field | Value |
| --- | --- |
| Request | `{ command: "inspect_progression", reason, characterId, requestId? }` |
| Response | `{ ok, code, result }` where `result` is the `progressionExport` snapshot |
| Idempotency | Read-only |
| Errors | `progression_missing`, plus shared GM errors |

### `grant_xp_event`

| Field | Value |
| --- | --- |
| Request | `{ command: "grant_xp_event", reason, characterId, requestId, eventId, amount }` |
| Response | `{ ok, code, result: { amount, replay, levelsGained, eventId, level, xpIntoLevel } }` |
| Idempotency | Duplicate `eventId` replays; does not grant twice |
| Errors | `invalid_event`, `invalid_amount`, `progression_missing` |

### `grant_exact_test_xp`

| Field | Value |
| --- | --- |
| Request | `{ command: "grant_exact_test_xp", reason, characterId, requestId, amount }` |
| Response | Same shape as `grant_xp_event` |
| Idempotency | Event id `gm-exact:<requestId>` |
| Errors | `invalid_amount`, `progression_missing` |

### `grant_test_gold`

Existing Foundation GM command. `{ amount }` gold delta, audited, not a player wallet opcode.

### `reset_progression_fixture`

| Field | Value |
| --- | --- |
| Request | `{ command: "reset_progression_fixture", reason, characterId, requestId, fixtureId? }` |
| Response | `{ ok, code, result }` snapshot of canonical level 1 plus `fixtureId` |
| Idempotency | Each call rewrites to the named fixture (`canonical_level_1` / `level1`). Unknown `fixtureId` is `invalid_fixture` |
| Errors | `invalid_fixture`, `progression_missing` |

### `set_auto_assign`

| Field | Value |
| --- | --- |
| Request | `{ command: "set_auto_assign", reason, characterId, requestId, enabled }` |
| Response | `{ ok, code, result: { enabled, replay } }` |
| Idempotency | Same `requestId` replays the player `SET_AUTO_ASSIGN` map |
| Errors | `invalid_flag`, `progression_missing` |

### `open_branch_selection`

| Field | Value |
| --- | --- |
| Request | `{ command: "open_branch_selection", reason, characterId, requestId }` |
| Response | `{ ok, code, result: { pending, branchId?, branches } }` |
| Idempotency | Read-only; does not choose a branch |
| Errors | `branch_locked` when level < 5, `progression_missing` |

### `reset_full_build`

| Field | Value |
| --- | --- |
| Request | `{ command: "reset_full_build", reason, characterId, requestId }` |
| Response | `{ ok, code, result: { goldCost: 0, previousBranch, pendingBranchSelection } }` |
| Idempotency | `respecByRequestId`; uses `applyCanonicalRespec` with no gold deduction |
| Errors | `progression_missing` plus canonical respec codes |

### `simulate_level_up`

| Field | Value |
| --- | --- |
| Request | `{ command: "simulate_level_up", reason, characterId, requestId }` |
| Response | Same shape as an XP grant |
| Idempotency | Event id `gm-level:<requestId>` |
| Errors | `at_max_level`, `progression_missing` |

### `inspect_active_effects`

| Field | Value |
| --- | --- |
| Request | `{ command: "inspect_active_effects", reason, characterId, requestId }` |
| Response | `{ ok, code, result: { effects: [{ effectId, abilityId, type, stacks, remainingTicks, tags }] } }` |
| Idempotency | Read-only |
| Errors | Shared GM errors |

### `inspect_cooldown_recovery`

| Field | Value |
| --- | --- |
| Request | `{ command: "inspect_cooldown_recovery", reason, characterId, requestId }` |
| Response | `{ ok, code, result: { abilityCooldowns, cooldownRecoveryRate, usesCanonicalLeveling } }` |
| Idempotency | Read-only |
| Errors | Shared GM errors |

### `run_progression_validation`

| Field | Value |
| --- | --- |
| Request | `{ command: "run_progression_validation", reason, characterId, requestId }` |
| Response | `{ ok, code, result: { ok, code, issues } }` |
| Idempotency | Read-only |
| Errors | `progression_missing`; `result.issues` lists leftover/future/invalid fields |

`set_level` is **not** a command. Parse rejects it as `unknown_command`.

