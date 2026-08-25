# RPG Progression System — Design Document v1.0

Four classes, eight branches, levels 1–10. All numbers in this document are canonical and balance-audited by simulation unless explicitly listed in §14 (Compile-Time Additions). Time is in seconds; damage/healing are unitless points.

---

## 1. Design Pillars (implementation invariants)

1. **Leveling beats allocation.** Automatic stat growth (+6/level) is double the free allocation (+3/level). A player who never opens a menu must remain fully functional.
2. **No stat caps.** Headroom exists for future level-cap raises. Dump builds are policed by auto-growth (guaranteed baseline VIT/END) and by the resource economy, not by caps.
3. **Asymmetric resources.** Casters (Mage, Mystic) use mana + cooldowns and play a budgeting game. Physical classes (Warrior, Marksman) have **no resource bar** — skills are gated purely by cooldowns and play a timing game.
4. **Haste never reduces cooldowns.** Haste speeds auto-attacks, cast times, and DoT ticks only. Cooldown recovery exists exclusively as talent-tree nodes.
5. **The Metronome Law.** Every caster's basic skill must be mana-neutral or better at level-10 auto-growth baseline (cost/cast-time ≤ passive regen). Spenders create mana pressure; the basic is the guaranteed floor.
6. **Actives ceiling.** Every character ends level 10 with exactly 3 guaranteed active skills (basic, signature, capstone) + at most 1 buyable tree active = **4 max**.
7. **DoTs never crit.** Haste accelerates their tick rate (same total damage, shorter duration).
8. **Milestone rhythm.** Levels 2, 5, 10 grant skills; all other levels grant stats + a skill point. No dead levels.
9. Every branch pair is alliterative; every branch contains self-sustain in its own flavor.

---

## 2. Roster

| Class | Branch A | Branch B | Resource | Basic (L2) | Signature (L5) | Capstone (L10) |
|---|---|---|---|---|---|---|
| Warrior | Bulwark (tank) | Berserker (melee DPS) | None (cooldowns) | Heavy Strike | Challenge / Frenzy | Unbreakable / Berserk |
| Mage | Fire (burst) | Frost (control) | Mana | Arcane Bolt | Fireball / Ice Bolt | Meteor / Absolute Zero |
| Marksman | Sniper (heavy shots) | Skirmisher (rapid shots) | None (cooldowns) | Aimed Shot | Snipe / Barrage | Coup de Grâce / Arrowstorm |
| Mystic | Charms (heal/buff) | Curses (debuff/DoT) | Mana | Fateweave | Protective Charm / Wither | Benediction / Malediction |

---

## 3. Stat System — 8 stats

### Power stats (class identity)

| Stat | Effect per point |
|---|---|
| Strength (STR) | +1% melee damage. **Universal:** +1% critical damage (see CritMult formula). |
| Agility (AGI) | +1% ranged damage. |
| Intelligence (INT) | +1% spell & curse damage; +4 max mana (casters only). |
| Spirit (SPI) | +1% healing power; +0.2 mana regen/sec (casters only). |

### Style stats (universal)

| Stat | Effect per point |
|---|---|
| Precision (PRE) | +0.5% critical chance. |
| Haste (HST) | +1% attack speed and cast speed; DoT ticks accelerate. Never affects cooldowns. |
| Vitality (VIT) | +10 max HP. |
| Endurance (END) | +0.5% damage reduction. |

There are no caps. Stats irrelevant to a class (e.g. Warrior INT) simply sit at their base value — this is intentional (the board communicates class identity).

---

## 4. Core Formulas

```
HP_max          = 30 + 10 * VIT
Mana_max        = 20 + 4 * INT              # Mage & Mystic only
ManaRegen       = 1.0 + 0.2 * SPI           # per second, Mage & Mystic only
CritChance      = 0.005 * PRE               # e.g. PRE 12 -> 6%
CritMult        = 1.5  + 0.01 * STR         # e.g. STR 35 -> 1.85x
HasteMult       = 1 + 0.01 * HST
DamageReduction = 0.005 * END               # damage taken *= (1 - DR)
EffectiveHP     = HP_max / (1 - DamageReduction)

AttackInterval  = WeaponBaseInterval / HasteMult
CastTime        = BaseCastTime / HasteMult
DoT_TickInterval= BaseTickInterval / HasteMult   # total damage unchanged

MeleeHit   = BaseDamage * (1 + STR/100)
RangedHit  = BaseDamage * (1 + AGI/100)
SpellHit   = BaseDamage * (1 + INT/100)     # includes curse/DoT scaling
Heal       = BaseHeal   * (1 + SPI/100)     # includes shields/absorbs
On crit    : hit *= CritMult                # DoT ticks never crit

DamageTaken = Hit * (1 - DamageReduction) * PRODUCT(1 + takenModifiers)
              # takenModifiers: Evil Eye +0.15, Reckless +0.05, Berserk +0.20, etc.
```

