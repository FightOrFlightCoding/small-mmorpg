# Progression interpretations

Binding readings of [rpg-progression-design-v1.0.md](rpg-progression-design-v1.0.md) when a general sentence and an exact table disagree. Precedence: exact formulas and numerical tables, then exact skill and talent descriptions, then implementation notes, then design pillars and summaries, then the implementation addendum.

These interpretations do not change player-visible behavior in PROG-01.

## Frenzy is passive

The §9.2 skill table defines Frenzy as a **Passive stacker**. That exact row wins over the general “actives ceiling” wording that lists signature skills among the guaranteed active skills.

Consequences:

- Frenzy does **not** occupy an active hotbar slot.
- Berserker’s guaranteed clickable actives at level 10 are Heavy Strike (basic), Whirlwind if purchased (tree active), and Berserk (capstone). Challenge is Bulwark-only.
- Berserker’s signature is a passive. It is not a fourth clickable button.

Stable IDs: `ability.warrior.frenzy`, `branch.warrior.berserker`.

## Four-active rule is a hard maximum

Pillar 6 and the actives-ceiling sentence describe a **maximum** of four active (hotbar) abilities: basic + signature + capstone + at most one buyable tree active.

They do **not** claim that every branch exposes four clickable buttons. A branch whose signature is passive (Berserker / Frenzy) has fewer clickable actives. Auto-attack remains separate from the active hotbar.

## Other locked readings used by later phases

- Class IDs after create are immutable: `class.warrior`, `class.mage`, `class.marksman`, `class.mystic`.
- Branch is selected at level 5 and changes only through a full trainer respec.
- Haste never modifies stored cooldown duration or cooldown-recovery rate.
- DoTs never crit. Haste and DoT tick-rate effects preserve total damage.
- Warrior and Marksman have no mana. Mage and Mystic do. Capstones cost 0 mana.
- PvP stays disabled. Hostile player targeting and damaging player abilities are rejected.
