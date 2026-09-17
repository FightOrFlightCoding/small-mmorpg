# Progression ready (PROG-15)

Character progression is certified against [rpg-progression-design-v1.0.md](../design/rpg-progression-design-v1.0.md). Do not add a later PROG phase until this document and [CURRENT_CONFLICTS.md](CURRENT_CONFLICTS.md) stay green.

Related: [BALANCE_REGRESSION_REPORT.md](BALANCE_REGRESSION_REPORT.md), [KNOWN_PROGRESSION_LIMITATIONS.md](KNOWN_PROGRESSION_LIMITATIONS.md), [PROGRESSION_RECOVERY_RUNBOOK.md](PROGRESSION_RECOVERY_RUNBOOK.md).

## Suggested release tag

`character-progression-v1`

Do **not** create that tag unless the working tree is clean and a human approves certification.

## Authority

The Nakama match is authoritative for class, branch, level, XP, allocations, talents, derived statistics, vitals, mana, cooldowns, combat results, respec, and rewards. The Godot client sends intentions only. Canonical progression storage uses `permissionWrite: 0`.

## Certification evidence

| Criterion | Evidence |
| --- | --- |
| Previous phases still pass | PROG-01–14 suites plus Prompt 18 / Foundation / ACCT gates |
| Four classes and eight branches | `class.warrior` / `mage` / `marksman` / `mystic`; two branches each |
| Skills and talents work | class/branch tests plus `progression_talent_trees.test.ts` |
| Canonical values represented | [CANONICAL_VALUE_CATALOG.md](CANONICAL_VALUE_CATALOG.md) |
| Level-10 auto-growth sheet | `progression_dps_audit.test.ts`, `progression_l10_sheet.test.ts` |
| DPS/HPS ±5% | `progression_dps_audit.test.ts` using `progression_simulator.ts` |
| Metronome Law | Mage Arcane Bolt holds; Mystic Fateweave authored miss is reported, not rebalanced |
| Tier gates, max actives, DoT no-crit, haste ≠ cooldown | `progression_dps_audit.test.ts`, `progression_dot_haste.test.ts` |
| Respec | `progression_respec.test.ts`, `progression_cert_journey.test.ts` |
| Sixteen reference builds | `progression_reference_builds.test.ts` (not enforced on players) |
| Enemy baselines | `progression_enemy_baselines.test.ts` (`40 + 8 * level`, elite 3×/2×/3×). Live slime HP stays 20 |
| Functional GM journey | `progression_cert_journey.test.ts` |
| Four-class party | `progression_party_cert.test.ts` |
| Account deletion / email reuse | `progression_cert_journey.test.ts`, `account_deletion.test.ts` |
| Repository audit | `progression_repository_audit.test.ts`, `progression_gcd_audit.test.ts` |
| Simulator | `npm run simulate` in `server/` (analytic or seeded; JSON or human report) |

## Simulator

`server/src/domain/progression_simulator.ts` reuses live content parsers, §4 formulas, ability timings, mana spend/regen, cooldown recovery, crit expected value `1 + CritChance * (CritMult - 1)`, DoT snapshot rules, and talent modifiers. It is not a second formula table.

```powershell
Set-Location server
npm run simulate -- --mode analytic --trace
npm run simulate -- --mode seeded --seed 34 --branch branch.mage.fire --json
```

## What this does not enable

Multiple zones, extra character slots, guilds, parties-as-progression, trading of talents, crafting, PvP, monetization, or a Git tag without human approval.
