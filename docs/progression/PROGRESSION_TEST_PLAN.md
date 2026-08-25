# Progression test plan

PROG-02 adds canonical content schemas and generated bundles without enabling new gameplay. Existing Foundation/ACCT suites must keep passing. The PROG-01 design-source audit still runs.

Related: [TEST_CATALOG.md](../TEST_CATALOG.md), [CANONICAL_VALUE_CATALOG.md](CANONICAL_VALUE_CATALOG.md).

## This phase

| Command | Proves |
| --- | --- |
| `powershell -File scripts/test-progression-design.ps1` | Canonical markdown invariants + contract docs + live three-class snapshot |
| `powershell -File scripts/test-server.ps1` | Same audit plus the accepted server domain suite |
| `powershell -File scripts/test-client.ps1` | Accepted GdUnit suite (unchanged) |

`server/tests/progression_design_audit.test.ts` is the only new automated suite in PROG-01.

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

These files are **named now**. They must not be treated as existing in PROG-01 except `progression_design_audit.test.ts`.

| File | Covers |
| --- | --- |
| `server/tests/progression_design_audit.test.ts` | PROG-01 design + catalog |
| `server/tests/progression_formulas.test.ts` | §4 formulas, 8 stats |
| `server/tests/progression_l10_sheet.test.ts` | §6.3 sheet, tank margin |
| `server/tests/progression_xp_curve.test.ts` | XP table, KillXP, 11100 |
| `server/tests/progression_timeline.test.ts` | unlocks, 2 class / 6 branch points |
| `server/tests/progression_talent_trees.test.ts` | 8/9 trees, tier-3 lockout, refs |
| `server/tests/progression_hotbar_ceiling.test.ts` | max 4 actives, auto-attack separate |
| `server/tests/progression_frenzy_passive.test.ts` | Frenzy not on hotbar |
| `server/tests/progression_dot_haste.test.ts` | no DoT crit, total damage preserved |
| `server/tests/progression_metronome.test.ts` | Arcane Bolt vs L10 regen |
| `server/tests/progression_dps_audit.test.ts` | §12 ±5% |
| `server/tests/progression_enemy_baselines.test.ts` | §13 mob/elite |
| `server/tests/progression_respec.test.ts` | trainer gold 50×level |
| `server/tests/ability.test.ts` | extend existing ability suite |
| `server/tests/combat_pipeline.test.ts` | extend crit/haste/DoT/shield |
| `server/tests/character_lifecycle.test.ts` | four classes including mystic |
| `client/tests/app/progression_service_test.gd` | mirror + allocate intention |
| `client/tests/app/ability_service_test.gd` | hotbar 4 + Frenzy |
| `client/tests/app/character_select_ui_test.gd` | four class cards |

Existing tests that must not be weakened: `progression.test.ts`, `xp_hooks.test.ts`, `ability.test.ts`, `combat_pipeline.test.ts`, `character_lifecycle.test.ts`, `existing_save_cert.test.ts`, GdUnit progression/ability/character-select suites, Prompt 18 e2e.

## Live snapshot (passing now, expected to change later)

The audit currently asserts production `class.*` ids are warrior/marksman/mage/**mystic** with mystic `rosterSelectable: false`, live curve maxLevel 5, XP sum 375, `HOTBAR_SIZE` 8, physical classes still have mana on `startingResources`, and canonical abilities have `runtimeEnabled: false`. That is conflict documentation, not the design end state. Later PROG phases update this snapshot when live combat matches the design.
