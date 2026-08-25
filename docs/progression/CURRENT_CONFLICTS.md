# Current progression conflicts

PROG-03 makes all four production classes selectable and stores a canonical character progression record. **Live combat, XP grants, and derived combat stats still follow Foundation v1** (3 attributes, cap 5, 8-slot live hotbar, `test.ability.*`). Enabling the 1–10 combat numbers is a later PROG phase.

Canonical target: [rpg-progression-design-v1.0.md](../design/rpg-progression-design-v1.0.md).  
Live ownership: [PROGRESSION_ARCHITECTURE.md](PROGRESSION_ARCHITECTURE.md).

## Four-class roster vs remaining combat

| Live | Design |
| --- | --- |
| Catalog has `class.warrior`, `class.marksman`, `class.mage`, and `class.mystic` (all `rosterSelectable: true`) | Four classes, all selectable |
| Character Select shows **four** cards; create accepts mystic | Four cards |
| Existing warrior/mage/marksman characters keep their class; no auto-convert to Mystic | Same |
| Test classes `test.class.vanguard\|warden\|arcanist` remain for cert | Unchanged test-only ids; not the design roster |

Class ids that already match (`class.warrior` / `mage` / `marksman`) were **extended**, not renamed.

## Stat IDs

| Live | Design |
| --- | --- |
| Combat still uses `test.attribute.might`, `test.attribute.vitality`, `test.attribute.focus` | Eight `stat.*` definitions exist in the catalog but are not evaluated yet (`stat.strength` … `stat.endurance`) |
| HP ≈ starting resource + vitality×5 | `HP_max = 30 + 10 * VIT` |
| Mana ≈ starting resource + focus×8 for **casters**; physical `maxMana` is **0** | `Mana_max = 20 + 4 * INT` casters only |
| Derived `test.stat.attack` from might | Melee/ranged/spell hits from STR/AGI/INT |
| No crit/haste/DR derived stats | §4 formulas |

Live `test.attribute.vitality` is **not** design `stat.vitality`. Canonical 8-stat arrays are stored on class content and copied into tests; live `evaluateStats` does not consume them yet.

## XP curve and level cap

| Live | Design |
| --- | --- |
| Live classes still join with `test.curve.standard` **maxLevel 5** | Cap **10** (`curve.vibecode.l10` is catalogued, unused) |
| `xpRequired` `[50, 75, 100, 150]` sum **375** | `[100, 280, 520, 800, 1120, 1470, 1850, 2260, 2700]` sum **11100** |
| +1 attribute and +1 skill per level-up | +6 automatic and +3 free; skill points only at the timeline |
| Kill XP = content `xpReward` (slime **10**) | `KillXP = 8 + 2 * enemy_level` |
| Quest slime problem XP **20** | Not specified as KillXP; keep until a later content phase |

PROG-03 does **not** grant levels. Existing levels 1–5 are preserved (clamped to 10 if a blob is somehow higher). Characters are not jumped to 10.

## Mana

| Live | Design |
| --- | --- |
| Warrior/Marksman `resourceType` is `resource.none`; `startingResources` omit mana; `evaluateStats.maxMana` is 0 | Warrior/Marksman **no mana** |
| Mage/Mystic keep `test.resource.mana` starting pools | Mage/Mystic mana pool |
| Inn rest restores resources including mana when a pool exists | Physical classes have no bar |

## Haste

| Live | Design |
| --- | --- |
| No haste stat; intervals are raw seconds | `HasteMult = 1 + 0.01 * HST` on autos, casts, DoT ticks |
| Haste does not reduce CDs today (vacuous) | Must remain true when haste exists |

## Cooldowns

| Live | Design |
| --- | --- |
| Stored remaining ticks; GCD field `globalCooldown` (e.g. 0.7s on test melee) | **No global cooldown**; casts/channels block actions |
| No cooldown-recovery rate | Relentless/Nimble/Nest/Runner advance timers at `1+bonus` |

## DoT crit

| Live | Design |
| --- | --- |
| Crit only if `critEnabled && critForced` on the combat formula; periodic ticks do not roll that path | DoTs **never** crit; snapshot INT; preserve total damage when ticks compress |

Aligned in spirit today; later haste/tick-rate must not add DoT crits.

## Active-skill limit / hotbar

| Live | Design |
| --- | --- |
| Live `HOTBAR_SIZE = 8` (server `ability.ts`, client `ability_service.gd`) | Max **4** active hotbar abilities |
| Canonical `hotbarAssignments` is at most 4 and excludes auto-attack, Frenzy, and `test.ability.*` | Auto-attack stays off the active hotbar |
| Unlock-any-ability with skill points | Trees + guaranteed grants per timeline |

New production characters start with an empty canonical hotbar. Live 8-slot `hotbar` remains for Foundation combat presentation. Auto-attack is the ATTACK opcode, not a hotbar id.

## Frenzy vs general active wording

Exact §9.2 table: Frenzy is a **Passive stacker**. It does not take a hotbar slot. The four-active rule is a **hard maximum**, not “every branch has four buttons.” Recorded in [progression-interpretations.md](../design/progression-interpretations.md). Live code has no Frenzy combat behavior. Migration strips `ability.warrior.frenzy` from canonical `hotbarAssignments` if it appears on a live hotbar.

## Inventory / equipment modifiers

Live equipment feeds `stats.ts` channels (`attack`, `max_health`, `max_mana`, percent/multiply layers). Design uses STR/AGI/INT/SPI hit formulas plus multiplicative outgoing/taken modifiers. Later work must keep equipment as a **modifier source** in the existing pipeline, not a second item-stat system. Current training sword / attack-from-might will disagree with §9 auto-attack baselines until retuned.

## Talent / respec

| Live | Design |
| --- | --- |
| Talent trees exist in the catalog; no spend/unlock runtime | Class 3-pick-2; branch 8/9 |
| GM `reset_attribute_allocation` / `reset_skill_allocation` | Trainer NPC, gold **50 × level**, refunds free stats, skill points, **and branch** |
| `npc.lab_trainer` exists as development-only dialogue | Player respec is not implemented |

PROG-03 stores empty `purchasedClassNodeIds` / `purchasedBranchNodeRanks`. Point balances are **calculated** from level and purchases, not trusted from the client.

## Character migration

PROG-03 migrates existing `player` / `progression_<id>` blobs from `progressionSchemaVersion` 1 to **2** on list, join, and export. Rules: keep class from the character record (empty → `legacyMigrationDefault` / `class.warrior`); keep level (clamp 1–10); map `currentXp` → `xpIntoLevel`; keep `lifetimeXp` and live 3-stat allocations / unlocks / 8-slot hotbar; empty free 8-stat allocations and talent purchases; `branchId` empty even at 5+; canonical hotbar = first four live slots that are not empty, not Frenzy, not `test.ability.*`; auto-assign default **off**. Missing blobs initialize canonical level 1 then persist. No starter-equipment duplicate. No quest-reward regrant. Details: [PROGRESSION_MIGRATION_PLAN.md](PROGRESSION_MIGRATION_PLAN.md).

## Shields, taunt, threat

Live: absorb via effect tags (`shield` / `absorb` channel); threat tables and heal threat exist; **no** taunt ability. Design: Protective Charm / Benediction shields; Challenge taunt + DR. Extend `effects.ts` / `threat.ts`; do not add a second combat pipeline.
