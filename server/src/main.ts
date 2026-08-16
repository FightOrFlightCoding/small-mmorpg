import { handleHealthRpc } from "./rpcs/health";
import {
  rpcCharacterBootstrap,
  rpcCharacterCreate,
  rpcCharacterList,
  rpcCharacterRestore,
  rpcCharacterSelect,
  rpcCharacterSoftDelete,
} from "./rpcs/character_lifecycle";
import { rpcFindOrCreateStarterZone } from "./rpcs/find_or_create_starter_zone";
import { starterZoneMatchHandler } from "./nakama/starter_zone_match";
import { beforeChannelJoin, beforeChannelMessageSend } from "./nakama/chat_hooks";
import { STARTER_ZONE_MODULE } from "./domain/match_state";
import { PROTOCOL_VERSION } from "./domain/protocol";
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
  initializer.registerRpc("character_list", rpcCharacterList);
  initializer.registerRpc("character_create", rpcCharacterCreate);
  initializer.registerRpc("character_select", rpcCharacterSelect);
  initializer.registerRpc("character_soft_delete", rpcCharacterSoftDelete);
  initializer.registerRpc("character_restore", rpcCharacterRestore);
  initializer.registerRpc("find_or_create_starter_zone", rpcFindOrCreateStarterZone);
  initializer.registerMatch(STARTER_ZONE_MODULE, starterZoneMatchHandler);
  // Nakama 3.40.0 walks InitModule's AST for registerRtBefore; a helper call is not visible.
  initializer.registerRtBefore("ChannelMessageSend", beforeChannelMessageSend);
  initializer.registerRtBefore("ChannelJoin", beforeChannelJoin);
  logger.info(
    "vibecode runtime loaded rpc=vibecode_health,character_bootstrap,character_list,character_create,character_select,character_soft_delete,character_restore,find_or_create_starter_zone match=%s protocol_version=%s content_hash=%s zone=%s chat_room=zone.starter",
    STARTER_ZONE_MODULE,
    String(PROTOCOL_VERSION),
    contentHash,
    content.zones["zone.starter"].id,
  );
}

// Keep InitModule in the Rollup bundle (Nakama looks it up on the global object).
!InitModule && InitModule.bind(null);