**Modifier stacking rule:** percentage modifiers from *different* sources multiply; higher ranks of the *same* node replace the lower rank (never stack). Expected crit value for DPS math: `EV = 1 + CritChance * (CritMult - 1)`.

---

## 5. Resources

- **Warrior, Marksman:** no resource. Every skill gated only by its own cooldown. No global cooldown; casts/channels block other actions while active.
- **Mage, Mystic:** mana pool + regen per §4. Skills cost mana AND have cast times; big effects may also carry cooldowns. Regen ticks continuously (apply `regen * delta` per frame, clamp to Mana_max).
- **Capstones cost 0 mana** — gated purely by their long cooldowns.
- Metronome Law check (must hold in any rebalance): `AB_mana / (AB_cast / class_L10_haste) <= class_L10_regen`. Current: 5 / (1.5/1.12) = 3.73 ≤ 3.8 ✓.

---

## 6. Character Creation & Leveling

### 6.1 Base arrays (level 1) — identical 34-point budgets

| Class | STR | AGI | INT | SPI | VIT | PRE | HST | END |
|---|---|---|---|---|---|---|---|---|
| Warrior | 8 | 4 | 2 | 3 | 8 | 3 | 3 | 3 |
| Mage | 2 | 4 | 9 | 5 | 5 | 3 | 3 | 3 |
| Marksman | 4 | 9 | 3 | 3 | 6 | 3 | 3 | 3 |
| Mystic | 2 | 4 | 6 | 8 | 5 | 3 | 3 | 3 |

### 6.2 Per level-up: +6 automatic (fixed template) and +3 free (player-allocated)

| Class | Automatic growth per level |
|---|---|
| Warrior | +3 STR, +2 VIT, +1 END |
| Mage | +3 INT, +1 SPI, +1 VIT, +1 HST |
| Marksman | +3 AGI, +1 PRE, +1 VIT, +1 HST |
| Mystic | +2 INT, +2 SPI, +1 VIT, +1 END |

Totals at level 10: 34 base + 54 automatic + 27 free = 115 stat points.

**Recommended feature — auto-assign toggle:** when ON, the 3 free points are spent along the same template proportions (Warrior: +2 STR +1 VIT; Mage: +2 INT +1 HST; Marksman: +2 AGI +1 PRE; Mystic: +1 INT +1 SPI +1 VIT) so casual players grow at full speed.

**Respec:** a trainer NPC refunds ALL free stat points, all skill points, and the branch choice for a gold cost (suggested: 50 × current level).

### 6.3 Level-10 reference sheet (auto-growth only, zero free points) — regression targets

| | Warrior | Mage | Marksman | Mystic |
|---|---|---|---|---|
| STR/AGI/INT/SPI | 35 / 4 / 2 / 3 | 2 / 4 / 36 / 14 | 4 / 36 / 3 / 3 | 2 / 4 / 24 / 26 |
| VIT / PRE / HST / END | 26 / 3 / 3 / 12 | 14 / 3 / 12 / 3 | 15 / 12 / 12 / 3 | 14 / 3 / 3 / 12 |
| HP | 290 | 170 | 180 | 170 |
| Effective HP | 308.5 | 172.6 | 182.7 | 180.9 |
| Mana / Regen | — | 164 / 3.8/s | — | 116 / 6.2/s |
| Crit chance / Crit mult | 1.5% / 1.85× | 1.5% / 1.52× | 6.0% / 1.54× | 1.5% / 1.52× |
| Haste / Damage reduction | 1.03 / 6% | 1.12 / 1.5% | 1.12 / 1.5% | 1.03 / 6% |

---

## 7. XP Curve

