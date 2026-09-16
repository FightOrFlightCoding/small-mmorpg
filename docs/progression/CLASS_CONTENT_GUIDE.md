# Class content guide

Author production classes as ID-addressed JSON under `content/source/`. Do not put class rules in generic combat code. Do not add a fifth production class unless a later named phase says so.

Canonical roster: [rpg-progression-design-v1.0.md](../design/rpg-progression-design-v1.0.md) §2 and §6.

## Required fields for `class.*`

| Field | Rule |
| --- | --- |
| `id` | `class.warrior`, `class.mage`, `class.marksman`, or `class.mystic` |
| `rosterSelectable` | `true` for production |
| `canonicalLevelCurveId` | `curve.vibecode.l10` |
| `baseStats` | Eight `stat.*` keys totaling **34** |
| `automaticGrowth` | Eight keys totaling **6** per level |
| `resourceType` | `resource.none` for Warrior/Marksman; mana resource for Mage/Mystic |
| `basicAbilityId` | Granted at level 2 |
| `classTreeId` | Two spendable class nodes |
| `branchIds` | Exactly two branches |
| `autoAttackId` | Class-owned auto-attack, not a hotbar slot |
| `autoAssignTemplate` | Optional §14 order; never spends more than the newly earned 3 points |

Keep Foundation `startingAttributes` / `test.curve.standard` on the document so the generated hash stays stable. Production runtime overlays the canonical curve and eight-stat arrays.

## Branches

Each branch document (`branch.<class>.<name>`) must set:

- `classId`
- `signatureAbilityId` (level 5 after selection)
- `capstoneAbilityId` (level 10 after selection)
- `branchTreeId` (eight nodes, nine point-slots, at most one buyable active)

Do not default a branch on create. Level 5+ without a branch stays pending.

## What not to do

- Do not encode class names in `combat_pipeline.ts`, `canonical_combat.ts`, or `effects.ts`.
- Do not let the client write class, level, or stats.
- Do not add `test.class.*` to the production `class.*` roster.
- Do not retune base arrays to make a DPS test pass.
