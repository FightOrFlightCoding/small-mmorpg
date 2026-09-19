/** Stable item-mutation error catalogue. Wire values stay snake_case. */

export const ITEM_ERROR_INVENTORY_STALE = "inventory_stale";
export const ITEM_ERROR_INVENTORY_FULL = "inventory_full";
export const ITEM_ERROR_INVALID_SLOT = "invalid_slot";
export const ITEM_ERROR_INVALID_QUANTITY = "invalid_quantity";
export const ITEM_ERROR_STACK_INCOMPATIBLE = "stack_incompatible";
export const ITEM_ERROR_STACK_FULL = "stack_full";
export const ITEM_ERROR_ITEM_LOCKED = "item_locked";
export const ITEM_ERROR_ITEM_NOT_OWNED = "item_not_owned";
export const ITEM_ERROR_ITEM_NOT_FOUND = "item_not_found";
export const ITEM_ERROR_ITEM_ALREADY_CLAIMED = "item_already_claimed";
export const ITEM_ERROR_SOURCE_UNAVAILABLE = "source_unavailable";
export const ITEM_ERROR_DESTINATION_UNAVAILABLE = "destination_unavailable";
export const ITEM_ERROR_TRANSACTION_CONFLICT = "transaction_conflict";
export const ITEM_ERROR_TRANSACTION_RECOVERY_PENDING = "transaction_recovery_pending";

export const ITEM_ERROR_CATALOG = [
  ITEM_ERROR_INVENTORY_STALE,
  ITEM_ERROR_INVENTORY_FULL,
  ITEM_ERROR_INVALID_SLOT,
  ITEM_ERROR_INVALID_QUANTITY,
  ITEM_ERROR_STACK_INCOMPATIBLE,
  ITEM_ERROR_STACK_FULL,
  ITEM_ERROR_ITEM_LOCKED,
  ITEM_ERROR_ITEM_NOT_OWNED,
  ITEM_ERROR_ITEM_NOT_FOUND,
  ITEM_ERROR_ITEM_ALREADY_CLAIMED,
  ITEM_ERROR_SOURCE_UNAVAILABLE,
  ITEM_ERROR_DESTINATION_UNAVAILABLE,
  ITEM_ERROR_TRANSACTION_CONFLICT,
  ITEM_ERROR_TRANSACTION_RECOVERY_PENDING,
] as const;

export type ItemErrorCode = (typeof ITEM_ERROR_CATALOG)[number];

export function isItemErrorCode(code: string): boolean {
  return ITEM_ERROR_CATALOG.indexOf(code as ItemErrorCode) !== -1;
}

export function staleRevisionCode(currentRevision: number, expectedRevision?: number): string {
  if (expectedRevision === undefined) {
    return "";
  }
  if (expectedRevision !== currentRevision) {
    return ITEM_ERROR_INVENTORY_STALE;
  }
  return "";
}

export function isTerminalItemFailure(code: string): boolean {
  if (code === ITEM_ERROR_INVENTORY_STALE) {
    return false;
  }
  if (code === "player_dead") {
    return false;
  }
  return code.length > 0 && code !== "ok";
}
