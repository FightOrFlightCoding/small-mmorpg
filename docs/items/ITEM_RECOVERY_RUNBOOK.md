# Item recovery runbook

Recovery is authorized GM-only (`gm_command` allowlist, default disabled). Every scan and repair is audited (`gm_audit`). Do **not** silently delete unexplained items.

## Commands

| Command | Effect |
| --- | --- |
| `scan_item_recovery` | Report findings. No mutation. |
| `repair_item_recovery` | Safe repairs only. Persist bag and overflow when changed. |

Debug GM panel entries are not authority.

## Findings

| Kind | Repair |
| --- | --- |
| `orphaned_lock` | Clear lock whose `lockId` is not live |
| `duplicate_slot` | Keep one occupant; extras → overflow |
| `quantity_above_max` | Cap at `maxStack`; remainder → overflow |
| `invalid_container_ref` | Reassign empty slot or overflow |
| `missing_definition` | **Report only.** Never delete |
| `overflow_migration` | Info; player recovers into free bag slots |
| `incomplete_transaction` / `incomplete_drop` | Report; retry existing journal recover/compensate |
| `incomplete_trade` | Report; rejoin retries snapshot; `cancel_trade` if stuck open |
| `incomplete_gold_distribution` | Report; retry gold claim |

## Operator steps

1. Confirm GM allowlist and reason text.
2. `scan_item_recovery` on the character. Copy `unresolvedCount` and kinds.
3. If only orphan locks / duplicate slots / overstack / invalid slots: `repair_item_recovery`.
4. Re-scan. Missing definitions and incomplete journals must stay until content or the owning operation is repaired.
5. Do not wipe bags, overflow, or wallets to “clean” a report.

## What repair will not do

Delete ghost item ids, invent definitions, complete a trade, grant gold, or spawn missing ground/corpse entities. Corpses and ground items are match-lifetime; they are gone after restart by design ([KNOWN_ITEM_LIMITATIONS.md](KNOWN_ITEM_LIMITATIONS.md)).
