# Inventory UI guide

The bag is a 6×5 grid of slots 0–29. Empty squares stay visible. Occupancy is stack count, not weight.

## What the client may do

Send `MOVE_ITEM`, `SPLIT_STACK`, `EQUIP`, `DESTROY_ITEM`, `RECOVER_OVERFLOW_ITEM`, `DROP_ITEM`, and optional `expectedRevision`. Wait for `INVENTORY_STATE` / `EQUIPMENT_STATE`. Local GLoot edits revert.

## Drag and drop

- Empty destination: move.
- Compatible partial stack: merge; leftover stays in the source.
- Two full identical stacks: `stack_full`, no mutation.
- Occupied incompatible slot: reject.
- Bag → world: drop (Uncommon+ requires the public-drop confirmation).
- Bag → corpse: reject.

Split quantity is 1 .. source-1. The server mints the new instance id.

## Equipment

Equipped instances leave the bag. Unequip is rejected with `inventory_full` when no free slot exists; the item stays equipped.

## Recovery panel

Overflow is not a 31st bag. Recover requires a free bag slot. Occupied destinations are `invalid_slot`.

## Addons

Do not edit `client/addons/`. GLoot is a mirror only.
