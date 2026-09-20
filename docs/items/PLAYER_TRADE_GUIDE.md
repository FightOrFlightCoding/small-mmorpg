# Player trade guide

Nearby, same-match, online characters may trade items and gold. There is no mail, auction, or offline trade in this pack.

## Offers

Each side has **exactly 20** item-offer slots (indices 0–19). A twenty-first stack is `offer_full`. Optional `slotIndex` on `TRADE_SET_OFFER`. Partial-stack offers lock the **whole** source stack (`lockReason: "trade"`) and leave ownership in the offering bag until commit.

Gold offers are nonnegative integers reserved against spendable balance. Gold moves only at commit (account Nakama wallet).

## Revision

Every offer change, recovered source quantity change, and capacity-relevant inventory mutation increments revision, clears both acceptances, broadcasts canonical offers, and shows “The trade has changed.”

## Commit

Both participants must accept the current revision. `planTwoWayTrade` simulates final bags. Outgoing stacks can free room; incoming stacks may merge. Commit is one `nk.multiUpdate` (or the committing snapshot / recovery path). Duplicate `requestId` does not mutate again. Safe failures (`inventory_full`, `insufficient_gold`) keep the trade open. Unsafe failures cancel and release locks.

## Cancel

Disconnect, link-dead, death, range, transfer, timeout, and invalidated sources cancel and release every trade lock. Range is 80 px. Invite TTL 30 s; session 120 s.

## UI

Local bag, local 20-slot offer, remote 20-slot offer, both gold fields, both acceptances, current revision. Never the remote bag. The UI does not predict ownership.