```
XP_to_next(level) = round_to_tens(100 * level^1.5)
KillXP(enemy_level) = 8 + 2 * enemy_level        # steeper alternative dial: 8 + 3*level
```

| Level-up | 1→2 | 2→3 | 3→4 | 4→5 | 5→6 | 6→7 | 7→8 | 8→9 | 9→10 |
|---|---|---|---|---|---|---|---|---|---|
| XP | 100 | 280 | 520 | 800 | 1,120 | 1,470 | 1,850 | 2,260 | 2,700 |
| Same-level kills | 10 | 24 | 37 | 50 | 62 | 74 | 84 | 94 | 104 |

Total: 11,100 XP ≈ 540 kills ≈ 3¾–5 hours at a ~25s full kill cycle (pull + fight + loot + travel; pure combat TTK is 6–8s, see §12). Pacing dials, in order of preference: mob HP → KillXP slope → never the level formula (milestones must stay pinned).

---

## 8. Progression Timeline

| Level | Automatic | Player choice |
|---|---|---|
| 1 | Auto-attack only | None (free points begin at the first level-up) |
| 2 | **Basic skill** | +3 stats |
| 3 | — | +3 stats, **+1 skill point** (class tree) |
| 4 | — | +3 stats, +1 skill point (class tree) |
| 5 | **Branch choice + Signature skill** | +3 stats, +1 skill point (branch tree) |
| 6–9 | — | +3 stats, +1 skill point (branch tree) each level |
| 10 | **Capstone** | +3 stats, +1 skill point (branch tree) |

Skill points total 8: 2 into the class tree (of 3 nodes — one is always skipped), 6 into the branch tree (9 point-slots — a third is always unbought; the skipped nodes are replay value).

**Tier gates (branch trees):** Tier 1 open at L5; Tier 2 requires 2 points already spent in the tree; Tier 3 requires 4 points spent. Earliest Tier-3 purchase is therefore level 9.

---

## 9. Skills — Locked Baseline Numbers

### 9.1 Auto-attacks

| Class | Base damage | Interval | Scaling |
|---|---|---|---|
| Warrior | 12 | 2.0s | STR (melee) |
| Marksman | 10 | 1.8s | AGI (ranged) |
| Mage | 6 | 2.0s | INT (spell) |
| Mystic | 6 | 2.0s | INT (spell) |

### 9.2 Active skills master table

| Skill | Class/Branch | Type | Base | Timing | Cost | Notes |
|---|---|---|---|---|---|---|
| Heavy Strike | Warrior basic | Melee hit | 28 | 6s CD, instant | — | |
| Challenge | Bulwark signature | Taunt | 0 | 15s CD | — | Taunts nearby enemies onto you; +armor equivalent: +15% DR for 4s |
| Shield Bash | Bulwark tree active | Melee hit + control | 10 | 12s CD | — | Interrupts casts; stuns 1s (R2: 2s) |
| Frenzy | Berserker signature | Passive stacker | — | — | — | Consecutive hits grant +5% attack speed/stack, max 3 (R2: max 5; R3: +7%/stack). Stacks drop after 5s without hitting |
| Whirlwind | Berserker tree active | Melee AoE | 24 | 10s CD | — | Hits all enemies within melee radius |
| Aimed Shot | Marksman basic | Ranged hit | 22 | 6s CD, instant | — | |
| Snipe | Sniper signature | Ranged hit | 45 | 10s CD | — | 1.5s aim channel (reduced by Haste); auto-attacks pause while aiming; +30% range |
| Piercing Shot | Sniper tree active | Ranged line AoE | 30 | 14s CD | — | Travels through all enemies in a line (R2: also slows 30% for 2s) |
| Barrage | Skirmisher signature | Ranged multi-hit | 3 × 6 = 18 | 5s CD, instant | — | Each arrow rolls crit independently (R2: 4 arrows; R3: +20% per arrow) |
| Vault | Skirmisher tree active | Mobility | 0 | 15s CD | — | Leap backward ~5m; +30% move speed 2s (R2: caltrops at launch point, 30% slow 3s) |
| Arcane Bolt | Mage basic | Spell hit | 16 | 1.5s cast | 5 mana | The sustainable metronome (see §5) |
| Fireball | Fire signature | Spell hit | 34 | 2.5s cast | 20 mana | (R3: cast 2.0s) |
| Flame Wave | Fire tree active | Spell cone AoE | 22 | 10s CD, 1.5s cast | 25 mana | (R2: ground burns 12 over 3s, INT-scaled) |
| Ice Bolt | Frost signature | Spell hit + slow | 24 | 2.0s cast | 15 mana | Slows target 30% for 3s (Deep Chill: 4s/5s) |
| Flash Freeze | Frost tree active | Control AoE | 0 | 15s CD, instant | 20 mana | Roots all adjacent enemies 2s (R2: 3s, +50% radius) |
| Fateweave | Mystic basic | Dual polarity | 20 harm / 22 mend | 1.8s cast | 12 mana | On enemy: SpellHit (INT). On ally/self: Heal (SPI) |
| Protective Charm | Charms signature | Ally shield | 40 absorb | 8s CD, instant | 18 mana | 6s duration, SPI-scaled (R2: +30% absorb; R3: on break/expire heals 15% of absorb) |
| Blessing | Charms tree active | Party buff | — | 20s CD, instant | 25 mana | Nearby allies +10% damage for 10s (R2: also +8% DR) |
| Wither | Curses signature | DoT | 36 over 8s | 1.5s cast | 14 mana | 8 ticks base; INT-scaled; no crit (R3: withered enemies deal −10% damage) |
| Evil Eye | Curses tree active | Debuff | — | 12s CD, instant | 15 mana | Target takes +15% damage from ALL sources, 8s |

