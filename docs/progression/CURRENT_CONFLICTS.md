# Current progression conflicts

PROG-05 is the accepted 1–10 leveling pipeline. Remaining live/design gaps are **owned staged work**, not items that will vanish on their own.

Canonical target: [rpg-progression-design-v1.0.md](../design/rpg-progression-design-v1.0.md).  
Live ownership: [PROGRESSION_ARCHITECTURE.md](PROGRESSION_ARCHITECTURE.md).  
Noncanonical numbers: [progression-implementation-addendum.md](../design/progression-implementation-addendum.md).  
Final save mapping: [PROGRESSION_MIGRATION_PLAN.md](PROGRESSION_MIGRATION_PLAN.md).

This register does **not** mean PROG-05 failed. Production HP, mana, regen, crit, haste, DR, power-category hit functions, damage order, modifier identity, the level-10 auto-growth sheet, the L10 XP curve, KillXP, automatic growth, free points, auto-assign, and milestones are implemented and tested. Live ATTACK, the 8-slot Foundation hotbar, `test.ability.*` GCD, leftover 3-stat fields, and talent spend remain because later PROG phases own those subsystems.

## Status values

| Status | Meaning |
| --- | --- |
| `RESOLVED` | Live production path matches the design for this item. Keep the closure test. |
| `DEFERRED` | Expected live/design gap. Has a later PROG owner. Forbidden after PROG-15. |
| `TEST_ONLY_PERMANENT` | Allowed only on development/cert fixtures outside production bundles. |
| `NONCANONICAL_CONTENT_VALUE` | Kept live value that is not design data. Must stay in the implementation addendum. |
| `BLOCKING` | Must be fixed before the next named PROG phase. None may remain at PROG-15. |

By **PROG-15**:

- No `DEFERRED` production conflict may remain.
- `TEST_ONLY_PERMANENT` entries may remain only outside production bundles.
- `NONCANONICAL_CONTENT_VALUE` entries must be recorded in the implementation addendum.
- No `BLOCKING` item may remain.

Every conflict below has **Status**, **Resolution owner**, **Must be resolved by**, and **Closure test**.

## Expected later phases

| Phases | Owns |
| --- | --- |
| PROG-04 | Canonical mathematical foundation (accepted) |
| PROG-05 | XP curve, automatic growth, free points, auto-assign, milestones (accepted) |
| PROG-06–07 | Class/branch talent spend, ownership, **one** production hotbar |
| PROG-08 | Canonical combat mechanics (no production GCD) |
| PROG-09–12 | Every class and branch, including auto-attacks |
| PROG-13 | Complete player-facing progression UI |
| PROG-14 | Persistence and lifecycle integration, **final** legacy migration |
| PROG-15 | Remove production legacy paths and certify balance |

## PROG-05 go/no-go

Proceed to PROG-05 only when every row is true. These are PROG-04 exit criteria, not PROG-05 work.

| Criterion | Evidence |
| --- | --- |
| All previous tests still pass | Content, design audit, foundation audit, server, client gates |
| Complete level-10 auto-growth reference sheet passes | `server/tests/progression_l10_sheet.test.ts` |
| All four production classes use canonical base arrays | `class.warrior` / `mage` / `marksman` / `mystic` `baseStats` |
| Production HP, mana, regen, crit, haste, and DR are server-calculated | `canonical_stats.ts` + `evaluateStats` overlay |
| Warrior and Marksman have no mana state | `maxMana` 0; mana key omitted; no mana UI |
| Mage and Mystic regenerate mana continuously | `mana = min(max, current + regen * delta)` |
| Canonical melee/ranged/spell/heal functions exist and have tests | `formulaMeleeHit` / `RangedHit` / `SpellHit` / `Heal` and `scalePower`; curse uses INT, shield uses SPI |
| Damage-order pipeline is tested | raw scaled → crit → outgoing → DR → taken |
| Haste tests prove cooldowns are unchanged | stored GCD/ICD ticks are not divided by haste |
| DoT timing tests prove total damage is preserved | `magnitude * duration / baseInterval` independent of haste |
| Periodic effects cannot enter the crit path | `evaluateCanonicalHit` with `isDot` never crits, including guaranteed-crit |
| Modifier-rank replacement works | higher rank of the same node replaces |
| Different-source multiplication works | distinct `sourceId` percentage mods multiply |
| The client cannot submit final stats | `stat_injection` on create/allocate/combat |
| Every unresolved item has an assigned later phase | this register; no `BLOCKING` rows |
| Quest XP 20 is recorded as noncanonical content | `project.quest.slime_problem.xp` in the addendum |
| Legacy migration is marked for final resolution in PROG-14 | `C-legacy-migration` |

