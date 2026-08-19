export type RecoveryScenario =
  | "bad_server_deployment"
  | "bad_content_package"
  | "failed_migration"
  | "corrupted_character_location"
  | "interrupted_trade"
  | "missing_cave_match"
  | "incompatible_client"
  | "accidental_item_grant"
  | "accidentally_completed_quest";

export interface RecoveryProcedure {
  scenario: RecoveryScenario;
  operator: string;
  gmCommand?: string;
  blocksGameplay: boolean;
}

export const RECOVERY_PROCEDURES: RecoveryProcedure[] = [
  {
    scenario: "bad_server_deployment",
    operator: "Redeploy the previous server bundle, keep the database, then smoke-test health and one join.",
    blocksGameplay: true,
  },
  {
    scenario: "bad_content_package",
    operator: "Restore the previous contentHash artifacts on client and server. Do not migrate saves backward.",
    blocksGameplay: true,
  },
  {
    scenario: "failed_migration",
    operator: "Leave blockTransactions on. Restore the pre-migration backup into a drill database, verify, then restore local/staging only with dual confirmation.",
    blocksGameplay: true,
  },
  {
    scenario: "corrupted_character_location",
    operator: "Authorized GM repair_invalid_location returns the character to the public world spawn.",
    gmCommand: "repair_invalid_location",
    blocksGameplay: false,
  },
  {
    scenario: "interrupted_trade",
    operator: "Rejoin recovers a committing trade; GM cancel_trade unlocks a stuck live trade.",
    gmCommand: "cancel_trade",
    blocksGameplay: false,
  },
  {
    scenario: "missing_cave_match",
    operator: "find_or_create_starter_zone falls back to the public world when the cave match is gone.",
    blocksGameplay: false,
  },
  {
    scenario: "incompatible_client",
    operator: "Handshake and join reject with client_too_old, client_too_new, protocol_mismatch, or content_mismatch. Players must update; they cannot enter gameplay.",
    blocksGameplay: true,
  },
  {
    scenario: "accidental_item_grant",
    operator: "Authorized GM remove_test_item with the instance id. Audit records the correction.",
    gmCommand: "remove_test_item",
    blocksGameplay: false,
  },
  {
    scenario: "accidentally_completed_quest",
    operator: "Authorized GM reset_quest returns the quest to locked/accepted without fabricating rewards.",
    gmCommand: "reset_quest",
    blocksGameplay: false,
  },
];

export function recoveryFor(scenario: RecoveryScenario): RecoveryProcedure {
  for (let i = 0; i < RECOVERY_PROCEDURES.length; i++) {
    if (RECOVERY_PROCEDURES[i].scenario === scenario) {
      return RECOVERY_PROCEDURES[i];
    }
  }
  throw new Error("unknown_recovery_scenario");
}

export const DEPLOY_ORDER = [
  "backup",
  "content_validation",
  "migration_dry_run",
  "server_deployment",
  "migration_application",
  "client_compatibility_update",
  "smoke_test",
  "maintenance_removal",
] as const;

export const STAGING_OVERWRITE_TOKEN = "OVERWRITE-STAGING";
export const PRODUCTION_OVERWRITE_TOKEN = "OVERWRITE-PRODUCTION";

export function productionOverwriteAllowed(environmentName: string, confirmation: string): boolean {
  if (environmentName === "local" || environmentName === "automated_test") {
    return true;
  }
  if (environmentName === "staging") {
    return confirmation === STAGING_OVERWRITE_TOKEN;
  }
  if (environmentName === "production") {
    return confirmation === PRODUCTION_OVERWRITE_TOKEN;
  }
  return false;
}
