# Item system ready (ITEM-11)

The item, inventory, loot, merchant, ground, trade, and quest-possession platform is certified. Do not add harvesting, cooking, mining, blacksmithing, auctions, mail, offline trade, or merchant selling in this pack.

Suggested release tag (do **not** create without approval): **`item-inventory-loot-v1`**.

## Platform

| Surface | Contract |
| --- | --- |
| Bag | 30 slots, indices 0–29, persistent 6×5 order |
| Stacks | Absolute max 99; equippable max 1 |
| Equipment | Outside the bag; unequip needs a free slot |
| Corpse | First-hit tag, 60 s private, 5 min expire, Loot All, gold split once |
| Need/Greed | Uncommon+ party drops; Need > Greed > Pass; server 1–100 |
| Merchant | Session-gated buy; server `buyPrice`; unlimited stock |
| Ground | Public 5 min; server placement; full-stack pickup |
| Trade | 20 offer slots/side; gold reserved until commit; atomic `multiUpdate` |
| Quest items | Tradeable and droppable; possession = bag minus live offers |
| Future grants | Trusted-server `grantItemFromSource` only |
| Recovery | GM `scan_item_recovery` / `repair_item_recovery`; never silent delete |

Authority: the client sends intentions. It never authors instance ids, prices, gold amounts, roll numbers, winners, bag layouts, or ground coordinates.

## Security

Every listed threat has threat, validation, rate limit, payload limit, idempotency, lock rule, expected rejection, audit event, and automated tests in `server/src/domain/item_security_catalog.ts`. See [ITEM_SECURITY_MODEL.md](ITEM_SECURITY_MODEL.md).

## Recovery

Authorized GM scan reports orphan locks, incomplete transactions/gold/drops/trades, invalid container refs, duplicate slots, overstack, missing definitions, and overflow. Repair moves extras to overflow and clears orphan locks. Missing definitions stay. See [ITEM_RECOVERY_RUNBOOK.md](ITEM_RECOVERY_RUNBOOK.md).

## Five-client journey

Hermetic coverage is `server/tests/item_cert_journey.test.ts`. Manual QA after this lands on `origin/main` uses `scripts/local-play.ps1 -Branch main`.

## Clean checkout

```bash
npm ci --prefix tools/content-build
npm ci --prefix server
npm ci --prefix auth-gateway
(cd tools/content-build && npx tsc -p tsconfig.json && node --test dist/tests/*.test.js)
(cd server && npx tsc -p tsconfig.test.json && node --test dist-test/tests/*.test.js && npm run typecheck && npm run build)
(cd auth-gateway && npx tsc -p tsconfig.test.json && node --test dist-test/tests/*.test.js)
bash scripts/test-audit.sh
GODOT_BIN=godot bash scripts/test-client.sh
```

Directory-form `node --test dist/tests` can fail on Node 22.14 before discovery. Glob invocation is authoritative.

## Gates (2026-09-20)

| Gate | Result |
| --- | --- |
| Foundation audit | `FOUNDATION_AUDIT_OK` (35 storage records, 49 client opcodes, 19 server opcodes, 29 RPCs) |
| Content validation/tests | 29/29 passed |
| Server hermetic tests | 1068 passed, 13 expected live-test skips |
| Server typecheck/build | passed |
| Auth gateway hermetic tests | 52/52 passed |
| Godot 4.7.1 client GdUnit | 371/371 passed, 0 failures, 0 orphans |

Content hash after manual QA fixtures: `970b28819155ae6623a9f343a55aee963ebba90b0472925a4df9e4fc2c8ec9da`. Certification gates above used `d7e71fa4bd525906da2ee6d4244745d63980b738bfa7ad2a7b94c5010cc13bd9` before those fixtures.

## Acceptance

ITEM-01 through ITEM-11 gates pass. Recovery does not delete unexplained items. The 30-slot bag and 20-slot trade hold. A clean checkout reproduces with the glob `node --test` invocation. Remaining product limits: [KNOWN_ITEM_LIMITATIONS.md](KNOWN_ITEM_LIMITATIONS.md).
