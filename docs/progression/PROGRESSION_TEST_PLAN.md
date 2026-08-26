# Progression test plan

PROG-06 implements manual free-stat allocation and trainer respec. Talent spend and canonical combat remain later. Existing Foundation/ACCT suites must keep passing. The PROG-01 design-source audit still runs.

Related: [TEST_CATALOG.md](../TEST_CATALOG.md), [CANONICAL_VALUE_CATALOG.md](CANONICAL_VALUE_CATALOG.md).

## PROG-06 coverage

| Command | Proves |
| --- | --- |
| `powershell -File scripts/test-progression-design.ps1` | Canonical markdown invariants + contract docs + live four-class snapshot + PROG-07 go/no-go heading |
| `powershell -File scripts/test-server.ps1` | Same audit plus the accepted server domain suite, including `progression_respec.test.ts` |
| `powershell -File scripts/test-client.ps1` | GdUnit suite (opcodes 33–37, batch/respec intentions without gold/XP) |

`server/tests/progression_design_audit.test.ts` remains the design-source audit. `server/tests/progression_xp_curve.test.ts` and `server/tests/progression_timeline.test.ts` cover PROG-05. `server/tests/progression_respec.test.ts` covers PROG-06. Foundation XP assertions in `progression.test.ts` use `test.class.vanguard`.

## Audit targets (design source — passing now)

| Target | Check | Test |
| --- | --- | --- |
| Four classes | roster + locked ids | `server/tests/progression_design_audit.test.ts` |
| Eight branches | two per class | same |
| Base arrays total 34 | parsed §6.1 | same |
| Growth templates total 6 | parsed §6.2 | same |
| L10 115 including 27 free | budget sentence + constants | same |
| XP table totals 11100 | parsed §7 + `round_to_tens` | same |
| Two class points / six branch points | §8 | same |
| Eight nodes / nine point-slots | each branch table | same |
| At most one buyable active | `(ACTIVE)` count | same |
| Capstones have valid branches | §9.3 | same |
| Talent and ability names resolve | names present in the design | same |
| Compile-time values tagged | §14 phrases + catalog classification | same |
| Every audit target has a planned regression test | `intendedTest` non-empty + this file | same |
| Frenzy passive | §9.2 type + interpretations doc | same |

## Planned later regression tests

These files are **named now**. They must not be treated as existing in PROG-01 except `progression_design_audit.test.ts`. PROG-03 implemented create/migrate coverage in `character_lifecycle.test.ts` and `canonical_progression.test.ts`. PROG-04 implemented formula coverage in `progression_formulas.test.ts` and `progression_l10_sheet.test.ts` without enabling later combat files. `progression_gcd_absent.test.ts` and `progression_gcd_audit.test.ts` are named closures for PROG-08 and PROG-15; they must not be treated as existing yet.

| File | Covers |
| --- | --- |
| `server/tests/progression_design_audit.test.ts` | PROG-01 design + catalog + owned conflict register |
| `server/tests/progression_formulas.test.ts` | §4 formulas, 8 stats, power categories, damage order, DoT total-damage identity |
| `server/tests/progression_l10_sheet.test.ts` | §6.3 sheet, tank margin |
| `server/tests/progression_xp_curve.test.ts` | XP table, KillXP, elite XP, 11100, production L10 overlay |
| `server/tests/progression_timeline.test.ts` | unlocks, multi-level, duplicate event, cap, growth, free totals, auto-assign, pending branch, L10 without branch, reconnect/storage, character-select level |
| `server/tests/progression_talent_trees.test.ts` | 8/9 trees, tier-3 lockout, refs |
| `server/tests/progression_hotbar_ceiling.test.ts` | max 4 actives, auto-attack separate; after PROG-07 one production authority |
| `server/tests/progression_frenzy_passive.test.ts` | Frenzy not on hotbar |
| `server/tests/progression_dot_haste.test.ts` | no DoT crit, total damage preserved |
| `server/tests/progression_gcd_absent.test.ts` | PROG-08: no production GCD on class, ability, cast state, or production UI |
| `server/tests/progression_gcd_audit.test.ts` | PROG-15: production bundles/runtime have no `globalCooldown` / `global_cooldown` / `gcd` dependency |
| `server/tests/progression_metronome.test.ts` | Arcane Bolt vs L10 regen |
| `server/tests/progression_dps_audit.test.ts` | §12 ±5% |
| `server/tests/progression_enemy_baselines.test.ts` | §13 mob/elite |
| `server/tests/progression_respec.test.ts` | eight-stat allocate, atomic batch, trainer gold 50×level, refunds, gold idempotency, reconnect |
| `server/tests/ability.test.ts` | extend existing ability suite |
| `server/tests/combat_pipeline.test.ts` | extend crit/haste/DoT/shield |
| `server/tests/character_lifecycle.test.ts` | four classes including mystic |
| `client/tests/app/progression_service_test.gd` | mirror + allocate intention |
| `client/tests/app/ability_service_test.gd` | hotbar 4 + Frenzy |
| `client/tests/app/character_select_ui_test.gd` | four class cards |

Existing tests that must not be weakened: `progression.test.ts`, `xp_hooks.test.ts`, `ability.test.ts`, `combat_pipeline.test.ts`, `character_lifecycle.test.ts`, `existing_save_cert.test.ts`, GdUnit progression/ability/character-select suites, Prompt 18 e2e.

## Live snapshot (PROG-06)

The audit asserts production `class.*` ids are warrior/marksman/mage/**mystic**, all `rosterSelectable: true`, `test.curve.standard` maxLevel 5 / XP sum 375, production overlay `curve.vibecode.l10` maxLevel 10, `HOTBAR_SIZE` 8, physical classes omit mana on `startingResources`, and canonical abilities have `runtimeEnabled: false`. Production-class **vitals** use canonical HP/mana formulas. Live ATTACK still uses Foundation numbers. Production KillXP, the L10 curve, free-stat allocation, and trainer respec are live. Talent spend is not. [CURRENT_CONFLICTS.md](CURRENT_CONFLICTS.md) owns every remaining gap. C-respec is RESOLVED.

## Later named closures

These files are named now. Do not treat them as existing until the owning phase creates them.

### PROG-07 hotbar authority

`progression_hotbar_ceiling.test.ts` must prove one production hotbar: 4 active slots, auto-attack separate, passives and Frenzy excluded, eight-slot path removed or test-only, ownership from level/branch/purchased nodes, no production “unlock any ability with skill points.”

### PROG-08 no production global cooldown

Acceptance criterion: no production class, production ability, authoritative cast state, or production client UI uses a global cooldown. Legacy test abilities may retain a GCD only when their package is development-only and excluded from production. Named test: `server/tests/progression_gcd_absent.test.ts`.

### PROG-14 leftover schema-2 fields

Migration must still run for `progressionSchemaVersion` 2 records that contain leftover Foundation authorities (`allocatedAttributes`, live 8-slot `hotbar`, production `unlockedAbilityIds`). Classify development/test vs real player characters. Real-player old investment is translated, refunded as canonical unspent points, or reset with a visible notice.

### PROG-15 GCD production audit

Search production bundles and runtime paths for `globalCooldown`, `global_cooldown`, and `gcd`. Fail certification if any production progression ability depends on them. Named test: `server/tests/progression_gcd_audit.test.ts`.
