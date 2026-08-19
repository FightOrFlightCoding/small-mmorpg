import { requireAuthenticatedUserId } from "../domain/character";
import { evaluateHandshake, handshakeOkResponse, parseHandshakePayload } from "../domain/handshake";
import { formatOpsLog } from "../domain/ops_metrics";
import { rpcFailureCode, rpcFailurePayload } from "../domain/rpc_error";
import { contentHash, packageVersion } from "../generated/content";
import { readEffectiveMaintenance, readEnvironment } from "../nakama/ops_store";

export const SESSION_HANDSHAKE_RPC_ID = "session_handshake";

export function rpcSessionHandshake(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string,
): string {
  try {
    const userId = requireAuthenticatedUserId(ctx.userId);
    const request = parseHandshakePayload(payload);
    const env = readEnvironment(ctx);
    const maintenance = readEffectiveMaintenance(nk, env, ctx.env);
    const expected = {
      contentHash: contentHash,
      contentVersion: env.contentVersion.length > 0 ? env.contentVersion : packageVersion,
      serverVersion: env.serverVersion,
      minClientVersion: env.minClientVersion,
      maxClientVersion: env.maxClientVersion,
      environment: env.name,
      maintenance: maintenance,
    };
    const gate = evaluateHandshake(request, expected);
    if (!gate.ok) {
      logger.info(formatOpsLog("authentication_failure", { user_id: userId, reason: gate.code }));
      return rpcFailurePayload(gate.code);
    }
    logger.info(formatOpsLog("session_handshake", { user_id: userId, environment: env.name, client_version: request.clientVersion }));
    return JSON.stringify(handshakeOkResponse(expected));
  } catch (error) {
    const message = rpcFailureCode(error);
    logger.info(formatOpsLog("authentication_failure", {
      user_id: ctx.userId !== undefined ? ctx.userId : "",
      reason: message,
    }));
    return rpcFailurePayload(message);
  }
}