## PROG-06 go/no-go

Proceed to PROG-06 only when every row is true. These are PROG-05 exit criteria, not PROG-06 work.

| Criterion | Evidence |
| --- | --- |
| All previous tests still pass | Content, design audit, foundation audit, server, client gates |
| Every XP transition and 11100 total | `server/tests/progression_xp_curve.test.ts` |
| Multi-level grant, duplicate event, cap overflow | `server/tests/progression_timeline.test.ts` |
| Production KillXP and elite `* 3` | same curve tests; test classes keep `xpReward` |
| Automatic growth is computed, not stored as allocations | timeline growth test |
| Free points equal `3 * (level - 1)` | timeline free-point test |
| Auto-assign on gain spends only the new three points | timeline auto-assign tests |
| Toggle on does not spend existing points | match `SET_AUTO_ASSIGN` test |
| Pending branch at 5 and 10 does not invent a branch | timeline pending/L10 tests |
| Reconnect, restart, Character Select level | storage round-trip + character-select tests |
| Client cannot inject XP | protocol `stat_injection` + timeline injection test |
| Content hash unchanged | `3b57502b4a197972c970420cd7b2a5a74955311b5840be0b4d184843c24e3320` |
| Talent spend remains later | `C-talent-runtime` |

## Conflict register

### C-canonical-damage

- **Conflict:** Live ATTACK still uses Foundation `test.stat.attack`, which can look as if PROG-04 omitted STR/AGI/INT hit math.
- **Status:** RESOLVED
- **Resolution owner:** PROG-04 (functions and tests). Live opcode retune is `C-attack-foundation`.
- **Must be resolved by:** Accepted in PROG-04.
- **Closure test:** `formulaMeleeHit = base × (1 + STR/100)`, `formulaRangedHit` with AGI, `formulaSpellHit` with INT (also `scalePower(..., "curse")`), `formulaHeal` with SPI (also `scalePower(..., "shield")`). `evaluateCanonicalHit` applies raw scaled hit, crit, outgoing product, damage reduction, then taken product. Covered by `server/tests/progression_formulas.test.ts`. No class.* character damage may read `test.stat.attack` after `C-attack-foundation` closes.

### C-attack-foundation

- **Conflict:** Live ATTACK uses Foundation `test.stat.attack` (might + gear). Canonical auto-attacks are not live. ATTACK does not roll canonical crit.
- **Status:** DEFERRED
- **Resolution owner:** PROG-08 generic combat pipeline; PROG-09 through PROG-12 class implementations.
- **Must be resolved by:** Before PROG-13 UI certification.
- **Closure test:** Every production class auto-attack uses its canonical base damage, interval, scaling stat, haste behavior, crit behavior, and server authority. No `class.*` character damage reads `test.stat.attack`.

### C-roster-four-classes

- **Conflict:** Historical three-class roster vs four design classes.
- **Status:** RESOLVED
- **Resolution owner:** PROG-03
- **Must be resolved by:** Accepted in PROG-03.
- **Closure test:** Catalog and Character Select expose `class.warrior`, `class.mage`, `class.marksman`, and `class.mystic` (`rosterSelectable: true`). Existing warrior/mage/marksman characters keep their class; no auto-convert to Mystic. Class ids that already matched were extended, not renamed.

### C-test-classes-fixtures

- **Conflict:** `test.class.vanguard|warden|arcanist` remain in the catalog.
- **Status:** TEST_ONLY_PERMANENT
- **Resolution owner:** Prompt 18 / Foundation cert fixtures. PROG-15 confirms they stay out of production bundles.
- **Must be resolved by:** Remain allowed only as development/cert fixtures.
- **Closure test:** Production roster never includes `test.class.*`. Cert fixtures that need Foundation `evaluateStats` layers keep using these ids.

