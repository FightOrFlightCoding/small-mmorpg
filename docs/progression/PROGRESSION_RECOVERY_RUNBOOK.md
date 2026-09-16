# Progression recovery runbook

Use this when a character, match, or account is stuck on progression. Domain recovery catalog: [RECOVERY.md](../RECOVERY.md). Persistence map: [PROGRESSION_STORAGE_CATALOG.md](PROGRESSION_STORAGE_CATALOG.md).

GM commands are allowlisted `gm_command` only. There is no `set_level`.

## Load and leftover cleanup

On join/list/export, `migrateToCanonicalProgression` runs.

| Kind | Action |
| --- | --- |
| `test.*` | Keep Foundation fields. Bump `progressionSchemaVersion` to **3** if needed |
| Production leftover Foundation authorities | Reset (do not map onto STR). Notice `leftover_foundation_reset`. Keep class/level/XP/canonical allocations |
| Missing blob | Initialize canonical level 1 and persist once |
| Future `progressionSchemaVersion` | `unsupported_future_version`. Do not rewrite |

## Stuck character (authorized lab)

| Symptom | GM command | Notes |
| --- | --- | --- |
| Inspect blob | `inspect_progression` | Snapshot only |
| Need one level | `simulate_level_up` | Grants remaining XP for the current level |
| Exact XP | `grant_exact_test_xp` | Idempotent `requestId` |
| Named event | `grant_xp_event` | Requires `eventId` |
| Auto-assign toggle | `set_auto_assign` | Does not spend existing points |
| Branch UI | `open_branch_selection` | Fails `branch_locked` before 5 |
| Clear build | `reset_full_build` | Trainer-equivalent reset; gold cost 0 for GM |
| Canonical L1 | `reset_progression_fixture` | Fixtures `canonical_level_1` / `level1` |
| Effects / CD | `inspect_active_effects`, `inspect_cooldown_recovery` | |
| Validate | `run_progression_validation` | |

Player respec remains the innkeeper/lab trainer overlay at `50 × level` gold.

## Disconnect and restart

1. Unexpected leave marks the avatar link-dead (`LINK_DEAD_TICKS` = 10s at 10 Hz).
2. After expiry the avatar despawns; progression persists.
3. Reconnect restores the blob, cooldowns, and effects. Casts do not resume.
4. Match terminate writes live progression (`progressionsForTerminate`).
5. Gameplay lease must be clear before another session plays that character.

## Soft-delete, restore, purge

| Step | Result |
| --- | --- |
| Soft-delete | Status `SOFT_DELETED`. Progression blob stays. Name stays reserved |
| Restore during retention | Status `ACTIVE`. Same level/XP/branch. No starter regrant |
| Purge after retention | Progression object removed |
| Recreate | New character id, level 1, 0 lifetime XP |

## Account deletion and email reuse

`runAccountDeletionSaga` purges every roster character, wipes gold, clears the email index, then deletes the Nakama account. A new account that reuses the email must not inherit XP, talents, or hotbar. Confirm with `account_deletion.test.ts` and `progression_cert_journey.test.ts`.

## Export

Account export includes `progressionExport` (class, branch, level, XP, allocations, nodes, auto-assign, hotbar, leftover notice). Secrets are stripped.

## Do not

- Do not edit `client/addons/`.
- Do not run SQL against custom tables (there are none).
- Do not retune slime HP or Fateweave to force a cert test.
- Do not persist derived HP/mana/crit as authority.
