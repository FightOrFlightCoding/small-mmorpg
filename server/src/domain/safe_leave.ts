import { findLiveTradeForCharacter } from "./trade";
import { dict } from "./maps";
import type { MatchPlayer, StarterZoneState } from "./match_state";

export interface SafeLeaveDenial {
  ok: false;
  code: string;
  message: string;
}

export type SafeLeaveDecision = { ok: true } | SafeLeaveDenial;

export function evaluateSafeLeave(player: MatchPlayer, state: StarterZoneState): SafeLeaveDecision {
  if (player.linkDead === true) {
    return {
      ok: false,
      code: "link_dead",
      message: "Cannot leave safely while connection is lost.",
    };
  }
  if (player.health <= 0) {
    return {
      ok: false,
      code: "dead",
      message: "Cannot leave safely while dead.",
    };
  }
  if (player.inCombat === true) {
    return {
      ok: false,
      code: "in_combat",
      message: "Cannot leave safely while in combat.",
    };
  }
  if (player.activeCast !== undefined && player.activeCast.interruptReason === "") {
    return {
      ok: false,
      code: "casting",
      message: "Cannot leave safely while casting.",
    };
  }
  if (player.transferState === "issued" || player.transferState === "pending") {
    return {
      ok: false,
      code: "transferring",
      message: "Cannot leave safely while transferring.",
    };
  }
  const trade = findLiveTradeForCharacter(dict(state.trades), player.characterId);
  if (trade !== null) {
    if (trade.state === "committing") {
      return {
        ok: false,
        code: "reward_in_progress",
        message: "Cannot leave safely while a reward is committing.",
      };
    }
    return {
      ok: false,
      code: "trading",
      message: "Cannot leave safely while trading.",
    };
  }
  return { ok: true };
}
