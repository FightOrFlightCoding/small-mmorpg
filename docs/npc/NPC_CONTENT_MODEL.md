# NPC content model (NPC-01)

NPC definitions use `content/schemas/npc.json` and are authored under `content/source/`. The schema is strict (`additionalProperties: false`) and requires `id`, `kind: "npc"`, display name, visual ID, zone ID, position, interaction range, dialogue ID, and one or more services. Content generation validates stable IDs, visual/dialogue assets, zone placement/pose agreement, references, and duplicate placement IDs.

## Service catalog

| Service | Existing owner | Content references |
| --- | --- | --- |
| `dialogue` | `DialoguePresenter` | `dialogueId` |
| `quest_offer` / `quest_turn_in` | `quest.ts` | `questIds` (also the source for client offered-dialogue helpers) |
| `vendor` | `vendor.ts` | required `vendorId` |
| `inn` / `healer` | `inn.ts` | optional cost, heal/resource/bind flags |
| `cave_entrance` / `cave_exit` | `cave.ts`, `inn.ts` gate | optional party/prerequisite fields |
| `respec` | `canonical_respec.ts` | authored service gate; no ID overlay |

Service `minLevel`, `classRequirements`, `requireParty`, and required quest status are server-authorized gates via `resolveInteraction`. Prices belong to vendor item stock and sell multipliers, not NPC dialogue or client requests. Dialogue file paths remain client-local mappings keyed by `dialogueId`; no asset path crosses protocol or storage.

## Current NPC catalog

| IDs | Classification | Notes |
| --- | --- | --- |
| `npc.elder`, `npc.proof_giver`, `npc.cert_quartermaster` | Correct content references | Production starter-zone definitions. Elder carries the accepted slice quest bindings. Dialogue actions resolve those bindings from services. |
| `npc.test_vendor`, `npc.test_innkeeper`, `npc.test_herald`, `npc.test_cave_portal`, `npc.test_cave_exit` | Test/cert fixture content | Generic service coverage and cert journey fixtures; several are placed in the starter/cave templates. `npc.test_innkeeper` authors `respec`. |
| `npc.lab_keeper`, `npc.lab_vendor`, `npc.lab_inn`, `npc.lab_trainer`, `npc.lab_exit` | Development-only test fixtures | Excluded from the production generated bundle with `test.zone.systems_lab`. `npc.lab_trainer` authors `respec`. |

## Hard-coded NPC ID audit

| ID/use | Classification | Required future migration |
| --- | --- | --- |
| NPC IDs in `content/source`, generated content, zone placement, visual map, and dialogue map | Correct content reference | Keep stable ID references; generated artifacts are never hand-edited. |
| `npc.elder` in `ContentCatalog.REQUIRED_IDS` and slice/cert driver | Temporary vertical-slice assumption / test fixture | Replace fixed required-ID assumptions through a later content/presentation migration if the slice ID set expands. |
| `npc.test_*` and `npc.lab_*` literals in tests and debug/cert journeys | Test fixture | Keep only in test/development paths; do not treat them as a production NPC class hierarchy. |

No NPC identifier may be treated as an authority grant. Unknown IDs, missing service references, and unknown service types are rejected by content/protocol validation.
