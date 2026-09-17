# Talent content guide

Talent nodes and trees are content. The match applies identified modifiers through `talent_modifiers.ts`. Generic combat must not branch on class id to special-case a node.

Canonical trees: design §10. Spend rules: PROG-07.

## Trees

| Tree kind | Points | Nodes |
| --- | --- | --- |
| Class (`tree.<class>.class`) | 2 (levels 3 and 4) | Three authored nodes; at most two purchased |
| Branch (`tree.<class>.<branch>`) | 6 (levels 5–10) | Eight nodes, nine rank slots |

Branch trees set `maxActiveGrants: 1`. A second buyable active is `active_ceiling`.

## Tier gates

| Tier | Gate |
| --- | --- |
| 1 | Level 5+, 0 points spent |
| 2 | 2 points spent in that tree |
| 3 | Level 9+ and 4 points spent |

Do not implement a hidden GCD or extra point pool.

## Node documents

Each `talent.*` JSON needs:

- `treeId`, `tier`, `maxRank`, `pointCostPerRank`
- Optional `grantsActiveAbilityId` (at most one per branch tree)
- `passiveModifiers` and/or `conditionalModifiers`
- Optional `prerequisites`

Ranks replace. Distinct `sourceId` percentage modifiers multiply. Same-node higher rank replaces the lower rank.

## Ownership

`syncDerivedAbilityOwnership` rebuilds `unlockedAbilityIds` and the four-slot `hotbarAssignments` from class, branch, level, and purchases. Production cannot `UNLOCK_ABILITY` an arbitrary id. Trainer respec clears purchases and branch, then rebuilds ownership. Level-2 basics remain.

## Reference builds

Sixteen `build.*.json` documents are optional §11 priorities. They are never auto-spent and never enforced on players. Tooltips and auto-assign copy may mention them.
