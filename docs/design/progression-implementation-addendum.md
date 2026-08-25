# Progression implementation addendum

Ledger for values that implementation needs but the canonical design does not specify. PROG-01 added **no new gameplay values**. PROG-02 recorded schema-required geometry below. Later phases must fill a row here before putting an undocumented number into source.

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

### PROG-02

Geometry the schemas require but the design omits. These numbers are **not** canonical design data. They are unused at runtime until a later phase enables the abilities. Reuse existing project values where possible (`project.ability.range.melee` = 40, `test.ability.ranged_bolt` range = 180, `zone.starter` tileSize = 16).

| Stable ID | Value | Purpose | Reason it was required | Affects balance | Tests using it | Canonical design data |
| --- | --- | --- | --- | --- | --- | --- |
| `project.ability.range.ranged` | `180` (`test.ability.ranged_bolt`) | Canonical ranged/spell range when design omits units | Schema requires range | yes, if later enabled | `tools/content-build/tests/content-build.test.ts` | no |
| `project.ability.range.snipe` | `234` (`180 * 1.3`) | Snipe +30% range from §9.2 | Design gives percent, not absolute range | yes, if later enabled | same | no |
| `project.ability.aoe.radius` | `40` (project melee range) | Whirlwind, Challenge, Flash Freeze, Meteor, party auras fallback radius | Design says melee/nearby without px | yes, if later enabled | same | no |
| `project.ability.cone.angle_deg` | `60` | Flame Wave cone width | Schema requires cone angle; design omits it | yes, if later enabled | same | no |
| `project.ability.line.length` | `180` | Piercing Shot line length | Design omits line length; match ranged range | yes, if later enabled | same | no |
| `project.ability.line.width` | `16` (`zone.starter` tileSize) | Piercing Shot line width | Schema completeness | no until enabled | same | no |
| `project.ability.vault.distance_px` | `80` (`5 * tileSize 16`) | Vault ~5m mapped onto 16px tiles | Design meters; world is tiled pixels | yes, if later enabled | same | no |
| `project.ability.party.radius` | `80` (`5 * tileSize 16`) | Blessing/Benediction/Malediction nearby allies/enemies | Design omits party radius | yes, if later enabled | same | no |
