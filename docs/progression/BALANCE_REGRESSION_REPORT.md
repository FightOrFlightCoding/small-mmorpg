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

| Branch | Target DPS | Party HPS | Notes |
| --- | --- | --- | --- |
| Sniper | 19.0 | — | Autos pause per Snipe |
| Skirmisher | 18.9 | — | |
| Fire | 18.8 | — | Spender until OOM, then Arcane Bolt |
| Frost | 17.6 | — | Ice Bolt then Arcane Bolt |
| Curses | 17.3 | — | Wither cycle + Fateweave fillers |
| Berserker | 16.1 | — | Crit EV on physical hits |
| Bulwark | 14.8 | — | |
| Charms solo | 14.3 | — | Fateweave harm |
| Charms party | — | 22.2 | 15.9 mend stream + 6.3 charm amortized. Mana pressure is reported; the design methodology is not rebalanced for OOM |

Crit expected value is `1 + CritChance * (CritMult - 1)`. Sniper 18.44 × 1.0324 ≈ 19.0.

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
