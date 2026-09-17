# Pre-PROG-09 project handover (repository-grounded)

**Superseded.** Canonical git line is **`origin/main`** with last accepted **PROG-15**. Follow [AGENTS.md](../../AGENTS.md) current baseline. Do not use this document's instruction to avoid `origin/main`.

**Purpose:** Verified state before **PROG-09 — Complete Warrior, Bulwark, and Berserker Implementation**.  
**Rule:** Repository evidence overrides chat narratives. *Intended* design is not *implemented* until `docs/PROGRESS.md` and tests say so.  
**Re-verification run:** 2026-09-16 (cloud agent), branch `cursor/pre-prog09-handover-3970` rebased onto `origin/cursor/npc-quest-acceptance`.

---

## 1. Repository branch and HEAD commit

| Item | Value | Evidence |
| --- | --- | --- |
| Branch inspected for PROG-08 code + tests | `origin/cursor/npc-quest-acceptance` | `git branch -r --contains 8f0b949` |
| HEAD (PROG line) | `3cb1e35a52a3a0ce3ef868114c30ed16cdaaaa02` | `git rev-parse origin/cursor/npc-quest-acceptance` |
| PROG-08 commit | `8f0b949` — Add PROG-08 generic combat mechanics… | `git log --grep=PROG-08` |
| Handover docs branch | `cursor/pre-prog09-handover-3970` (tracks PROG line above) | This PR |
| **`origin/main` HEAD** | `dccb539c0a7b29e7a2881844a13c827dede892a0` | `git rev-parse origin/main` |
| **`origin/main` last accepted (docs)** | Starter-zone room chat only | `docs/PROGRESS.md` on `main` |

**Recent `origin/main` (20 commits):** `dccb539` room chat → `67c742b` remote interpolation → … → `1c48ff3` Phase 0 contract.

**Recent PROG line (includes PROG-08):** `3cb1e35` art assets → `8f0b949` PROG-08 → `8dfcbb8` PROG-07 → … → `84f1884` PROG-01 → Foundation/ACCT history.

**Critical discrepancy:** PROG-08 is **not** on `origin/main`. It exists only on `origin/cursor/npc-quest-acceptance` (and descendants). A commit message or local narrative is insufficient; merge to `main` is still outstanding.

---

## 2. Working-tree state

| Check | Result | Evidence |
| --- | --- | --- |
| Tree for verification | Clean before doc edits | `git status --short` |
| Handover commit scope | Docs only (`docs/handover/`, `docs/progression/CURRENT_CONFLICTS.md`, `AGENTS.md` marker) | This PR diff |

---

## 3. Exact dependency versions

Sources: `docs/DEPENDENCIES.md`, lockfiles, `client/project.godot`.

| Component | Version | Evidence |
| --- | --- | --- |
| Godot | 4.7.1 stable | `client/project.godot`; DEPENDENCIES |
| Nakama | 3.40.0 | DEPENDENCIES; `infra/docker-compose.yml` |
| nakama-runtime | 1.47.0 | `server/package.json` |
| Nakama Godot SDK | 3.4.0 | `client/addons/com.heroiclabs.nakama/` |
| GLoot | 3.0.2 | DEPENDENCIES |
| Dialogue Manager | 3.10.5 | DEPENDENCIES |
| GdUnit4 | 6.2.0 | DEPENDENCIES |
| PostgreSQL | 16.15-alpine | DEPENDENCIES |
| TypeScript | 5.8.3 | `server/package.json` |
| Node (verify VM) | v22.14.0 | `node -v` |
| Generated content hash | `3b57502b4a197972c970420cd7b2a5a74955311b5840be0b4d184843c24e3320` | `server/src/generated/content.ts` |

---

## 4. Exact build, startup, and test commands

