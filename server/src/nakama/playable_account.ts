import { evaluatePlayableAccount, type AccountGateResult, type AccountGateSnapshot } from "../domain/account_gate";
import { requireAuthenticatedUserId } from "../domain/character";
import { throwRpcFailure } from "../domain/rpc_error";
import { readAccountProfile } from "./account_profile_store";

export function loadAccountGateSnapshot(nk: nkruntime.Nakama, userId: string): AccountGateSnapshot {
  let hasEmail = false;
  let disableTime = 0;
  try {
    const account = nk.accountGetId(userId);
    hasEmail = typeof account.email === "string" && account.email.length > 0;
    disableTime = typeof account.disableTime === "number" ? account.disableTime : 0;
  } catch {
    return {
      userId: userId,
      hasEmail: false,
      disableTime: 0,
      profile: { status: "DELETED", verifiedAt: 0 },
    };
  }
  const profile = readAccountProfile(nk, userId);
  return {
    userId: userId,
    hasEmail: hasEmail,
    disableTime: disableTime,
    profile:
      profile === null
        ? null
        : {
            status: profile.status,
            verifiedAt: profile.verifiedAt,
          },
  };
}

export function assertPlayableAccount(nk: nkruntime.Nakama, userId: string): AccountGateResult {
  return evaluatePlayableAccount(loadAccountGateSnapshot(nk, userId));
}

export function requirePlayableUser(ctx: nkruntime.Context, nk: nkruntime.Nakama): string {
  try {
    const userId = requireAuthenticatedUserId(ctx.userId);
    const gate = assertPlayableAccount(nk, userId);
    if (!gate.ok) {
      throwRpcFailure(gate.code);
    }
    return userId;
  } catch (error) {
    throwRpcFailure(error);
  }
}
