# Current progression conflicts

PROG-01 documents conflicts only. **No code or content in this phase resolves them.**

Canonical target: [rpg-progression-design-v1.0.md](../design/rpg-progression-design-v1.0.md).  
Live ownership: [PROGRESSION_ARCHITECTURE.md](PROGRESSION_ARCHITECTURE.md).

## Three-class live vs four-class design

| Live | Design |
| --- | --- |
| Production `class.warrior`, `class.marksman`, `class.mage` | Same three ids **plus** `class.mystic` |
| Character Select iterates `class.*` (three cards) | Four classes |
| Test classes `test.class.vanguard\|warden\|arcanist` remain for cert | Unchanged test-only ids; not the design roster |

Class ids that already match (`class.warrior` / `mage` / `marksman`) must be **extended**, not renamed.

## Stat IDs

| Live | Design |
| --- | --- |
| `test.attribute.might`, `test.attribute.vitality`, `test.attribute.focus` | `stat.strength`, `stat.agility`, `stat.intelligence`, `stat.spirit`, `stat.precision`, `stat.haste`, `stat.vitality`, `stat.endurance` |
| HP ≈ starting resource + vitality×5 | `HP_max = 30 + 10 * VIT` |
| Mana ≈ starting resource + focus×8 for all classes | `Mana_max = 20 + 4 * INT` casters only |
| Derived `test.stat.attack` from might | Melee/ranged/spell hits from STR/AGI/INT |
| No crit/haste/DR derived stats | §4 formulas |

Live `test.attribute.vitality` is **not** design `stat.vitality`.

## XP curve and level cap

| Live | Design |
| --- | --- |
| `test.curve.standard` **maxLevel 5** | Cap **10** |
| `xpRequired` `[50, 75, 100, 150]` sum **375** | `[100, 280, 520, 800, 1120, 1470, 1850, 2260, 2700]` sum **11100** |
| +1 attribute and +1 skill per level-up | +6 automatic and +3 free; skill points only at the timeline |
| Kill XP = content `xpReward` (slime **10**) | `KillXP = 8 + 2 * enemy_level` |
| Quest slime problem XP **20** | Not specified as KillXP; keep until a later content phase |

## Mana

| Live | Design |
| --- | --- |
| Warrior starting mana **20**, Marksman **30**, Mage **60** | Warrior/Marksman **no mana**; Mage/Mystic mana pool |
| Inn rest restores resources including mana | Physical classes have no bar |

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
| `HOTBAR_SIZE = 8` (server `ability.ts`, client `ability_service.gd`) | Max **4** active hotbar abilities |
| Auto-attack is the ATTACK opcode / enemy swing, not a hotbar id | Auto-attack stays off the active hotbar |
| Unlock-any-ability with skill points | Trees + guaranteed grants per timeline |

## Frenzy vs general active wording

Exact §9.2 table: Frenzy is a **Passive stacker**. It does not take a hotbar slot. The four-active rule is a **hard maximum**, not “every branch has four buttons.” Recorded in [progression-interpretations.md](../design/progression-interpretations.md). Live code has no Frenzy.

## Inventory / equipment modifiers

Live equipment feeds `stats.ts` channels (`attack`, `max_health`, `max_mana`, percent/multiply layers). Design uses STR/AGI/INT/SPI hit formulas plus multiplicative outgoing/taken modifiers. Later work must keep equipment as a **modifier source** in the existing pipeline, not a second item-stat system. Current training sword / attack-from-might will disagree with §9 auto-attack baselines until retuned.

## Talent / respec

| Live | Design |
| --- | --- |
| No talent trees | Class 3-pick-2; branch 8/9 |
| GM `reset_attribute_allocation` / `reset_skill_allocation` | Trainer NPC, gold **50 × level**, refunds free stats, skill points, **and branch** |
| `npc.lab_trainer` exists as development-only dialogue | Player respec is not implemented |

## Character migration

Existing saves store 3-stat allocations, 5-cap XP, 8-slot hotbars, and mana on physical classes. A later phase **must** migrate or rebuild per [PROGRESSION_MIGRATION_PLAN.md](PROGRESSION_MIGRATION_PLAN.md). Empty `classId` → `class.warrior` stays. Missing progression remains non-fatal until a phase says otherwise.

## Shields, taunt, threat

Live: absorb via effect tags (`shield` / `absorb` channel); threat tables and heal threat exist; **no** taunt ability. Design: Protective Charm / Benediction shields; Challenge taunt + DR. Extend `effects.ts` / `threat.ts`; do not add a second combat pipeline.
