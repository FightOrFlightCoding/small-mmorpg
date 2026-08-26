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

### PROG-03

Project defaults required to persist the canonical progression record. These numbers are **not** canonical design data.

| Stable ID | Value | Purpose | Reason it was required | Affects balance | Tests using it | Canonical design data |
| --- | --- | --- | --- | --- | --- | --- |
| `project.progression.schema_version` | `2` (`progressionSchemaVersion`; `SAVE_SCHEMA_VERSION` stays `1`) | Distinguish canonical progression fields from Foundation v1 blobs | Design field `schema_version` without a numeric value | no | `server/tests/canonical_progression.test.ts` | no |
| `project.progression.auto_assign_default` | `false` (`CANONICAL_AUTO_ASSIGN_DEFAULT`) | New and migrated characters start with auto-assign off | Design does not specify the create-time default | no | same | no |

### PROG-04

Documents the already accepted health-recalculation policy. Not a new combat number.

| Stable ID | Value | Purpose | Reason it was required | Affects balance | Tests using it | Canonical design data |
| --- | --- | --- | --- | --- | --- | --- |
| `project.health.max_change_policy` | add positive max delta, then clamp to new max; no refill on equip | Keep current health when maxima change | Design allows either percent or existing policy | no | `server/tests/progression.test.ts` | no |
| `project.quest.slime_problem.xp` | `20` | Prompt 18 slime-problem quest XP | Design KillXP is `8 + 2 * enemy_level`; this quest reward is not specified as KillXP | no | `server/tests/quest.test.ts` | no |

### PROG-05

Capped-XP policy when a character is already at level 10. Design forbids level 11 and extra points; it does not say whether overflow XP is discarded or counted.

| Stable ID | Value | Purpose | Reason it was required | Affects balance | Tests using it | Canonical design data |
| --- | --- | --- | --- | --- | --- | --- |
| `project.xp.cap_overflow_policy` | `lifetime_only` | Extra XP after level 10 increases `lifetimeXp` only; `currentXp` / `xpIntoLevel` stay 0 | Design omits overflow handling | no | `server/tests/progression_timeline.test.ts` | no |

### PROG-06

Trainer NPC ids and the runtime `respec` overlay. Gold `50 × level` is canonical compile-time (`compile.respec_cost`); it is not invented here. Overlaying `respec` on existing generic NPCs avoids a content rebuild and keeps the generated hash unchanged.

| Stable ID | Value | Purpose | Reason it was required | Affects balance | Tests using it | Canonical design data |
| --- | --- | --- | --- | --- | --- | --- |
| `project.npc.respec_trainers` | `npc.test_innkeeper`, `npc.lab_trainer` | Runtime overlay of generic NPC service `respec` | Design requires a trainer NPC; authored NPC documents have no `respec` row and must not be rebuilt this phase | no (who may offer the service) | `server/tests/progression_respec.test.ts` | no |
| `project.allocate.batch_max_entries` | `16` | Max rows in `ALLOCATE_ATTRIBUTES_BATCH` | Design does not specify a batch size; protocol needs a finite cap | no | `server/tests/protocol.test.ts` | no |