### 9.3 Capstones (auto-granted at L10; 0 mana; long cooldowns)

| Capstone | Branch | Effect | CD |
|---|---|---|---|
| Unbreakable | Bulwark | −50% damage taken for 8s | 90s |
| Berserk | Berserker | +50% damage dealt, +20% damage taken, 10s | 90s |
| Meteor | Fire | Mark area; after 1.5s delay, 60 base spell AoE that **always crits** | 90s |
| Absolute Zero | Frost | Freeze all nearby enemies solid (full incapacitate) 4s | 90s |
| Coup de Grâce | Sniper | 70 base ranged hit, **guaranteed crit**; cooldown resets if it kills | 60s |
| Arrowstorm | Skirmisher | +40% attack speed 8s; your bleeds tick at double speed | 90s |
| Benediction | Charms | All nearby allies instantly healed for 30% of their max HP + shield of 10% max HP for 4s | 90s |
| Malediction | Curses | Apply Wither (current rank) to all nearby enemies; they deal −15% damage while it runs | 90s |

Capstone budget rule for future content: ~150 damage-or-equivalent per 90s. Audit reference values at L10 baseline: Meteor ≈ 124 damage, Coup de Grâce ≈ 146.

---

## 10. Talent Trees

Class trees: 3 nodes, pick 2 (levels 3–4). Branch trees: 8 nodes / 9 point-slots (one node has 2 ranks), 6 points available. Tiers per §8.

### 10.1 Warrior

**Class tree:** Heavy Strike R2 (+25% damage) · Conditioning (+30 max HP) · Weapon Mastery (+8% auto-attack damage)

**Bulwark** (signature: Challenge)

| Tier | Node | Effect |
|---|---|---|
| 1 | Challenge R2 | Duration 4s→6s; DR bonus 15%→25% while active |
| 1 | Iron Thorns | Reflect 15% of melee damage taken back to attacker |
| 1 | Fortitude (2 ranks) | +5% / +10% max HP |
| 2 | Challenge R3 | Taunted enemies deal −10% damage to you |
| 2 | **Shield Bash** (ACTIVE) | Unlocks Shield Bash |
| 2 | Punishment | Heavy Strike +25% damage vs. taunted targets |
| 3 | Last Stand | First time below 20% HP each fight: heal 25% max HP (once per fight) |
| 3 | Shield Bash R2 | Stun 1s → 2s |

**Berserker** (signature: Frenzy)

| Tier | Node | Effect |
|---|---|---|
| 1 | Frenzy R2 | Max stacks 3 → 5 |
| 1 | Slaughter | Heavy Strike +30% damage vs. enemies below 30% HP |
| 1 | Relentless (2 ranks) | Cooldowns recover 10% / 20% faster |
| 2 | Frenzy R3 | +5% → +7% attack speed per stack |
| 2 | Bloodlust | +15% critical damage (CritMult +0.15) while Frenzy active |
| 2 | **Whirlwind** (ACTIVE) | Unlocks Whirlwind |
| 3 | Bloodthirst | While Frenzy active, attacks heal you for 4% of damage dealt |
| 3 | Reckless | +10% damage dealt, +5% damage taken |