### C-stat-ids-production

- **Conflict:** Live `test.attribute.vitality` is not design `stat.vitality`.
- **Status:** RESOLVED
- **Resolution owner:** PROG-04 for production vitals and eight `stat.*` totals.
- **Must be resolved by:** Accepted in PROG-04.
- **Closure test:** Production `class.*` characters use canonical `baseStats` + growth + free allocations + identified equipment/effect modifiers. Test classes without `baseStats` keep Foundation layers.

### C-xp-curve-live

- **Conflict:** Live classes still join with `test.curve.standard` **maxLevel 5**, `xpRequired` `[50, 75, 100, 150]` sum **375**, and +1 attribute / +1 skill per level-up. Design cap is **10**, `curve.vibecode.l10` sum **11100**, +6 automatic and +3 free, skill points only on the timeline.
- **Status:** RESOLVED
- **Resolution owner:** PROG-05 leveling and allocation.
- **Must be resolved by:** Accepted in PROG-05 for production `class.*` characters.
- **Closure test:** Production `class.*` characters overlay `canonicalLevelCurveId` `curve.vibecode.l10` (authored `levelCurveId` remains `test.curve.standard` so the content hash is unchanged). Level-up grants +6 automatic growth and +3 free points. Foundation +1/+1 remains only on `test.class.*` / `test.curve.standard`. Covered by `server/tests/progression_xp_curve.test.ts` and `server/tests/progression_timeline.test.ts`.

### C-kill-xp

- **Conflict:** Kill XP = content `xpReward` (slime **10**). Design `KillXP = 8 + 2 * enemy_level`.
- **Status:** RESOLVED
- **Resolution owner:** PROG-05 trusted XP service. Elite multiplier is `* 3`. The unused `8 + 3 * level` dial is not implemented.
- **Must be resolved by:** Accepted in PROG-05 for production `class.*` kills.
- **Closure test:** Production enemy deaths grant `8 + 2 * enemy_level`, elite `* 3`. `enemy.green_slime` is level 1 so KillXP is **10**, matching the authored `xpReward`. Test classes still use content `xpReward`. Covered by `server/tests/progression_xp_curve.test.ts`. Quest slime-problem **20** remains `C-quest-xp-20`.

### C-quest-xp-20

- **Conflict:** Quest slime problem XP is **20**. Design does not specify that reward as KillXP.
- **Status:** NONCANONICAL_CONTENT_VALUE
- **Resolution owner:** Content; recorded as `project.quest.slime_problem.xp`.
- **Must be resolved by:** Keep until a later content phase changes the quest. Recertify at PROG-15 if still live.
- **Closure test:** Addendum row exists. Runtime quest grant stays 20 until a named content change. Do not treat 20 as canonical KillXP.

### C-mana-physical

- **Conflict:** Design physical classes have no mana.
- **Status:** RESOLVED
- **Resolution owner:** PROG-04
- **Must be resolved by:** Accepted in PROG-04.
- **Closure test:** Warrior/Marksman `resourceType` is `resource.none`; `startingResources` omit mana; `evaluateStats.maxMana` is 0; client omits the mana resource and mana UI.

### C-mana-casters

- **Conflict:** Design casters use `Mana_max` / `ManaRegen` / current mana.
- **Status:** RESOLVED
- **Resolution owner:** PROG-04
- **Must be resolved by:** Accepted in PROG-04.
- **Closure test:** Mage/Mystic use `20+4*INT` and `1+0.2*SPI`. Regen is `min(max, current + regen * delta)` each tick.

### C-haste-cooldowns

- **Conflict:** Design haste never reduces stored cooldown duration.
- **Status:** RESOLVED
- **Resolution owner:** PROG-04
- **Must be resolved by:** Accepted in PROG-04. Keep the invariant in later combat phases.
- **Closure test:** Production classes apply `HasteMult` to auto-attack interval, cast time, channel time, and DoT tick interval (total DoT damage preserved). Stored cooldown duration and GCD/ICD ticks are **not** divided by haste.