| Action | Command | Re-verify 2026-09-16 |
| --- | --- | --- |
| Content-build | `cd tools/content-build && npm ci && npm run typecheck` then `node --test dist/tests/*.test.js` | **25/25 pass** (Node 22 glob; `npm test` dir fails) |
| Server typecheck | `cd server && npm ci && npm run typecheck` | **OK** |
| Server tests | `npx tsc -p tsconfig.test.json && node --test dist-test/tests/*.test.js` | **669 pass, 13 skipped** (live suites off) |
| Server bundle | `npm run build` | **OK** |
| PROG design audit | `node --test dist-test/tests/progression_design_audit.test.js` | **10/10 pass** |
| Prompt 18 foundation audit | `bash scripts/test-audit.sh` | **FOUNDATION_AUDIT_OK** |
| Auth-gateway | `cd auth-gateway && npm ci && npx tsc -p tsconfig.test.json && node --test dist-test/tests/*.test.js` | **52/52 pass** (glob) |
| Migrations | Included in server suite | `server/tests/migration.test.ts` (pass in 669) |
| Protocol / vendor / Prompt 18 | `tools/foundation-audit/audit.cjs` + server tests | Audit OK; protocol tests in server suite |
| Client GdUnit | `scripts/test-client.ps1` / `run-client-shell.ps1` | **Not run** (no Godot 4.7.1 on verify VM) |
| Docker backend / e2e / cert journey | `scripts/backend-up.ps1`, `test-e2e.ps1`, etc. | **Not run** on verify VM |

**Node 22 note:** `npm test` in `server/`, `tools/content-build/`, and `auth-gateway/` invokes `node --test dist-test/tests` (directory path). On Node 22.14 this fails; **glob `dist-test/tests/*.test.js` (or `dist/tests/*.test.js`) is the documented workaround** for this environment.

---

## 5. Exact currently accepted phases

**Authoritative on PROG line (`origin/cursor/npc-quest-acceptance`):** `docs/PROGRESS.md` → **Last accepted phase: PROG-08 — Generic Combat Mechanics Required by All Four Classes.**

Also accepted on that line (same file): Prompt 18 freeze, Foundation v1 (Prompt 35), ACCT-09, PROG-01 through PROG-07.

**On `origin/main` only:** last accepted phase remains **Starter-zone room chat**; no PROG/ACCT/Foundation acceptance entries.

---

## 6. Phase-by-phase summary — Prompt 0–18

Accepted per `docs/PROGRESS.md` on the PROG line: full Foundation vertical slice through Prompt 18 (village/slime combat **frozen**), plus Prompts 19–35 certification phases as recorded in PROGRESS.

Evidence: `docs/FOUNDATION_BASELINE.md`, `docs/VERTICAL_SLICE.md`, `tools/foundation-audit/audit.cjs`, server match modules beyond starter-only skeleton.

---

## 7. Phase-by-phase summary — ACCT-01 through ACCT-09

Accepted on PROG line: **ACCT-09** (see PROGRESS account lifecycle section).  
Evidence: `auth-gateway/`, `docs/account/*`, RPCs `auth_gateway`, character lifecycle RPCs in `server/src/main.ts`, `scripts/test-account-lifecycle.ps1`.

Not present on `origin/main`.

---

## 8. Phase-by-phase summary — PROG-01 through PROG-08

| Phase | Accepted on PROG line? | Key evidence |
| --- | --- | --- |
| PROG-01 | Yes | `docs/progression/*`, `progression_design_audit.test.ts` |
| PROG-02 | Yes | Content schemas + generated bundles |
| PROG-03 | Yes | Four classes + migration v2 |
| PROG-04 | Yes | `canonical_stats.ts`, formulas tests |
| PROG-05 | Yes | L10 curve overlay, KillXP |
| PROG-06 | Yes | Trainer respec |
| PROG-07 | Yes | Talent trees, 4-slot hotbar authority |
| PROG-08 | Yes | `canonical_combat.ts`, combat event bus, tests listed §32 |

PROG-08 acceptance block: `docs/PROGRESS.md` § "PROG-08 generic combat mechanics…" (2026-08-26).

---

## 9. Actual client module ownership

