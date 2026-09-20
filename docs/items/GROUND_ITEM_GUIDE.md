# Ground item guide

Dragging a bag stack into the world sends `DROP_ITEM`. Default quantity is the whole stack; quantity must be 1..stack. Uncommon or higher shows “This item will be public and can be picked up by anyone.” and requires confirmation.

## Server placement

The server uses the character pose plus optional `hintDx` / `hintDy`, drop radius, walkable bounds, and walls. Client `x` / `y` are `stat_injection`. Equipped items must be unequipped first. Locked stacks cannot drop. All production items, including quest items, may drop.

A character may have 20 active player-created ground entities. At the limit the new drop is rejected; older entities are not deleted.

## Entity

Match `state.groundItems`: public immediately, no physics collision, five-minute TTL, revisioned. `FULL_STATE` omits instance ids and creator. Pickup is `PICKUP_GROUND_ITEM`, all-or-nothing. Exactly one claimant succeeds; others `ground_item_no_longer_available`. Duplicate `requestId` replays.

## Durability

`executeDropIntent` prevents loss before entity creation and duplicate ground/bag copies. Interrupted `COMMITTING` restores the bag or overflow.

Ground items are match-lifetime. They are not reconstructed after match or server restart. Quest-item drop reduces possession without failing the quest.