### C-cooldown-recovery-rate

- **Conflict:** No cooldown-recovery rate. Design Relentless/Nimble/Nest/Runner advance timers at `1+bonus`.
- **Status:** DEFERRED
- **Resolution owner:** PROG-09 through PROG-12 (those talents).
- **Must be resolved by:** Before PROG-13, for any live talent that grants cooldown recovery.
- **Closure test:** Those nodes multiply cooldown remaining-tick consumption. Haste still does not change stored cooldown duration.

### C-gcd

- **Conflict:** Live stored remaining ticks include a GCD field `globalCooldown` (e.g. 0.7s on test melee). Design has **no global cooldown**; casts/channels block incompatible actions; physical skills are gated by individual cooldowns.
- **Status:** DEFERRED
- **Resolution owner:** PROG-08 generic combat pipeline. PROG-15 production audit.
- **Must be resolved by:** Before canonical `ability.*` become live (PROG-08). PROG-15 fails if production still depends on GCD.
- **Closure test:** PROG-08 acceptance: no production class, production ability, authoritative cast state, or production client UI uses a global cooldown. Legacy `test.ability.*` may retain a GCD only when their package is development-only and excluded from production. PROG-15 search of production bundles and runtime paths for `globalCooldown`, `global_cooldown`, and `gcd` must find no production progression ability dependency.

### C-dot-crit-engine

- **Conflict:** Design DoTs never crit and preserve total damage when ticks compress.
- **Status:** RESOLVED
- **Resolution owner:** PROG-04 engine. Live `test.ability.*` still use Foundation `critEnabled && critForced`.
- **Must be resolved by:** Accepted in PROG-04 for the canonical hit/DoT helpers. Foundation ability crit flags stay with `C-attack-foundation` / test fixtures.
- **Closure test:** `evaluateCanonicalHit({ isDot: true })` never crits, including `guaranteedCrit`. Haste-scaled tick interval preserves `magnitude * duration / baseInterval`. Periodic ticks do not take the direct-hit crit path.

### C-hotbar-dual

- **Conflict:** Live `HOTBAR_SIZE = 8` (server `ability.ts`, client `ability_service.gd`) coexists with canonical `hotbarAssignments` (max 4, excludes auto-attack, Frenzy, and `test.ability.*`). Two independently mutable records (`live` hotbar vs canonical hotbar) must not survive as production authorities.
- **Status:** DEFERRED
- **Resolution owner:** PROG-07 ownership, trees, and hotbar.
- **Must be resolved by:** End of PROG-07. Temporary coexistence is acceptable until then.
- **Closure test:** After PROG-07 there is one authoritative production hotbar model: 4 active slots; auto-attack separate; passives excluded; Frenzy excluded. The eight-slot path is removed, migrated, or confined to explicitly test-only fixtures. Ability ownership comes from level, branch, and purchased nodes. “Unlock any ability using skill points” is gone from production behavior.

### C-unlock-any-ability

- **Conflict:** Live skill points can unlock any unlocked-list ability. Design grants from the timeline and trees.
- **Status:** DEFERRED
- **Resolution owner:** PROG-07
- **Must be resolved by:** End of PROG-07, with `C-hotbar-dual`.
- **Closure test:** Production cannot spend points to unlock an arbitrary `test.ability.*` or `ability.*` id outside class/branch/node grants. New production characters keep an empty canonical hotbar until those grants exist. Auto-attack remains the ATTACK opcode, not a hotbar id.

### C-frenzy-passive

- **Conflict:** Exact §9.2 table: Frenzy is a **Passive stacker** and does not take a hotbar slot. The four-active rule is a hard maximum, not “every branch has four buttons.”
- **Status:** RESOLVED
- **Resolution owner:** PROG-01 interpretation; PROG-03 migration strips `ability.warrior.frenzy` from canonical `hotbarAssignments`. Combat behavior is `C-frenzy-combat`.
- **Must be resolved by:** Accepted as a reading. Keep the strip rule until PROG-07 owns the hotbar.
- **Closure test:** Interpretations doc plus migration strip. Live code has no Frenzy combat behavior until `C-frenzy-combat`.

