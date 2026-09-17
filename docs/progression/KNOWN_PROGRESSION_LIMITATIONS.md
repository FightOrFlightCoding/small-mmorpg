# Known progression limitations (PROG-15)

These are accepted live/design gaps after certification. They are not silent defects.

## Prompt 18 village slime

`enemy.green_slime` remains **20 HP**, level 1. Design §13 L1 mob HP is **48**. Certification uses the §13 formula for DPS TTK (`40 + 8 * level`) and does **not** retune slime HP to make class DPS tests pass. Slime KillXP is still `8 + 2 * 1 = 10`, matching authored `xpReward`.

## Fateweave Metronome Law

Mage Arcane Bolt holds: `5 / (1.5 / 1.12) = 3.73 ≤ 3.8`.

Mystic Fateweave is an **authored miss**: `12 / (1.8 / 1.03) ≈ 6.87 > 6.2` regen. Do not rebalance Fateweave to make the inequality hold. The simulator reports `authoredMiss`.

## Charms party HPS methodology

§12 party HPS 22.2 is mend stream 15.9 + charm amortized 6.3. The analytic cert path follows that methodology and reports mana pressure instead of silently cutting HPS for OOM. Live party HPS is 22.162; OOM at 39.8s is reported.

Charms solo TTK versus the 120 HP §13 mob is 8.391s. Design §12 lists 6.3–8.1s across branches. 8.391 is 3.6% above 8.1 and inside the cert ±5% band. This is a source-level sheet discrepancy; Fateweave and slime HP were not retuned.

## Noncanonical content

| Item | Status |
| --- | --- |
| Quest `quest.slime_problem` XP 20 | `NONCANONICAL_CONTENT_VALUE` (`project.quest.slime_problem.xp`) |
| `test.class.*`, Foundation 3-stat fields, 8-slot `HOTBAR_SIZE` | `TEST_ONLY_PERMANENT` |
| Authored `levelCurveId` `test.curve.standard` on production classes | Overlay `canonicalLevelCurveId` `curve.vibecode.l10` at runtime so the content hash stays stable |

## Geometry and compile-time numbers

Party radius 80, melee 40, ranged 180, cone 60°, and other omitted units live in [progression-implementation-addendum.md](../design/progression-implementation-addendum.md). §14 compile-time ability bases are first-pass tunables; PROG-15 did not retune them.

## Product scope still excluded

Multiple zones, extra character slots, guilds, talent trading, crafting, PvP, monetization, open-world streaming. PvP stays `pvp_disabled`.

## Tag

Suggested tag `character-progression-v1` is **not** created by this phase.
