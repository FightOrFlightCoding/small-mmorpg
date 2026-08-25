# Progression implementation addendum

Ledger for values that implementation needs but the canonical design does not specify. PROG-01 adds **no new gameplay values**. Later phases must fill a row here before putting an undocumented number into source.

Do not change §14 compile-time additions merely because they are labeled tunable. Implement those first as written.

For every later addition record:

| Field | Required |
| --- | --- |
| Stable ID | yes |
| Value | yes |
| Purpose | yes |
| Reason it was required | yes |
| Affects balance | yes / no |
| Tests using it | yes |
| Canonical design data | **no** — confirmation that it is not canonical design data |

## PROG-01

No implementation-added combat, range, radius, threat, projectile, visual, collision, or tie-breaker numbers were introduced. This file exists so later phases have a single ledger.

## Existing project values to preserve first

When a later phase needs a value absent from the design, reuse an already accepted project value before inventing a new one. Those project values are **not** canonical design data.

| Stable ID | Current project value | Purpose | Canonical design data |
| --- | --- | --- | --- |
| `project.ability.range.melee` | `40` (`test.ability.basic_melee`) | Melee ability range units | no |
| `project.threat.switch_ratio` | `1.1` (`DEFAULT_AI_PROFILE`) | Threat target switch hysteresis | no |
| `project.tick.snapshot_hz` | `10` | Authoritative match tick rate | no |
| `project.save.schema_version` | `1` | Player-save envelope | no |
| `project.hotbar.size` | `8` | Current hotbar length (conflicts with design max 4; see CURRENT_CONFLICTS.md) | no |
| `project.gcd.ability` | `0.7s` on current test abilities | Existing GCD field (design has no global cooldown) | no |

None of the rows above are license to retune §9 / §14.

## Additions

_None in PROG-01._
