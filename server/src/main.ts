import { handleHealthRpc } from "./rpcs/health";
import {
  rpcCharacterBootstrap,
  rpcCharacterCreate,
  rpcCharacterDeleteRequest,
  rpcCharacterList,
  rpcCharacterNameAvailable,
  rpcCharacterPurge,
  rpcCharacterRestore,
  rpcCharacterSelect,
  rpcCharacterSoftDelete,
} from "./rpcs/character_lifecycle";
import { rpcFindOrCreateStarterZone } from "./rpcs/find_or_create_starter_zone";
import { rpcFindOrCreateOwnedCave, rpcRequestCaveEntry, rpcRequestCaveExit } from "./rpcs/cave";
import {
  rpcPartyAccept,
  rpcPartyCreate,
  rpcPartyDecline,
  rpcPartyDisband,
  rpcPartyGetState,
  rpcPartyInvite,
  rpcPartyKick,
  rpcPartyLeave,
  rpcPartyPromote,
} from "./rpcs/party";
import { rpcGmCommand } from "./rpcs/gm";
import { rpcSessionHandshake } from "./rpcs/handshake";
import { rpcOpsSetMaintenance, rpcOpsStatus } from "./rpcs/ops";
import { rpcAcctCompatProbe } from "./rpcs/acct_compat";
import { rpcAuthGateway } from "./rpcs/auth_gateway";
import { starterZoneMatchHandler } from "./nakama/starter_zone_match";
import { beforeChannelJoin, beforeChannelMessageSend } from "./nakama/chat_hooks";
import { beforeAuthenticateDevice, beforeAuthenticateEmail } from "./nakama/auth_hooks";
import { STARTER_ZONE_MODULE } from "./domain/match_state";
import { PROTOCOL_VERSION } from "./domain/protocol";
import { content, contentHash } from "./generated/content";
import { bindCaveOwnershipReleaser } from "./domain/cave_ownership";
import { expirePartyOwnedCave } from "./domain/cave";
import { nakamaCaveRepository } from "./nakama/cave_store";
import { environmentFromRuntime, parseBoolEnv } from "./domain/environment";
import { applyAndStoreMaintenance, readEffectiveMaintenance } from "./nakama/ops_store";
import { formatOpsLog, snapshotCounters } from "./domain/ops_metrics";
import { rpcFailureCode, rpcFailurePayload } from "./domain/rpc_error";

function rpcVibecodeHealth(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string,
): string {
  try {
    const env = environmentFromRuntime(ctx.env);
    const maintenance = readEffectiveMaintenance(nk, env, ctx.env);
    return JSON.stringify(
      handleHealthRpc(payload, {
        environment: env.name,
        serverVersion: env.serverVersion,
        minClientVersion: env.minClientVersion,
        maxClientVersion: env.maxClientVersion,
        contentPackageVersion: env.contentVersion,
        maintenance: maintenance.enabled,
        counters: snapshotCounters(),
      }),
    );
  } catch (error) {
    const message = rpcFailureCode(error);
    logger.error("vibecode_health rejected reason=%s", message);
    return rpcFailurePayload(message);
  }
}

function InitModule(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  initializer: nkruntime.Initializer,
): void {
  const env = environmentFromRuntime(ctx.env);
  if (parseBoolEnv(ctx.env !== undefined ? ctx.env["VIBECODE_MAINTENANCE"] : undefined, false)) {
    applyAndStoreMaintenance(nk, { enabled: true, rejectJoins: true }, Date.now());
  }
  bindCaveOwnershipReleaser(function (partyId: string) {
    return expirePartyOwnedCave(nakamaCaveRepository(nk), partyId, Date.now());
  });
  initializer.registerRpc("vibecode_health", rpcVibecodeHealth);
  initializer.registerRpc("character_bootstrap", rpcCharacterBootstrap);
  initializer.registerRpc("character_list", rpcCharacterList);
  initializer.registerRpc("character_create", rpcCharacterCreate);
  initializer.registerRpc("character_select", rpcCharacterSelect);
  initializer.registerRpc("character_soft_delete", rpcCharacterSoftDelete);
  initializer.registerRpc("character_delete_request", rpcCharacterDeleteRequest);
  initializer.registerRpc("character_restore", rpcCharacterRestore);
  initializer.registerRpc("character_name_available", rpcCharacterNameAvailable);
  initializer.registerRpc("character_purge", rpcCharacterPurge);
  initializer.registerRpc("find_or_create_starter_zone", rpcFindOrCreateStarterZone);
  initializer.registerRpc("request_cave_entry", rpcRequestCaveEntry);
  initializer.registerRpc("find_or_create_owned_cave", rpcFindOrCreateOwnedCave);
  initializer.registerRpc("request_cave_exit", rpcRequestCaveExit);
  initializer.registerRpc("party_create", rpcPartyCreate);
  initializer.registerRpc("party_invite", rpcPartyInvite);
  initializer.registerRpc("party_accept", rpcPartyAccept);
  initializer.registerRpc("party_decline", rpcPartyDecline);
  initializer.registerRpc("party_leave", rpcPartyLeave);
  initializer.registerRpc("party_kick", rpcPartyKick);
  initializer.registerRpc("party_promote", rpcPartyPromote);
  initializer.registerRpc("party_disband", rpcPartyDisband);
  initializer.registerRpc("party_get_state", rpcPartyGetState);
  initializer.registerRpc("gm_command", rpcGmCommand);
  initializer.registerRpc("session_handshake", rpcSessionHandshake);
  initializer.registerRpc("ops_status", rpcOpsStatus);
  initializer.registerRpc("ops_set_maintenance", rpcOpsSetMaintenance);
  initializer.registerRpc("acct_compat_probe", rpcAcctCompatProbe);
  initializer.registerRpc("auth_gateway", rpcAuthGateway);
  initializer.registerMatch(STARTER_ZONE_MODULE, starterZoneMatchHandler);
  initializer.registerStorageIndex("acct_compat_email_hmac", "account_compat", "email_index", ["hmac"], ["hmac"], 10000, false);
  initializer.registerStorageIndex("account_profile_email_hmac", "account_profile", "email_index", ["hmac"], ["hmac"], 10000, false);
  initializer.registerStorageIndex("auth_challenge_lookup", "auth_challenge", "", ["email_lookup_hash", "purpose"], ["created_at"], 10000, false);
  // Nakama 3.40.0 walks InitModule's AST for registerRtBefore; a helper call is not visible.
  initializer.registerRtBefore("ChannelMessageSend", beforeChannelMessageSend);
  initializer.registerRtBefore("ChannelJoin", beforeChannelJoin);
  initializer.registerBeforeAuthenticateEmail(beforeAuthenticateEmail);
  initializer.registerBeforeAuthenticateDevice(beforeAuthenticateDevice);
  logger.info(
    formatOpsLog("runtime_loaded", {
      environment: env.name,
      server_version: env.serverVersion,
      protocol_version: PROTOCOL_VERSION,
      content_hash: contentHash,
      zone: content.zones["zone.starter"].id,
    }),
  );
}

// Keep InitModule in the Rollup bundle (Nakama looks it up on the global object).
!InitModule && InitModule.bind(null);