| Area | Path | Role |
| --- | --- | --- |
| Account UX | `client/scripts/account/*`, `AccountService` | Email auth via gateway |
| Progression mirror | `client/scripts/app/progression_service.gd` | Server intentions only |
| Abilities / hotbar | `client/scripts/app/ability_service.gd` | 4-slot production; GCD ignored for `class.*` |
| World HUD | `client/scripts/world/world_hud.gd` | Progression panel + hotbar bind |
| Network / protocol | `client/scripts/network/*` | Match, opcodes, handshake |
| Content | `client/scripts/content/*` | Registry + bundle |
| Tests | `client/tests/**` | GdUnit (283 documented in PROGRESS PROG-08 gate) |

Third-party: `client/addons/**` — do not edit (`AGENTS.md`).

---

## 10. Actual server module ownership

| Area | Path |
| --- | --- |
| Entry | `server/src/main.ts` (29 RPCs per foundation audit) |
| Match / combat loop | `server/src/domain/match_loop.ts`, `combat_pipeline.ts`, `combat.ts` |
| Generic combat (PROG-08) | `canonical_combat.ts`, `combat_events.ts`, `combat_rng.ts` |
| Effects / abilities | `effects.ts`, `ability.ts`, `canonical_talents.ts` |
| Progression | `canonical_progression.ts`, `canonical_leveling.ts`, `canonical_stats.ts`, `canonical_respec.ts` |
| Migration | `server/src/domain/migration.ts` |
| Nakama adapters | `server/src/nakama/*` |
| Tests | `server/tests/*.test.ts` (682 files compiled; 669 run + 13 skipped) |

---

## 11. Actual auth-gateway ownership

| Item | Path |
| --- | --- |
| HTTP service | `auth-gateway/` (Fastify) |
| Hermetic tests | `auth-gateway/dist-test/tests/*.test.js` (52 tests) |
| Docs | `docs/account/AUTH_API_CATALOG.md`, threat model |

---

## 12. Actual content-pipeline ownership

| Stage | Owner |
| --- | --- |
| Schemas + source | `content/schemas/`, `content/source/` |
| CLI | `tools/content-build` |
| Generated | `server/src/generated/content.ts`, `client/content/bundle.json` |
| Audit hash | Must match `3b57502b…` across client/server |

---

## 13. Every canonical storage collection and key pattern

**Authoritative catalog:** `docs/STORAGE_CATALOG.md` and `docs/account/ACCOUNT_STORAGE_CATALOG.md` (PROG line). Foundation audit counts **34** storage record definitions.

Do not duplicate the full table here; agents must read those catalogs before storage edits.

---

## 14. Every progression schema and current version

**Authoritative:** `docs/progression/PROGRESSION_STORAGE_CATALOG.md`, `docs/progression/PROGRESSION_MIGRATION_PLAN.md`.

Production characters use **`progressionSchemaVersion` 2** with canonical fields; legacy Foundation fields may remain until PROG-14 (`C-legacy-migration`).

---

## 15. Every account and character state

See `docs/account/CHARACTER_STATE_MACHINE.md`, `docs/account/ACCOUNT_STATE_MACHINE.md`, and PROGRESS ACCT sections.

---

## 16. Every active-character lease state

See `docs/account/SESSION_AND_LEASE_RUNBOOK.md` and server lease modules (ACCT-07+).

---

## 17. Every progression protocol action, RPC, opcode, and hook

**Catalogs:** `docs/progression/PROGRESSION_PROTOCOL_CATALOG.md`, `docs/PROTOCOL_CATALOG.md`.

**RPC sample (main.ts):** `character_*`, `find_or_create_starter_zone`, cave/party/trade RPCs, `auth_gateway`, `session_handshake`, `gm_command`, ops RPCs.

**Foundation audit:** 38 client opcodes, 15 server opcodes.

---

## 18. Every generic combat event and handler accepted in PROG-08

**Event types (`server/src/domain/combat_events.ts`):**  
`before_ability`, `cast_started`, `cast_interrupted`, `ability_resolved`, `hit_rolled`, `damage_dealt`, `damage_taken`, `healing_dealt`, `shield_applied`, `shield_broken`, `shield_expired`, `effect_applied`, `effect_ticked`, `effect_removed`, `auto_attack_landed`, `enemy_taunted`, `entity_killed`, `combat_started`, `combat_ended`, `movement_started`, `movement_stopped`.

