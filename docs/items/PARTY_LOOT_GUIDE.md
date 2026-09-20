# Party loot guide

First damaging hit tags the enemy. The encounter roster is a snapshot of that party. Late joiners are not eligible. Leash/full reset clears the tag.

## Timers

| Window | Duration |
| --- | --- |
| Private / Need/Greed | 60 seconds |
| Corpse expire | 5 minutes |
| Sparkle (Prompt 18) | 30 seconds |

## Ordinary items

First eligible claimant. Not round-robin. Not duplicated to the whole party.

## Quest items

First-come, no Need/Greed. Become public at 60 s if unclaimed. Expire with the corpse. May be traded or dropped after pickup.

## Need/Greed

Opens on Uncommon+ party-tagged drops when two or more characters are death-eligible. One eligible character auto-awards. Anyone eligible may Need, Greed, or Pass. One accepted final choice. Missing responses become Pass. Need outranks Greed. Server integers 1–100; ties reroll. The client never sends a roll number or winner.

If the winner bag cannot take the whole stack, the entry becomes `AWARDED_PENDING_PICKUP` (winner-only) until corpse expiry. All-pass becomes public at 60 s. Same-tick public claims cannot run before roll resolution.

## Gold

Private equal split plus remainder (tag owner, then ascending character id). Distribution runs once and is idempotent. Public remainder is first claimant.

## Loot All

Takes what fits. Skips open rolls and foreign pending awards. Reports each entry.

## Restart

Corpses are match-lifetime. Unclaimed corpse loot disappears on match/server restart.
