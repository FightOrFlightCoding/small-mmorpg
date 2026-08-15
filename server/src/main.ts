import { handleHealthRpc } from "./rpcs/health";

function rpcVibecodeHealth(
  _ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  _nk: nkruntime.Nakama,
  payload: string,
): string {
  try {
    return JSON.stringify(handleHealthRpc(payload));
  } catch (error) {
    const message = error instanceof Error ? error.message : "internal_error";
    logger.error("vibecode_health rejected reason=%s", message);
    throw error;
  }
}

function InitModule(
  _ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  _nk: nkruntime.Nakama,
  initializer: nkruntime.Initializer,
): void {
  initializer.registerRpc("vibecode_health", rpcVibecodeHealth);
  logger.info("vibecode runtime loaded rpc=vibecode_health protocol_version=1");
}

// Keep InitModule in the Rollup bundle (Nakama looks it up on the global object).
!InitModule && InitModule.bind(null);