### 10.2 Mage

**Class tree:** Arcane Bolt R2 (+25% damage) · Volatility (+10% spell critical damage, CritMult +0.10) · Ward (+5% damage reduction)

**Fire** (signature: Fireball)

| Tier | Node | Effect |
|---|---|---|
| 1 | Fireball R2 | +25% damage |
| 1 | Afterburn | Fireball crits burn for 25% of the hit over 4s (DoT, no crit) |
| 1 | Kindled Mind (2 ranks) | Spells cost −10% / −20% mana |
| 2 | Fireball R3 | Cast time −20% (2.5s → 2.0s) |
| 2 | **Flame Wave** (ACTIVE) | Unlocks Flame Wave |
| 2 | Detonation | +15% spell critical damage (CritMult +0.15) |
| 3 | Second Spark | Critical hits refund 8% max mana |
| 3 | Flame Wave R2 | Ground burns for 12 (INT-scaled) over 3s after the wave |

**Frost** (signature: Ice Bolt)

| Tier | Node | Effect |
|---|---|---|
| 1 | Ice Bolt R2 | +25% damage |
| 1 | Numbing Cold | Your slows also reduce enemy damage dealt by 10% |
| 1 | Deep Chill (2 ranks) | Slow duration +1s / +2s |
| 2 | Ice Bolt R3 | +20% damage to slowed targets |
| 2 | **Flash Freeze** (ACTIVE) | Unlocks Flash Freeze |
| 2 | Rimeguard | +8% damage reduction while at least one enemy is slowed/frozen by you |
| 3 | Winter Harvest | +0.5 mana regen/sec per enemy currently slowed or frozen by you |
| 3 | Flash Freeze R2 | Root 2s → 3s; radius +50% |

### 10.3 Marksman

**Class tree:** Aimed Shot R2 (+25% damage) · Deadly Aim (+10% critical damage, CritMult +0.10) · Light Step (+8% movement speed)

**Sniper** (signature: Snipe)

| Tier | Node | Effect |
|---|---|---|
| 1 | Snipe R2 | +25% damage |
| 1 | Weak Spot | +30% damage vs. enemies above 80% HP (opener, not execute) |
| 1 | Steady Hands (2 ranks) | Aim time −15% / −30% |
| 2 | Snipe R3 | +15% crit chance on Snipe |
| 2 | **Piercing Shot** (ACTIVE) | Unlocks Piercing Shot |
| 2 | Killer Instinct | +15% critical damage while no enemy is within melee range of you |
| 3 | Sniper's Nest | After standing still 2s: +10% damage and cooldowns recover 25% faster, until you move |
| 3 | Piercing Shot R2 | Also slows everything it passes through, 30% for 2s |

**Skirmisher** (signature: Barrage)

| Tier | Node | Effect |
|---|---|---|
| 1 | Barrage R2 | 3 arrows → 4 |
| 1 | Serrated Arrows | Barrage arrows bleed for 20% of their damage over 4s (DoT, no crit) |
| 1 | Nimble (2 ranks) | Cooldowns recover 10% / 20% faster |
| 2 | Barrage R3 | +20% damage per arrow |
| 2 | **Vault** (ACTIVE) | Unlocks Vault |
| 2 | Twist the Knife | +15% critical damage vs. bleeding targets |
| 3 | Runner's High | While moving, cooldowns recover 15% faster |
| 3 | Vault R2 | Caltrops at launch point: 30% slow for 3s |

### 10.4 Mystic

**Class tree:** Fateweave R2 (+25% to both polarities) · Compassion (mends leave a regen: +20% of the heal again over 4s) · Malice (harms leave an ache: +20% of the damage again over 4s, DoT, no crit)

**Charms** (signature: Protective Charm)

| Tier | Node | Effect |
|---|---|---|
| 1 | Protective Charm R2 | +30% absorb |
| 1 | Battle Blessing | After casting a mend, your next harm deals +25% |
| 1 | Devotion (2 ranks) | Healing done +8% / +16% |
| 2 | Protective Charm R3 | On break or expiry, heals target for 15% of the shield's absorb value |
| 2 | **Blessing** (ACTIVE) | Unlocks Blessing |
| 2 | Mending Ward | Your shields also regenerate 2% of target's max HP per second while active |
| 3 | Overflow | 20% of healing dealt to others also heals you |
| 3 | Blessing R2 | Blessing also grants +8% damage reduction |

