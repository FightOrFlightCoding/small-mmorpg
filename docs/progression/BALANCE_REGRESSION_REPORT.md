# Balance regression report (PROG-15)

Simulator: `server/src/domain/progression_simulator.ts`. Same content, formulas, timings, mana, cooldowns, crit expected value, DoT rules, and talent modifiers as the live match. Tests: `server/tests/progression_dps_audit.test.ts`.

Tolerance: **±5%** versus design §12. Auto-growth only, signature included, no tree nodes, 60s fight.

## Level-10 auto-growth sheet (§6.3)

| | Warrior | Mage | Marksman | Mystic |
| --- | --- | --- | --- | --- |
| STR/AGI/INT/SPI | 35 / 4 / 2 / 3 | 2 / 4 / 36 / 14 | 4 / 36 / 3 / 3 | 2 / 4 / 24 / 26 |
| VIT / PRE / HST / END | 26 / 3 / 3 / 12 | 14 / 3 / 12 / 3 | 15 / 12 / 12 / 3 | 14 / 3 / 3 / 12 |
| HP | 290 | 170 | 180 | 170 |
| Effective HP | 308.5 | 172.6 | 182.7 | 180.9 |
| Mana / Regen | — | 164 / 3.8/s | — | 116 / 6.2/s |
| Crit chance / Crit mult | 1.5% / 1.85× | 1.5% / 1.52× | 6.0% / 1.54× | 1.5% / 1.52× |
| Haste / DR | 1.03 / 6% | 1.12 / 1.5% | 1.12 / 1.5% | 1.03 / 6% |

## §12 DPS / HPS targets

Live analytic results from `npm run simulate -- --mode analytic` (auto-growth only, signature on, no tree nodes, 60s). Tolerance ±5%.

| Branch | Target | Live analytic | Delta | Notes |
| --- | --- | --- | --- | --- |
| Sniper | 19.0 DPS | 19.033 | +0.2% | Autos pause per Snipe; crit EV |
| Skirmisher | 18.9 DPS | 18.939 | +0.2% | |
| Fire | 18.8 DPS | 18.759 | −0.2% | Fireball until OOM at 31.8s, then Arcane Bolt |
| Frost | 17.6 DPS | 17.590 | −0.1% | Ice Bolt until OOM at 35.7s |
| Curses | 17.3 DPS | 17.368 | +0.4% | Wither replace-cycle + Fateweave harm fillers; OOM 98s |
| Berserker | 16.1 DPS | 16.097 | 0.0% | Crit EV on physical hits |
| Bulwark | 14.8 DPS | 14.830 | +0.2% | |
| Charms solo | 14.3 DPS | 14.302 | 0.0% | Fateweave harm |
| Charms party | 22.2 HPS | 22.162 | −0.2% | Mend stream + charm amortized. OOM at 39.8s is reported, not rebalanced |

Crit expected value is `1 + CritChance * (CritMult - 1)`. Sniper 18.44 × 1.0324 ≈ 19.0.

Seeded mode (seed 34) stays within 15% of analytic EV. Curses uses canonical `replace` stacking: one Wither at a time, recast when the DoT expires. Overlapping Wither stacks are a simulator defect, not a class DPS buff.

Charms TTK versus the 120 HP §13 mob is **8.391s**. Design §12 lists 6.3–8.1s across branches. 8.391 is 3.6% above 8.1 and inside the cert ±5% band on that upper bound. This is a source-level sheet discrepancy; slime HP and Fateweave were not retuned.

## Cross-checks

| Check | Canonical | Live rule |
| --- | --- | --- |
| Tank margin | Warrior EHP 308.5 = 1.69–1.79× others | Sheet test |
| Healer vs 1 top DPS | net +4.3 HP/s | Mean of six DPS branches excluding Bulwark/Charms |
| Healer vs 2 top DPS | net −13.6 HP/s, tank ~23s | Intended focus-fire loss |
| TTK vs 120 HP | 6.3–8.1s | Standard §13 L10 mob, **not** live slime HP |
| Greed Berserker | STR > HST > PRE > VIT | +20.5% / +15.8% / +11.3% / ~0% |
| Greed Fire | INT > HST > SPI > PRE | +29.9% / +19.5% / +11.3% / +7.0% |
| Metronome Mage | 5 / (1.5/1.12) = 3.73 ≤ 3.8 | Holds |
| Metronome Mystic | 12 / (1.8/1.03) ≈ 6.87 > 6.2 | Authored miss; do not retune Fateweave |
| XP total | 11,100 | `CANONICAL_XP_TO_NEXT` sum |
| Base arrays | 34 | All four classes |
| L10 total | 115 | 34 + 6×9 + 27 |
| Class / branch points | 2 / 6 | |

## Enemy baselines (§13)

`Mob_HP = 40 + 8 * level` (L1 48, L10 120). `Mob_Damage = 2 + 0.5 * level`. Elite: 3× HP, 2× damage, 3× KillXP. KillXP remains `8 + 2 * level`.

**Do not retune live `enemy.green_slime` maxHealth (20) during certification.** Prompt 18 froze village slime at 20 HP / level 1. KillXP for that slime is still 10.

## Sixteen reference builds

Fixtures exist for every §11 build. Priority metadata resolves, 27 free points allocate, class/branch unspent totals stay 2/6 when unspent, stats stay finite, and primary-stat greed beats a 27-VIT dump on Berserker/Fire/Sniper. Builds are not enforced on players.

## Reproduce

```powershell
Set-Location server
npm run simulate -- --mode analytic --trace
npm test dist-test/tests/progression_dps_audit.test.js
```