### C-frenzy-combat

- **Conflict:** Live code has no Frenzy combat behavior.
- **Status:** DEFERRED
- **Resolution owner:** PROG-09 Warrior / Berserker.
- **Must be resolved by:** Before PROG-13 for Berserker certification.
- **Closure test:** Frenzy is a passive stacker, not a hotbar active, with the design stack/drop rules.

### C-equipment-auto-attack-baseline

- **Conflict:** Live equipment is an identified modifier source in `canonical_stats.ts`. Training sword / attack-from-might still disagree with §9 auto-attack baselines.
- **Status:** DEFERRED
- **Resolution owner:** PROG-08 through PROG-12 auto-attack retune.
- **Must be resolved by:** Before PROG-13.
- **Closure test:** Production auto-attack baselines match §9. Outgoing and taken percentage modifiers from different sources still multiply; higher ranks of the same talent node still replace.

### C-talent-runtime

- **Conflict:** Talent trees exist in the catalog; no spend/unlock runtime. Class 3-pick-2 and branch 8/9 are not playable. PROG-03 stores empty `purchasedClassNodeIds` / `purchasedBranchNodeRanks`. Point balances are calculated.
- **Status:** DEFERRED
- **Resolution owner:** PROG-06 class points; PROG-07 branch trees and ownership.
- **Must be resolved by:** End of PROG-07.
- **Closure test:** Purchases persist as node ids/ranks. Balances recompute from level and purchases. The client cannot submit a finished tree.

### C-respec

- **Conflict:** GM `reset_attribute_allocation` / `reset_skill_allocation` vs trainer NPC, gold **50 × level**, refunds free stats, skill points, **and branch**. `npc.lab_trainer` is development-only dialogue. Player respec is not implemented.
- **Status:** DEFERRED
- **Resolution owner:** PROG-14 lifecycle (trainer, gold, refunds) after PROG-07 makes spend real.
- **Must be resolved by:** PROG-14, before PROG-15.
- **Closure test:** Player respec charges `50 × level`, refunds free stats, skill points, and branch, and does not use a GM command as the production path.

### C-legacy-migration

- **Conflict:** PROG-03 v1→v2 keeps live 3-stat allocations / unlocks / 8-slot hotbar and leaves canonical `freeStatAllocations` and talent purchases empty. That is acceptable only for development or certification characters. It is not acceptable for real players whose old investment would sit in fields the canonical engine no longer reads. A blob already marked `progressionSchemaVersion` 2 can still contain leftover Foundation fields and must not be skipped forever.
- **Status:** DEFERRED
- **Resolution owner:** PROG-14 persistence and lifecycle integration.
- **Must be resolved by:** Before PROG-14 completes. Do not wait for PROG-15 to discover stranded investment.
- **Closure test:** Before PROG-14, classify every existing character as development/test or real player. Development/test characters may be migrated under deterministic test rules, reset through authorized development tooling, or retained solely for regression compatibility. Real player characters must have old allocation translated deterministically, refunded as equivalent canonical unspent points, or explicitly reset with a visible migration notice. Do not leave old investment in a field the canonical stat engine no longer reads. PROG-14 runs migration logic even for records already marked schema version 2 when they still contain legacy fields (`allocatedAttributes` / live 8-slot `hotbar` / `unlockedAbilityIds` as production authority). Details stay in [PROGRESSION_MIGRATION_PLAN.md](PROGRESSION_MIGRATION_PLAN.md).

### C-shields-taunt

- **Conflict:** Live absorb uses effect tags (`shield` / `absorb` channel); threat tables and heal threat exist; **no** taunt ability. Design: Protective Charm / Benediction shields; Challenge taunt + DR.
- **Status:** DEFERRED
- **Resolution owner:** PROG-09–12. Extend `effects.ts` / `threat.ts`; do not add a second combat pipeline.
- **Must be resolved by:** Before PROG-13 for the classes that own those skills.
- **Closure test:** Those abilities use the single combat pipeline. Shields use SPI scaling and do not crit unless content sets `shieldCanCrit`.
