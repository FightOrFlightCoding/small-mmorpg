import { handleHealthRpc } from "./rpcs/health";
import { rpcCharacterBootstrap } from "./rpcs/character_bootstrap";
import { content, contentHash } from "./generated/content";

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
  initializer.registerRpc("character_bootstrap", rpcCharacterBootstrap);
  logger.info(
    "vibecode runtime loaded rpc=vibecode_health,character_bootstrap protocol_version=1 content_hash=%s zone=%s",
    contentHash,
    content.zones["zone.starter"].id,
  );
}

// Keep InitModule in the Rollup bundle (Nakama looks it up on the global object).
!InitModule && InitModule.bind(null);