**Bus:** `createCombatEventBus` / `createGenericCombatBus` in `canonical_combat.ts` with pluggable handlers (reflect, lifesteal, overflow heal, etc.).

**Mechanic kinds:** enumerated in `canonical_combat.ts` (includes `once_per_combat`, cooldown recovery, multi-hit, targeting shapes).

---

## 19. Exact production hotbar implementation

**Server authority:** `CANONICAL_HOTBAR_SIZE` = 4; assignments in progression state; ownership from level/branch/talent grants (`progression_hotbar_ceiling.test.ts`).

**Client:** `ability_service.gd` mirrors four production slots; auto-attack separate from hotbar ids.

**Test-only:** Foundation `HOTBAR_SIZE` 8 for `test.class.*` (`TEST_ONLY_PERMANENT`).

---

## 20. Evidence old eight-slot hotbar is removed or test-only

| Evidence | Location |
| --- | --- |
| Production ceiling 4 | `server/tests/progression_hotbar_ceiling.test.ts` |
| Eight-slot path scoped to test classes | `C-hotbar-dual` RESOLVED in CURRENT_CONFLICTS |
| Frenzy excluded | `progression_frenzy_passive.test.ts` |

---

## 21. Evidence no production global cooldown remains

| Evidence | Location |
| --- | --- |
| Server production classes/abilities | `server/tests/progression_gcd_absent.test.ts` |
| Client production UI | `client/tests/app/ability_service_test.gd` (documented in PROGRESS; **not re-run on verify VM**) |
| Conflict register | `C-gcd` RESOLVED |

---

## 22. Evidence Haste does not affect cooldowns

| Evidence | Location |
| --- | --- |
| Haste on cast/attack/DoT timing only | `canonical_combat.test.ts`, `progression_dot_haste.test.ts` |
| Stored cooldown duration invariant | `C-haste-cooldowns` RESOLVED; PROG-09 go/no-go row |

---

## 23. Evidence DoTs never crit

| Evidence | Location |
| --- | --- |
| `evaluateCanonicalHit` with `isDot` | `progression_formulas.test.ts`, `progression_dot_haste.test.ts` |
| Register | `C-dot-crit-engine` RESOLVED |

---

## 24. Evidence DoT tick acceleration preserves total damage

| Evidence | Location |
| --- | --- |
| Haste / festering retune tests | `progression_dot_haste.test.ts` |
| PROG-08 acceptance text | `docs/PROGRESS.md` PROG-08 section |

---

## 25. Evidence reflection and secondary healing cannot recurse

| Evidence | Location |
| --- | --- |
| Handler guards + tests | `canonical_combat.test.ts` (reflect, overflow, lifesteal cases) |
| Origin tags | `combat_events.ts` (`reflect`, `overflow`, …) |

---

## 26. Evidence shields produce one terminal event

| Evidence | Location |
| --- | --- |
| Break/expiry singularity | `progression_combat_mechanics.test.ts` |
| PROG-08 PROGRESS narrative | shield break/expiry |

---

## 27. Evidence once-per-combat state resets on combat exit

| Evidence | Location |
| --- | --- |
| Test | `canonical_combat.test.ts` — "once-per-combat triggers reset on combat end" |
| Mechanic id | `once_per_combat` in `canonical_combat.ts` |

---

## 28. Evidence test.* content is excluded from production

| Evidence | Location |
| --- | --- |
| Audit live snapshot | `progression_design_audit.test.ts` |
| Register | `C-test-classes-fixtures` TEST_ONLY_PERMANENT |
| Production roster | four `class.*` only |

---

## 29. Every unresolved conflict after PROG-08

No **`BLOCKING`** rows in `docs/progression/CURRENT_CONFLICTS.md` (verified 2026-09-16).

**DEFERRED (expected before PROG-15, some owned by PROG-09):**

