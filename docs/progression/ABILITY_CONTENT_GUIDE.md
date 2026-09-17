# Ability content guide

Production abilities live in `content/source/ability.<class>.*.json` and `content/source/ability.<class>.auto_attack.json`. Runtime ownership comes from class, branch, level, and purchased talent nodes. The client never grants an ability.

Canonical numbers: design §§9–10. Geometry that the design omits is recorded in [progression-implementation-addendum.md](../design/progression-implementation-addendum.md).

## Shared rules

| Rule | Implementation |
| --- | --- |
| No production GCD | `globalCooldown` must be `0` on production `ability.*` |
| Haste ≠ cooldown | Haste scales auto-attack interval, cast, channel, and DoT tick interval. Stored cooldown ticks are not divided by haste |
| DoTs never crit | Periodic damage uses `isDot`; `evaluateCanonicalHit` refuses crit |
| Mana spend | Deduct at cast start; interrupted casts do not refund unless content says so |
| Capstones | Level 10, 0 mana, long cooldown |
| Auto-attack | ATTACK opcode, not a hotbar id |
| PvP | Living players are friendly; hostile abilities return `pvp_disabled` |
| `runtimeEnabled` | Only `ability.warrior.*`, `ability.marksman.*`, `ability.mage.*`, `ability.mystic.*` |

## Targeting and shapes

Reuse existing project geometry before inventing a number:

- Melee range / AoE radius: 40
- Ranged / spell range: 180
- Snipe: 234 (180 × 1.3)
- Party aura / contagion: 80
- Flame Wave cone: 60°
- Piercing Shot line: length 180, width 16
- Vault: 80 px

Record any new omitted unit in the implementation addendum **before** putting it in source.

## Categories

| Kind | Examples | Notes |
| --- | --- | --- |
| Auto-attack | class auto-attack | Class-owned interval and power category |
| Basic | Heavy Strike, Arcane Bolt, Aimed Shot, Fateweave | Level 2 |
| Signature | Frenzy (passive), Fireball, Snipe, Protective Charm / Wither | Level 5 + branch |
| Buyable active | one per branch tree | Counts toward the four-active ceiling |
| Capstone | Berserk, Meteor, Coup de Grâce, Benediction | Level 10 + branch |

Frenzy is a passive stacker and must not occupy a hotbar slot.

## Validation

`server/tests/progression_gcd_audit.test.ts` fails if production abilities or combat modules depend on `globalCooldown` / `gcd`. Class combat tests cover each production ability. Do not add a combat plugin.
