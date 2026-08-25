# Canonical value catalog

Source: [rpg-progression-design-v1.0.md](../design/rpg-progression-design-v1.0.md).  
Machine index: `canonicalCatalog()` in `server/src/domain/progression_design_audit.ts`.  
Tests: `server/tests/progression_design_audit.test.ts` plus the planned files in [PROGRESSION_TEST_PLAN.md](PROGRESSION_TEST_PLAN.md).

Classification:

- **canonical** — conversation-canon / audit-verified in §§1–13 and §15.
- **compile-time-addition** — §14 (and auto-assign templates, which §14 names).

Intended content files use the existing JSON pipeline (`content/source/<id>.json`), not Godot `.tres`. PROG-02 created those files.

Every catalog id appears in the [ID index](#id-index). Intended tests for later phases are named even when the file does not exist yet.

## §1 Design pillars

| Section | Stable ID | Value | Intended file | Intended test | Classification |
| --- | --- | --- | --- | --- | --- |
| 1 | `pillar.leveling_beats_allocation` | +6 automatic vs +3 free | `docs/design/rpg-progression-design-v1.0.md` | `server/tests/progression_design_audit.test.ts` | canonical |
| 1 | `pillar.no_stat_caps` | no caps | same | same | canonical |
| 1 | `pillar.asymmetric_resources` | casters mana; physical none | `server/src/domain/stats.ts` | `server/tests/progression_hotbar_ceiling.test.ts` | canonical |
| 1 | `pillar.haste_never_reduces_cooldowns` | haste ≠ cooldown | `server/src/domain/ability.ts` | `server/tests/progression_dot_haste.test.ts` | canonical |
| 5 | `pillar.metronome_law` | cost/cast ≤ regen at L10 | `server/src/domain/stats.ts` | `server/tests/progression_metronome.test.ts` | canonical |
| 1 | `pillar.actives_ceiling` | max 4 hotbar actives | `server/src/domain/ability.ts` | `server/tests/progression_hotbar_ceiling.test.ts` | canonical |
| 4 | `pillar.dots_never_crit` | DoTs never crit | `server/src/domain/effects.ts` | `server/tests/progression_dot_haste.test.ts` | canonical |
| 8 | `pillar.milestone_rhythm` | skills at 2/5/10 | `content/source/curve.vibecode.l10.json` | `server/tests/progression_timeline.test.ts` | canonical |
| 1 | `pillar.alliterative_self_sustain` | branch pairs + self-sustain | design doc | `server/tests/progression_design_audit.test.ts` | canonical |

## §2 Four classes and eight branches

| Section | Stable ID | Display | Resource | Intended file | Intended test | Classification |
| --- | --- | --- | --- | --- | --- | --- |
| 2 | `class.warrior` | Warrior | none | `content/source/class.warrior.json` | `server/tests/character_lifecycle.test.ts` | canonical |
| 2 | `class.mage` | Mage | mana | `content/source/class.mage.json` | same | canonical |
| 2 | `class.marksman` | Marksman | none | `content/source/class.marksman.json` | same | canonical |
| 2 | `class.mystic` | Mystic | mana | `content/source/class.mystic.json` | same | canonical |
| 2 | `branch.warrior.bulwark` | Bulwark | — | `content/source/branch.warrior.bulwark.json` | `server/tests/progression_talent_trees.test.ts` | canonical |
| 2 | `branch.warrior.berserker` | Berserker | — | `content/source/branch.warrior.berserker.json` | same | canonical |
| 2 | `branch.mage.fire` | Fire | — | `content/source/branch.mage.fire.json` | same | canonical |
| 2 | `branch.mage.frost` | Frost | — | `content/source/branch.mage.frost.json` | same | canonical |
| 2 | `branch.marksman.sniper` | Sniper | — | `content/source/branch.marksman.sniper.json` | same | canonical |
| 2 | `branch.marksman.skirmisher` | Skirmisher | — | `content/source/branch.marksman.skirmisher.json` | same | canonical |
| 2 | `branch.mystic.charms` | Charms | — | `content/source/branch.mystic.charms.json` | same | canonical |
| 2 | `branch.mystic.curses` | Curses | — | `content/source/branch.mystic.curses.json` | same | canonical |

Basics / signatures / capstones bind to the ability IDs in §9.

## §3 Eight stats

| Section | Stable ID | Per-point effect | Intended file | Intended test | Classification |
| --- | --- | --- | --- | --- | --- |
| 3 | `stat.strength` | +1% melee; +1% crit damage | `content/source/stat.strength.json` | `server/tests/progression_formulas.test.ts` | canonical |
| 3 | `stat.agility` | +1% ranged | `content/source/stat.agility.json` | same | canonical |
| 3 | `stat.intelligence` | +1% spell/curse; +4 max mana casters | `content/source/stat.intelligence.json` | same | canonical |
| 3 | `stat.spirit` | +1% heal; +0.2 mana regen/s casters | `content/source/stat.spirit.json` | same | canonical |
| 3 | `stat.precision` | +0.5% crit chance | `content/source/stat.precision.json` | same | canonical |
| 3 | `stat.haste` | +1% attack/cast/DoT tick; never CD | `content/source/stat.haste.json` | `server/tests/progression_dot_haste.test.ts` | canonical |
| 3 | `stat.vitality` | +10 max HP | `content/source/stat.vitality.json` | `server/tests/progression_formulas.test.ts` | canonical |
| 3 | `stat.endurance` | +0.5% DR | `content/source/stat.endurance.json` | same | canonical |

## §4 Formulas

| Section | Stable ID | Formula | Intended file | Intended test | Classification |
| --- | --- | --- | --- | --- | --- |
| 4 | `formula.hp_max` | `30 + 10 * VIT` | `server/src/domain/stats.ts` | `server/tests/progression_formulas.test.ts` | canonical |
| 4 | `formula.mana_max` | `20 + 4 * INT` casters | same | same | canonical |
| 4 | `formula.mana_regen` | `1.0 + 0.2 * SPI` /s casters | same | same | canonical |
| 4 | `formula.crit_chance` | `0.005 * PRE` | same | same | canonical |
| 4 | `formula.crit_mult` | `1.5 + 0.01 * STR` | same | same | canonical |
| 4 | `formula.haste_mult` | `1 + 0.01 * HST` | same | `server/tests/progression_dot_haste.test.ts` | canonical |
| 4 | `formula.damage_reduction` | `0.005 * END` | same | `server/tests/progression_formulas.test.ts` | canonical |
| 4 | `formula.effective_hp` | `HP_max / (1 - DR)` | same | `server/tests/progression_l10_sheet.test.ts` | canonical |
| 4 | `formula.attack_interval` | `WeaponBaseInterval / HasteMult` | same | `server/tests/progression_dot_haste.test.ts` | canonical |
| 4 | `formula.cast_time` | `BaseCastTime / HasteMult` | same | same | canonical |
| 4 | `formula.dot_tick_interval` | `BaseTickInterval / HasteMult` | `server/src/domain/effects.ts` | same | canonical |
| 4 | `formula.melee_hit` | `Base * (1 + STR/100)` | `server/src/domain/combat_pipeline.ts` | `server/tests/progression_formulas.test.ts` | canonical |
| 4 | `formula.ranged_hit` | `Base * (1 + AGI/100)` | same | same | canonical |
| 4 | `formula.spell_hit` | `Base * (1 + INT/100)` | same | same | canonical |
| 4 | `formula.heal` | `Base * (1 + SPI/100)` | same | same | canonical |
| 4 | `formula.on_crit` | `hit *= CritMult` (not DoT) | same | same | canonical |
| 4 | `formula.damage_taken` | `Hit * (1-DR) * Π(1+takenMods)` | same | same | canonical |
| 4 | `formula.expected_crit_value` | `1 + CritChance * (CritMult-1)` | same | `server/tests/progression_dps_audit.test.ts` | canonical |
| 4 | `formula.modifier_stacking` | different sources multiply; same node rank replaces | same | `server/tests/progression_talent_trees.test.ts` | canonical |
| 5 | `formula.metronome_law_check` | `5 / (1.5/1.12) = 3.73 ≤ 3.8` | `server/src/domain/stats.ts` | `server/tests/progression_metronome.test.ts` | canonical |

## §6 Base arrays, growth, auto-assign, L10 sheet

Every level-1 array totals **34**. Every automatic-growth template totals **6**. Level 10 = 34 + 54 automatic + 27 free = **115**.

| Section | Stable ID | Value | Intended file | Intended test | Classification |
| --- | --- | --- | --- | --- | --- |
| 6.1 | `base.warrior` | 8/4/2/3/8/3/3/3 | `content/source/class.warrior.json` | `server/tests/progression_l10_sheet.test.ts` | canonical |
| 6.1 | `base.mage` | 2/4/9/5/5/3/3/3 | `content/source/class.mage.json` | same | canonical |
| 6.1 | `base.marksman` | 4/9/3/3/6/3/3/3 | `content/source/class.marksman.json` | same | canonical |
| 6.1 | `base.mystic` | 2/4/6/8/5/3/3/3 | `content/source/class.mystic.json` | same | canonical |
| 6.2 | `growth.warrior` | +3 STR +2 VIT +1 END | `content/source/progression.warrior.json` | same | canonical |
| 6.2 | `growth.mage` | +3 INT +1 SPI +1 VIT +1 HST | `content/source/progression.mage.json` | same | canonical |
| 6.2 | `growth.marksman` | +3 AGI +1 PRE +1 VIT +1 HST | `content/source/progression.marksman.json` | same | canonical |
| 6.2 | `growth.mystic` | +2 INT +2 SPI +1 VIT +1 END | `content/source/progression.mystic.json` | same | canonical |
| 6.2 | `auto_assign.warrior` | +2 STR +1 VIT | `content/source/progression.warrior.json` | same | compile-time-addition |
| 6.2 | `auto_assign.mage` | +2 INT +1 HST | `content/source/progression.mage.json` | same | compile-time-addition |
| 6.2 | `auto_assign.marksman` | +2 AGI +1 PRE | `content/source/progression.marksman.json` | same | compile-time-addition |
| 6.2 | `auto_assign.mystic` | +1 INT +1 SPI +1 VIT | `content/source/progression.mystic.json` | same | compile-time-addition |
| 6.3 | `sheet.l10.warrior` | STR35 AGI4 INT2 SPI3 VIT26 PRE3 HST3 END12 HP290 EHP308.5 crit 1.5%/1.85× haste 1.03 DR 6% | design §6.3 | same | canonical |
| 6.3 | `sheet.l10.mage` | 2/4/36/14, 14/3/12/3, HP170 EHP172.6 mana 164/3.8 | same | same | canonical |
| 6.3 | `sheet.l10.marksman` | 4/36/3/3, 15/12/12/3, HP180 EHP182.7 crit 6%/1.54× haste 1.12 DR 1.5% | same | same | canonical |
| 6.3 | `sheet.l10.mystic` | 2/4/24/26, 14/3/3/12, HP170 EHP180.9 mana 116/6.2 | same | same | canonical |
| 14 | `compile.respec_cost` | 50 × level | `server/src/domain/progression.ts` | `server/tests/progression_respec.test.ts` | compile-time-addition |

## §7 XP

`XP_to_next(level) = round_to_tens(100 * level^1.5)`. `KillXP(enemy_level) = 8 + 2 * enemy_level`. Steep dial `8 + 3*level` is recorded, not used.

| Section | Stable ID | Value | Intended file | Intended test | Classification |
| --- | --- | --- | --- | --- | --- |
| 7 | `formula.xp_to_next` | see formula | `content/source/curve.vibecode.l10.json` | `server/tests/progression_xp_curve.test.ts` | canonical |
| 7 | `formula.kill_xp` | `8 + 2 * enemy_level` | `server/src/domain/xp_hooks.ts` | same | canonical |
| 7 | `formula.kill_xp_steep_dial` | `8 + 3 * level` unused | design doc | same | canonical |
| 7 | `xp.table.1_2` | 100 | curve JSON | same | canonical |
| 7 | `xp.table.2_3` | 280 | same | same | canonical |
| 7 | `xp.table.3_4` | 520 | same | same | canonical |
| 7 | `xp.table.4_5` | 800 | same | same | canonical |
| 7 | `xp.table.5_6` | 1120 | same | same | canonical |
| 7 | `xp.table.6_7` | 1470 | same | same | canonical |
| 7 | `xp.table.7_8` | 1850 | same | same | canonical |
| 7 | `xp.table.8_9` | 2260 | same | same | canonical |
| 7 | `xp.table.9_10` | 2700 | same | same | canonical |
| 7 | `xp.total` | 11100 | same | same | canonical |
| 7 | `xp.same_level_kills` | 10,24,37,50,62,74,84,94,104 | design table | same | canonical |

## §8 Timeline

| Section | Stable ID | Value | Intended file | Intended test | Classification |
| --- | --- | --- | --- | --- | --- |
| 8 | `timeline.class_points` | 2 (levels 3–4) | `content/source/curve.vibecode.l10.json` | `server/tests/progression_timeline.test.ts` | canonical |
| 8 | `timeline.branch_points` | 6 (levels 5–10) | same | same | canonical |
| 8 | `timeline.tier_gates` | T1 at L5; T2 after 2 spent; T3 after 4 spent; T3 earliest L9 | `server/src/domain/progression.ts` | `server/tests/progression_talent_trees.test.ts` | canonical |

Unlocks: L1 auto-attack only; L2 basic; L5 branch+signature; L10 capstone.

## §9 Auto-attacks, actives, capstones

| Section | Stable ID | Numbers | Intended file | Intended test | Classification |
| --- | --- | --- | --- | --- | --- |
| 9.1 | `ability.warrior.auto_attack` | 12 dmg / 2.0s / STR | `content/source/ability.warrior.auto_attack.json` | `server/tests/ability.test.ts` | canonical |
| 9.1 | `ability.mage.auto_attack` | 6 / 2.0s / INT | `content/source/ability.mage.auto_attack.json` | same | canonical |
| 9.1 | `ability.marksman.auto_attack` | 10 / 1.8s / AGI | `content/source/ability.marksman.auto_attack.json` | same | canonical |
| 9.1 | `ability.mystic.auto_attack` | 6 / 2.0s / INT | `content/source/ability.mystic.auto_attack.json` | same | canonical |
| 9.2 | `ability.warrior.heavy_strike` | 28, 6s CD, instant | `content/source/ability.warrior.heavy_strike.json` | same | canonical |
| 9.2 | `ability.warrior.challenge` | taunt, 15s, +15% DR 4s | `content/source/ability.warrior.challenge.json` | same | canonical |
| 9.2 | `ability.warrior.shield_bash` | 10, 12s, stun 1s | `content/source/ability.warrior.shield_bash.json` | same | compile-time-addition |
| 9.2 | `ability.warrior.frenzy` | passive +5%/stack max 3 | `content/source/ability.warrior.frenzy.json` | `server/tests/progression_frenzy_passive.test.ts` | canonical |
| 9.2 | `ability.warrior.whirlwind` | 24, 10s, melee AoE | `content/source/ability.warrior.whirlwind.json` | `server/tests/ability.test.ts` | compile-time-addition |
| 9.2 | `ability.marksman.aimed_shot` | 22, 6s | `content/source/ability.marksman.aimed_shot.json` | same | canonical |
| 9.2 | `ability.marksman.snipe` | 45, 10s, 1.5s channel, +30% range | `content/source/ability.marksman.snipe.json` | same | canonical |
| 9.2 | `ability.marksman.piercing_shot` | 30, 14s, line | `content/source/ability.marksman.piercing_shot.json` | same | compile-time-addition |
| 9.2 | `ability.marksman.barrage` | 3×6=18, 5s | `content/source/ability.marksman.barrage.json` | same | canonical |
| 9.2 | `ability.marksman.vault` | 0, 15s, ~5m | `content/source/ability.marksman.vault.json` | same | canonical |
| 9.2 | `ability.mage.arcane_bolt` | 16, 1.5s, 5 mana | `content/source/ability.mage.arcane_bolt.json` | same | canonical |
| 9.2 | `ability.mage.fireball` | 34, 2.5s, 20 mana | `content/source/ability.mage.fireball.json` | same | canonical |
| 9.2 | `ability.mage.flame_wave` | 22, 10s, 1.5s, 25 mana | `content/source/ability.mage.flame_wave.json` | same | compile-time-addition |
| 9.2 | `ability.mage.ice_bolt` | 24, 2.0s, 15 mana, 30% slow 3s | `content/source/ability.mage.ice_bolt.json` | same | canonical |
| 9.2 | `ability.mage.flash_freeze` | 0 dmg, 15s, 20 mana, root 2s | `content/source/ability.mage.flash_freeze.json` | same | compile-time-addition |
| 9.2 | `ability.mystic.fateweave` | 20 harm / 22 mend, 1.8s, 12 mana | `content/source/ability.mystic.fateweave.json` | same | canonical |
| 9.2 | `ability.mystic.protective_charm` | 40 absorb, 8s, 18 mana, 6s | `content/source/ability.mystic.protective_charm.json` | same | canonical |
| 9.2 | `ability.mystic.blessing` | +10% dmg 10s, 20s/25 mana | `content/source/ability.mystic.blessing.json` | same | compile-time-addition |
| 9.2 | `ability.mystic.wither` | 36/8s, 8 ticks, 1.5s, 14 mana, no crit | `content/source/ability.mystic.wither.json` | `server/tests/progression_dot_haste.test.ts` | canonical |
| 9.2 | `ability.mystic.evil_eye` | +15% taken 8s, 12s/15 mana | `content/source/ability.mystic.evil_eye.json` | `server/tests/ability.test.ts` | compile-time-addition |
| 9.3 | `ability.warrior.unbreakable` | −50% taken 8s, 90s, 0 mana | `content/source/ability.warrior.unbreakable.json` | same | canonical |
| 9.3 | `ability.warrior.berserk` | +50% dealt +20% taken 10s, 90s | `content/source/ability.warrior.berserk.json` | same | canonical |
| 9.3 | `ability.mage.meteor` | 60 AoE always crit after 1.5s, 90s | `content/source/ability.mage.meteor.json` | same | canonical |
| 9.3 | `ability.mage.absolute_zero` | freeze 4s, 90s | `content/source/ability.mage.absolute_zero.json` | same | canonical |
| 9.3 | `ability.marksman.coup_de_grace` | 70 guaranteed crit, reset on kill, 60s | `content/source/ability.marksman.coup_de_grace.json` | same | canonical |
| 9.3 | `ability.marksman.arrowstorm` | +40% AS 8s, bleeds 2×, 90s | `content/source/ability.marksman.arrowstorm.json` | same | canonical |
| 9.3 | `ability.mystic.benediction` | 30% max HP heal + 10% shield 4s, 90s | `content/source/ability.mystic.benediction.json` | same | compile-time-addition |
| 9.3 | `ability.mystic.malediction` | Wither AoE, −15% enemy damage, 90s | `content/source/ability.mystic.malediction.json` | same | compile-time-addition |
| 14 | `compile.challenge_dr` | +15% DR (R2 +25%) | challenge ability | same | compile-time-addition |
| 14 | `compile.vault_distance` | ~5m | vault ability | same | compile-time-addition |
| 14 | `compile.capstone_zero_mana` | 0 mana | `server/src/domain/ability.ts` | same | compile-time-addition |

Frenzy R3 +7%/stack is compile-time (`talent.warrior.berserker.frenzy_r3`).

## §10 Talent trees

Class trees: 3 nodes, spend 2. Branch trees: 8 nodes / 9 point-slots, spend 6. Each branch has at most one `(ACTIVE)`.

Class nodes: `talent.warrior.heavy_strike_r2`, `talent.warrior.conditioning`, `talent.warrior.weapon_mastery`, `talent.mage.arcane_bolt_r2`, `talent.mage.volatility`, `talent.mage.ward`, `talent.marksman.aimed_shot_r2`, `talent.marksman.deadly_aim`, `talent.marksman.light_step`, `talent.mystic.fateweave_r2`, `talent.mystic.compassion`, `talent.mystic.malice`.

Branch nodes (intended file `content/source/<id>.json`, test `server/tests/progression_talent_trees.test.ts`, canonical unless noted):

`talent.warrior.bulwark.challenge_r2`, `talent.warrior.bulwark.iron_thorns`, `talent.warrior.bulwark.fortitude`, `talent.warrior.bulwark.challenge_r3`, `talent.warrior.bulwark.shield_bash`, `talent.warrior.bulwark.punishment`, `talent.warrior.bulwark.last_stand`, `talent.warrior.bulwark.shield_bash_r2`, `talent.warrior.berserker.frenzy_r2`, `talent.warrior.berserker.slaughter`, `talent.warrior.berserker.relentless`, `talent.warrior.berserker.frenzy_r3` (compile-time-addition), `talent.warrior.berserker.bloodlust`, `talent.warrior.berserker.whirlwind`, `talent.warrior.berserker.bloodthirst`, `talent.warrior.berserker.reckless`, `talent.mage.fire.fireball_r2`, `talent.mage.fire.afterburn`, `talent.mage.fire.kindled_mind`, `talent.mage.fire.fireball_r3`, `talent.mage.fire.flame_wave`, `talent.mage.fire.detonation`, `talent.mage.fire.second_spark`, `talent.mage.fire.flame_wave_r2`, `talent.mage.frost.ice_bolt_r2`, `talent.mage.frost.numbing_cold`, `talent.mage.frost.deep_chill`, `talent.mage.frost.ice_bolt_r3`, `talent.mage.frost.flash_freeze`, `talent.mage.frost.rimeguard`, `talent.mage.frost.winter_harvest`, `talent.mage.frost.flash_freeze_r2`, `talent.marksman.sniper.snipe_r2`, `talent.marksman.sniper.weak_spot`, `talent.marksman.sniper.steady_hands`, `talent.marksman.sniper.snipe_r3`, `talent.marksman.sniper.piercing_shot`, `talent.marksman.sniper.killer_instinct`, `talent.marksman.sniper.snipers_nest`, `talent.marksman.sniper.piercing_shot_r2`, `talent.marksman.skirmisher.barrage_r2`, `talent.marksman.skirmisher.serrated_arrows`, `talent.marksman.skirmisher.nimble`, `talent.marksman.skirmisher.barrage_r3`, `talent.marksman.skirmisher.vault`, `talent.marksman.skirmisher.twist_the_knife`, `talent.marksman.skirmisher.runners_high`, `talent.marksman.skirmisher.vault_r2`, `talent.mystic.charms.protective_charm_r2`, `talent.mystic.charms.battle_blessing`, `talent.mystic.charms.devotion`, `talent.mystic.charms.protective_charm_r3`, `talent.mystic.charms.blessing`, `talent.mystic.charms.mending_ward`, `talent.mystic.charms.overflow`, `talent.mystic.charms.blessing_r2`, `talent.mystic.curses.wither_r2`, `talent.mystic.curses.siphon`, `talent.mystic.curses.dark_bargain`, `talent.mystic.curses.wither_r3`, `talent.mystic.curses.evil_eye`, `talent.mystic.curses.festering`, `talent.mystic.curses.vampiric_curse`, `talent.mystic.curses.contagion`.

Effects match design §10 tables exactly (Fortitude 2 ranks, Relentless 2 ranks, Kindled Mind 2 ranks, Deep Chill 2 ranks, Steady Hands 2 ranks, Nimble 2 ranks, Devotion 2 ranks, Dark Bargain 2 ranks).

## §11 Sixteen reference builds

Design targets, not enforced. Intended file: design doc. Intended test: `server/tests/progression_design_audit.test.ts`. Classification: canonical.

`build.bulwark.fortress` (VIT→END), `build.bulwark.warlord` (VIT→STR), `build.berserker.executioner` (STR→PRE), `build.berserker.hurricane` (STR→HST→VIT), `build.fire.meteor` (INT→PRE), `build.fire.flamethrower` (INT→HST→SPI), `build.frost.glacier` (INT→END), `build.frost.permafrost` (INT→HST), `build.sniper.deadeye` (AGI→PRE), `build.sniper.quickdraw` (AGI→HST), `build.skirmisher.windrunner` (AGI→HST, VIT splash), `build.skirmisher.duelist` (AGI→PRE), `build.charms.battle_medic` (SPI→VIT), `build.charms.war_witch` (SPI→INT), `build.curses.plaguebringer` (INT→HST), `build.curses.leech` (INT→SPI).

## §12 Balance scorecard

Reproduce within ±5% at L10 auto-growth, signature on, no tree nodes, 60s fight. Intended test: `server/tests/progression_dps_audit.test.ts`. Classification: canonical.

| ID | Value |
| --- | --- |
| `balance.dps.sniper` | 19.0 |
| `balance.dps.skirmisher` | 18.9 |
| `balance.dps.fire` | 18.8 avg |
| `balance.dps.frost` | 17.6 avg |
| `balance.dps.curses` | 17.3 |
| `balance.dps.berserker` | 16.1 |
| `balance.dps.bulwark` | 14.8 |
| `balance.dps.charms` | 14.3 solo |
| `balance.charms.hps` | 22.2 party HPS |
| `balance.tank_margin` | Warrior EHP 308.5 = 1.69–1.79× others |
| `balance.healer_pressure` | +4.3 HP/s vs 1 DPS; −13.6 vs 2 DPS |
| `balance.ttk` | 6.3–8.1s vs 120 HP mob |
| `balance.greed_check` | 27-point dumps as in §12 |
| `balance.watchlist.int` | INT mana 4→3 if cap rises |
| `balance.watchlist.pvp` | capstones ~65% vs players if PvP added |
| `balance.watchlist.mob_hp` | snappiness dial: mob HP |

## §13 Enemy formulas

| Section | Stable ID | Value | Intended file | Intended test | Classification |
| --- | --- | --- | --- | --- | --- |
| 13 | `formula.mob_hp` | `40 + 8 * level` (L1 48, L10 120) | `content/source/` | `server/tests/progression_enemy_baselines.test.ts` | canonical |
| 13 | `formula.mob_damage` | `2 + 0.5 * level` / 2.0s swing | `content/source/` | same | canonical |
| 13 | `formula.elite` | 3× HP, 2× damage, 3× KillXP | same | same | canonical |

§14 also tags enemy formulas as compile-time additions for first-pass tuning; the expressions in §13 remain the values to implement first.

## §14 / §15 compile-time and implementation tests

| Section | Stable ID | Intended test | Classification |
| --- | --- | --- | --- |
| 15 | `impl.test.l10_sheet` | `server/tests/progression_l10_sheet.test.ts` | canonical |
| 15 | `impl.test.dps_table` | `server/tests/progression_dps_audit.test.ts` | canonical |
| 15 | `impl.test.metronome` | `server/tests/progression_metronome.test.ts` | canonical |
| 15 | `impl.test.tier3_lockout` | `server/tests/progression_talent_trees.test.ts` | canonical |

## ID index

Complete stable IDs (must stay in sync with `canonicalCatalog()`):

`pillar.leveling_beats_allocation` `pillar.no_stat_caps` `pillar.asymmetric_resources` `pillar.haste_never_reduces_cooldowns` `pillar.metronome_law` `pillar.actives_ceiling` `pillar.dots_never_crit` `pillar.milestone_rhythm` `pillar.alliterative_self_sustain` `class.warrior` `class.mage` `class.marksman` `class.mystic` `branch.warrior.bulwark` `branch.warrior.berserker` `branch.mage.fire` `branch.mage.frost` `branch.marksman.sniper` `branch.marksman.skirmisher` `branch.mystic.charms` `branch.mystic.curses` `stat.strength` `stat.agility` `stat.intelligence` `stat.spirit` `stat.precision` `stat.haste` `stat.vitality` `stat.endurance` `formula.hp_max` `formula.mana_max` `formula.mana_regen` `formula.crit_chance` `formula.crit_mult` `formula.haste_mult` `formula.damage_reduction` `formula.effective_hp` `formula.attack_interval` `formula.cast_time` `formula.dot_tick_interval` `formula.melee_hit` `formula.ranged_hit` `formula.spell_hit` `formula.heal` `formula.on_crit` `formula.damage_taken` `formula.expected_crit_value` `formula.modifier_stacking` `formula.xp_to_next` `formula.kill_xp` `formula.kill_xp_steep_dial` `formula.mob_hp` `formula.mob_damage` `formula.elite` `formula.metronome_law_check` `base.warrior` `base.mage` `base.marksman` `base.mystic` `growth.warrior` `growth.mage` `growth.marksman` `growth.mystic` `auto_assign.warrior` `auto_assign.mage` `auto_assign.marksman` `auto_assign.mystic` `sheet.l10.warrior` `sheet.l10.mage` `sheet.l10.marksman` `sheet.l10.mystic` `ability.warrior.auto_attack` `ability.mage.auto_attack` `ability.marksman.auto_attack` `ability.mystic.auto_attack` `xp.table.1_2` `xp.table.2_3` `xp.table.3_4` `xp.table.4_5` `xp.table.5_6` `xp.table.6_7` `xp.table.7_8` `xp.table.8_9` `xp.table.9_10` `xp.total` `xp.same_level_kills` `timeline.class_points` `timeline.branch_points` `timeline.tier_gates` `ability.warrior.heavy_strike` `ability.warrior.challenge` `ability.warrior.shield_bash` `ability.warrior.frenzy` `ability.warrior.whirlwind` `ability.marksman.aimed_shot` `ability.marksman.snipe` `ability.marksman.piercing_shot` `ability.marksman.barrage` `ability.marksman.vault` `ability.mage.arcane_bolt` `ability.mage.fireball` `ability.mage.flame_wave` `ability.mage.ice_bolt` `ability.mage.flash_freeze` `ability.mystic.fateweave` `ability.mystic.protective_charm` `ability.mystic.blessing` `ability.mystic.wither` `ability.mystic.evil_eye` `ability.warrior.unbreakable` `ability.warrior.berserk` `ability.mage.meteor` `ability.mage.absolute_zero` `ability.marksman.coup_de_grace` `ability.marksman.arrowstorm` `ability.mystic.benediction` `ability.mystic.malediction` `talent.warrior.heavy_strike_r2` `talent.warrior.conditioning` `talent.warrior.weapon_mastery` `talent.mage.arcane_bolt_r2` `talent.mage.volatility` `talent.mage.ward` `talent.marksman.aimed_shot_r2` `talent.marksman.deadly_aim` `talent.marksman.light_step` `talent.mystic.fateweave_r2` `talent.mystic.compassion` `talent.mystic.malice` `talent.warrior.bulwark.challenge_r2` `talent.warrior.bulwark.iron_thorns` `talent.warrior.bulwark.fortitude` `talent.warrior.bulwark.challenge_r3` `talent.warrior.bulwark.shield_bash` `talent.warrior.bulwark.punishment` `talent.warrior.bulwark.last_stand` `talent.warrior.bulwark.shield_bash_r2` `talent.warrior.berserker.frenzy_r2` `talent.warrior.berserker.slaughter` `talent.warrior.berserker.relentless` `talent.warrior.berserker.frenzy_r3` `talent.warrior.berserker.bloodlust` `talent.warrior.berserker.whirlwind` `talent.warrior.berserker.bloodthirst` `talent.warrior.berserker.reckless` `talent.mage.fire.fireball_r2` `talent.mage.fire.afterburn` `talent.mage.fire.kindled_mind` `talent.mage.fire.fireball_r3` `talent.mage.fire.flame_wave` `talent.mage.fire.detonation` `talent.mage.fire.second_spark` `talent.mage.fire.flame_wave_r2` `talent.mage.frost.ice_bolt_r2` `talent.mage.frost.numbing_cold` `talent.mage.frost.deep_chill` `talent.mage.frost.ice_bolt_r3` `talent.mage.frost.flash_freeze` `talent.mage.frost.rimeguard` `talent.mage.frost.winter_harvest` `talent.mage.frost.flash_freeze_r2` `talent.marksman.sniper.snipe_r2` `talent.marksman.sniper.weak_spot` `talent.marksman.sniper.steady_hands` `talent.marksman.sniper.snipe_r3` `talent.marksman.sniper.piercing_shot` `talent.marksman.sniper.killer_instinct` `talent.marksman.sniper.snipers_nest` `talent.marksman.sniper.piercing_shot_r2` `talent.marksman.skirmisher.barrage_r2` `talent.marksman.skirmisher.serrated_arrows` `talent.marksman.skirmisher.nimble` `talent.marksman.skirmisher.barrage_r3` `talent.marksman.skirmisher.vault` `talent.marksman.skirmisher.twist_the_knife` `talent.marksman.skirmisher.runners_high` `talent.marksman.skirmisher.vault_r2` `talent.mystic.charms.protective_charm_r2` `talent.mystic.charms.battle_blessing` `talent.mystic.charms.devotion` `talent.mystic.charms.protective_charm_r3` `talent.mystic.charms.blessing` `talent.mystic.charms.mending_ward` `talent.mystic.charms.overflow` `talent.mystic.charms.blessing_r2` `talent.mystic.curses.wither_r2` `talent.mystic.curses.siphon` `talent.mystic.curses.dark_bargain` `talent.mystic.curses.wither_r3` `talent.mystic.curses.evil_eye` `talent.mystic.curses.festering` `talent.mystic.curses.vampiric_curse` `talent.mystic.curses.contagion` `build.bulwark.fortress` `build.bulwark.warlord` `build.berserker.executioner` `build.berserker.hurricane` `build.fire.meteor` `build.fire.flamethrower` `build.frost.glacier` `build.frost.permafrost` `build.sniper.deadeye` `build.sniper.quickdraw` `build.skirmisher.windrunner` `build.skirmisher.duelist` `build.charms.battle_medic` `build.charms.war_witch` `build.curses.plaguebringer` `build.curses.leech` `balance.dps.sniper` `balance.dps.skirmisher` `balance.dps.fire` `balance.dps.frost` `balance.dps.curses` `balance.dps.berserker` `balance.dps.bulwark` `balance.dps.charms` `balance.charms.hps` `balance.tank_margin` `balance.healer_pressure` `balance.ttk` `balance.greed_check` `balance.watchlist.int` `balance.watchlist.pvp` `balance.watchlist.mob_hp` `compile.respec_cost` `compile.challenge_dr` `compile.vault_distance` `compile.capstone_zero_mana` `impl.test.l10_sheet` `impl.test.dps_table` `impl.test.metronome` `impl.test.tier3_lockout`