| Id | Summary | Owner |
| --- | --- | --- |
| C-attack-foundation | Live ATTACK still Foundation `test.stat.attack` | PROG-09–12 |
| C-frenzy-combat | No Frenzy combat behavior yet | PROG-09 Warrior/Berserker |
| C-equipment-auto-attack-baseline | §9 auto-attack baselines vs gear | PROG-09–12 |
| C-cooldown-recovery-rate | Engine live; Relentless/Nimble talents not | PROG-09–12 |
| C-shields-taunt | Engine live; class abilities not wired | PROG-09–12 |
| C-legacy-migration | Schema-2 leftover Foundation fields | PROG-14 |

**NONCANONICAL / permanent test:** `C-quest-xp-20`, `C-test-classes-fixtures`.

---

## 30. Every conflict resolved since the PROG-04 snapshot

Includes (not exhaustive): `C-canonical-damage`, `C-roster-four-classes`, `C-stat-ids-production`, `C-xp-curve-live`, `C-kill-xp`, `C-mana-*`, `C-haste-cooldowns`, `C-gcd`, `C-dot-crit-engine`, `C-hotbar-dual`, `C-unlock-any-ability`, `C-talent-runtime`, `C-respec`, `C-frenzy-passive` (interpretation/migration), and others marked **RESOLVED** in CURRENT_CONFLICTS.

---

## 31. Exact files likely to change in PROG-09

Per PROG-09 brief and architecture (class combat on generic engine):

- `content/source/**` — Warrior/Bulwark/Berserker ability definitions (IDs stable)
- `server/src/domain/match_loop.ts` / ATTACK path — retune auto-attack for Warrior line
- `server/src/domain/combat_pipeline.ts`, `ability.ts` — wire class abilities without new pipeline
- `server/tests/progression_*`, new PROG-09 class tests
- `client/scripts/app/ability_service.gd`, world/combat presentation
- `docs/PROGRESS.md` only after PROG-09 acceptance gates pass

**Do not** add parallel combat/stat/threat engines.

---

## 32. Exact tests PROG-09 must preserve

From PROG-08 acceptance (`docs/PROGRESS.md` + this re-verify):

| Suite | Count / result |
| --- | --- |
| Content-build | 25/25 |
| PROG design audit | 10/10 |
| Foundation audit | OK |
| Server hermetic | 669 pass, 13 skipped |
| Auth-gateway | 52/52 |
| Client GdUnit | 283 documented (**re-run required** before claiming on new commits) |

**PROG-08 combat files (must stay green):**  
`canonical_combat.test.ts`, `combat_events.test.ts`, `combat_rng.test.ts`, `progression_dot_haste.test.ts`, `progression_gcd_absent.test.ts`, `progression_combat_mechanics.test.ts`, plus PROG-01–07 tests referenced in `PROGRESSION_TEST_PLAN.md`.

---

## 33. Exact tests PROG-09 must add

Per `docs/progression/PROGRESSION_TEST_PLAN.md` and PROG-09 prompt (when executed):

- Warrior / Bulwark / Berserker ability behavior on generic handlers
- Live ATTACK retune for Warrior line (`C-attack-foundation` closure for those classes)
- Frenzy passive combat (`C-frenzy-combat`)
- Class-specific shield/taunt/challenge wiring where applicable (`C-shields-taunt`)

Named files to be added by PROG-09 implementation (not pre-listed in repo until phase lands).

---

## 34. Known technical debt

| Item | Detail |
| --- | --- |
| Node 22 `npm test` | Directory invocation to `node --test` fails; use `*.test.js` glob |
| `origin/main` lag | PROG/ACCT/Foundation not merged to default branch |
| Client gate on verify VM | Godot not installed |
| Live ATTACK | Still Foundation numbers until PROG-09+ |
| Legacy schema-2 fields | PROG-14 migration policy |

---

## 35. Known migration risks

See `PROGRESSION_MIGRATION_PLAN.md` and `C-legacy-migration`. PROG-14 must classify dev vs real-player saves before production rollout.

---

## 36. Known security risks

Server rejects client crit/random injection (`progression_combat_mechanics.test.ts`, `combat_rng.test.ts`). Maintain authority on all new PROG-09 abilities. See `docs/SECURITY_MODEL.md` and account threat model.