**Curses** (signature: Wither)

| Tier | Node | Effect |
|---|---|---|
| 1 | Wither R2 | +25% damage |
| 1 | Siphon | Fateweave (harm) heals you for 15% of its damage |
| 1 | Dark Bargain (2 ranks) | Curses cost −10% / −20% mana |
| 2 | Wither R3 | Withered enemies deal −10% damage |
| 2 | **Evil Eye** (ACTIVE) | Unlocks Evil Eye |
| 2 | Festering | Your DoTs tick 20% faster |
| 3 | Vampiric Curse | 10% of all your DoT damage returns to you as healing |
| 3 | Contagion | When an enemy dies with Wither on it, Wither leaps to a nearby enemy at full duration |

---

## 11. The 16 Reference Builds (free-point priorities)

Free points (27 total by L10) follow these priorities on top of automatic growth. These are design targets, not enforced — but tooltips/auto-assign may reference them.

| Branch | Build | Priority | Identity |
|---|---|---|---|
| Bulwark | Fortress | VIT → END | Unkillable wall |
| Bulwark | Warlord | VIT → STR | Off-tank that still hurts |
| Berserker | Executioner | STR → PRE | Few, huge crits (pairs: Slaughter, Bloodlust) |
| Berserker | Hurricane | STR → HST → VIT | Whirlwind machine (pairs: Relentless) |
| Fire | Meteor | INT → PRE | Crit-fishing burst (pairs: Detonation, Second Spark) |
| Fire | Flamethrower | INT → HST → SPI | Sustained spray (pairs: Kindled Mind) |
| Frost | Glacier | INT → END | Attrition kiter (pairs: Numbing Cold, Rimeguard) |
| Frost | Permafrost | INT → HST | Max control uptime (pairs: Deep Chill) |
| Sniper | Deadeye | AGI → PRE | One-shot fantasy (pairs: Weak Spot, Killer Instinct) |
| Sniper | Quickdraw | AGI → HST | Shorter wind-ups (pairs: Steady Hands) |
| Skirmisher | Windrunner | AGI → HST (VIT splash) | Endless skirmish (pairs: Runner's High, Serrated) |
| Skirmisher | Duelist | AGI → PRE | Mobile crit-fisher (pairs: Twist the Knife) |
| Charms | Battle Medic | SPI → VIT | Frontline healer (pairs: Devotion, Mending Ward) |
| Charms | War Witch | SPI → INT | Off-heals, real solo damage (pairs: Battle Blessing) |
| Curses | Plaguebringer | INT → HST | Faster DoT ticks (pairs: Festering, Contagion) |
| Curses | Leech | INT → SPI | Drain-sustain attrition (pairs: Siphon, Vampiric Curse) |

---

## 12. Balance Audit Summary (regression targets)

Simulated at level 10, auto-growth only, signature included, no tree nodes, 60s fight. **Any implementation should reproduce these within ±5%** (they validate the formulas in §4 and numbers in §9).

| Branch | Sustained DPS | Detail |
|---|---|---|
| Sniper | 19.0 | Autos pause 1.34s per Snipe (aim/haste) |
| Skirmisher | 18.9 | |
| Fire | 18.8 avg | Fireball phase: 20.7 DPS for 31.8s until OOM, then Arcane Bolt 16.2 (AB drain −0.07/s) |
| Frost | 17.6 avg | Ice Bolt phase: 18.3 DPS for 35.7s, then 16.2 |
| Curses | 17.3 | Wither upkeep + 3.74 Fateweave fillers per 8s cycle; drain +1.17/s → OOM at 99s |
| Berserker | 16.1 | Bruiser: −15% DPS vs. Marksman for +70% EHP; trees widen lead over Bulwark to ~25–30% |
| Bulwark | 14.8 | |
| Charms | 14.3 solo | Party: **22.2 HPS** (15.9 mend stream + 6.3 charm amortized) |

Cross-checks that must continue to hold:
- **Tank margin:** Warrior EHP 308.5 = 1.69–1.79× everyone else (172.6–182.7).
- **Healer pressure:** 1 Charms healer vs. 1 top DPS on the tank = net +4.3 HP/s (holds). Vs. 2 DPS = net −13.6 HP/s, tank falls in ~23s (focus fire wins — intended).
- **TTK vs. standard 120 HP mob:** 6.3–8.1s across all branches.
- **Greed check (27-point single-stat dumps):** Berserker — STR +20.5%, HST +15.8%, PRE +11.3%, VIT +0% dmg/+270 HP. Fire — INT +29.9%, HST +19.5%, SPI +11.3%, PRE +7.0%. Primary leads but buys zero survivability; no degenerate dump.

**Watchlist (known, accepted at 10-cap; revisit if cap rises):**
1. INT double-dips (damage + mana pool extends burst phase) → dial: INT mana bonus 4 → 3 per point.
2. Capstones vs. players: Coup de Grâce ≈ 146 ≈ 86% of a caster's HP → if PvP is ever added, capstones deal ~65% vs. players.
3. Fight snappiness → dial: standard mob HP.

---

## 13. Enemy Baselines (first-pass, tuned to audit invariants)

```
Mob_HP(level)     = 40 + 8 * level          # L1: 48, L10: 120  (~x2.5 scaling, matches TTK targets)
Mob_Damage(level) = 2 + 0.5 * level         # per hit, 2.0s swing -> L10 DPS 3.5
Elite             = 3x HP, 2x damage, 3x KillXP
```

A solo same-level fight should cost roughly 10–25% of the player's HP. These are the primary pacing dials (§7).

---

## 14. Compile-Time Additions

Everything above is conversation-canon and audit-verified EXCEPT the following, which were assigned during compilation to make the spec implementable. Treat as first-pass values; safe to tune:

- Whirlwind base 24; Shield Bash base 10; Piercing Shot base 30; Flame Wave base 22 (+R2 burn 12/3s); Flash Freeze deals 0 damage (pure control).
- Cooldowns/costs for caster tree actives: Flame Wave 10s/25 mana; Flash Freeze 15s/20 mana; Blessing 20s/25 mana; Evil Eye 12s/15 mana.
- Frenzy R3 set to +7%/stack (base was rebalanced 4%→5% in audit; R3 keeps its +2% delta).
- Capstones cost 0 mana; Benediction shield = 10% max HP for 4s; Malediction = full-rank Wither AoE.
- Challenge "bonus armor" formalized as +15% DR (R2: +25%) while active; Frenzy stacks drop after 5s without hitting; Vault distance ~5m.
- Respec cost 50 × level; auto-assign templates (§6.2); enemy formulas (§13).

## 15. Implementation Notes (Godot)

1. **Calculation order:** roll crit → `Hit = Base * PowerMult * (crit ? CritMult : 1) * Π(1 + outgoingMods)` → on target: `* (1 − DR) * Π(1 + takenMods)`.
2. **DoTs:** store as (total_damage_remaining, tick_interval, ticks_left); tick_interval divided by the caster's HasteMult *at application time*; Festering/Arrowstorm multiply tick rate further. DoTs snapshot INT at application. No crits.
3. **Barrage:** N independent hit events, each with its own crit roll.
4. **Channels (Snipe aim):** block auto-attacks and other casts; duration = 1.5 / HasteMult; interruptible by stuns.
5. **Mana:** float accumulator, `mana = min(mana_max, mana + regen * delta)` every frame; skill cast validates cost at cast *start*.
6. **Buff/debuff stacking:** same-name effects refresh duration, never stack; different sources multiply per §4.
7. **Cooldown-recovery nodes** (Relentless, Nimble, Sniper's Nest, Runner's High): implement as cooldown timers advancing at `1 + bonus` rate while the condition holds — never as a reduction of the stored CD value.
8. **Once-per-fight (Last Stand):** reset on leaving combat.
9. **Suggested data layout:** stats and skills as Resources (`.tres`) mirroring the tables in §6/§9/§10, so tuning never touches code. Persist: level, xp, branch id, free-point allocations, purchased node ids, auto-assign flag.
10. **Validation tests to port from the audit:** the §6.3 reference sheet, the §12 DPS table (±5%), the Metronome Law inequality (§5), and Tier-3 lockout before level 9.

*End of document — v1.0, 2026-08-21.*