---

## 37. Known balance risks

§12 DPS audit (`progression_dps_audit.test.ts`) and enemy baselines are **later** PROG phases. PROG-09 class tuning must not break Prompt 18 village/slime freeze without explicit phase.

---

## 38. Clear PROG-09 implementation boundary

**In scope:** Warrior, Bulwark, Berserker class combat definitions using accepted generic combat/effect/threat/cooldown systems; begin closing `C-attack-foundation`, `C-frenzy-combat`, and related DEFERRED items owned by PROG-09.

**Out of scope:** Marksman/Mystic (PROG-10–12), second combat engine, production GCD, eight-slot production hotbar, PvP, new zones, dependency upgrades, Prompt 18 behavior changes without defect fix.

---

## 39. Clear list of systems PROG-09 must not change

- Auth gateway + ACCT storage contracts
- Progression schema versioning rules (except additive class ability grants)
- Four-slot hotbar authority and no production GCD invariants
- Generic combat event bus and RNG authority model
- Content hash unless a named content phase rebuilds
- `client/addons/*`
- Frozen Prompt 18 village/slime path

---

## 40. Final go / no-go decision for starting PROG-09

| Criterion | On PROG line (`npc-quest-acceptance`) | On `origin/main` |
| --- | --- | --- |
| PROG-08 in `docs/PROGRESS.md` | **Yes** | **No** |
| PROG-08 modules (`canonical_combat.ts`, tests) | **Present** (`8f0b949+`) | **Absent** |
| Server/content/audit/auth baseline (this run) | **Pass** (client not run) | N/A (old 62-test tree) |
| PROG-09 go/no-go table (`CURRENT_CONFLICTS`) | Criteria satisfied except **client gate not re-run here** | Not applicable |
| `BLOCKING` conflicts | **None** | N/A |
| DEFERRED owned by PROG-09 | Expected (`C-attack-foundation`, etc.) | — |

### Decision

- **`origin/main`:** **NO-GO** — does not contain PROG-01–08 or PROG-08 acceptance in PROGRESS.
- **PROG line (`origin/cursor/npc-quest-acceptance` @ `3cb1e35`, contains `8f0b949`):** **CONDITIONAL GO** — implement PROG-09 only from this line (or after merge to `main`), after maintainer re-runs **`scripts/test-client.ps1`** (283 GdUnit) and confirms Docker/e2e gates if required by team policy.

Do **not** treat "PROG-08 just committed" as true on **`origin/main`** until merge and PROGRESS on `main` match the PROG line.

---

## Missing documentation (requested paths)

On the **PROG line**, these paths **exist** (contrary to the prior handover drafted from slim `main`):

- `docs/design/rpg-progression-design-v1.0.md`
- `docs/design/progression-interpretations.md`
- `docs/design/progression-implementation-addendum.md`
- `docs/progression/PROGRESSION_ARCHITECTURE.md`
- `docs/progression/CANONICAL_VALUE_CATALOG.md`
- `docs/progression/PROGRESSION_STORAGE_CATALOG.md`
- `docs/progression/PROGRESSION_PROTOCOL_CATALOG.md`
- `docs/progression/PROGRESSION_MIGRATION_PLAN.md`
- `docs/progression/PROGRESSION_TEST_PLAN.md`
- `docs/STORAGE_CATALOG.md`
- `docs/account/*`

Still **missing on `origin/main`** until merge.

---

## Repository discrepancies vs conversation / coordinator narrative

| Claim | Repo fact |
| --- | --- |
| "PROG-08 just committed" | Commit **`8f0b949`** exists on **`origin/cursor/npc-quest-acceptance`**, not on **`origin/main`**. |
| PROG-08 accepted | **`docs/PROGRESS.md`** on PROG line — yes; on **`main`** — last phase is room chat only. |
| Prior handover @ `main`/`dccb539` | Correctly documented **NO-GO** for that tree; superseded by this re-verify on the PROG line. |
| Post-PROG-08 commit `3cb1e35` | Asset-only (sprites/music/grass); does not remove PROG-08. |
