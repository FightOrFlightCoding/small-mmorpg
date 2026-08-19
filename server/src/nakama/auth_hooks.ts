import { environmentFromRuntime, parseBoolEnv, type EnvironmentConfig } from "../domain/environment";
import { formatOpsLog, incrementCounter } from "../domain/ops_metrics";

export function beforeAuthenticateEmail(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  _nk: nkruntime.Nakama,
  data: nkruntime.AuthenticateEmailRequest,
): nkruntime.AuthenticateEmailRequest {
  const env = environmentFromRuntime(ctx.env);
  if (data.create === true && env.accountRegistration !== "open") {
    incrementCounter("rejectedActions");
    logger.info(formatOpsLog("authentication_failure", { reason: "registration_disabled", environment: env.name }));
    throw new Error("registration_disabled");
  }
  return data;
}

export function beforeAuthenticateDevice(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  _nk: nkruntime.Nakama,
  data: nkruntime.AuthenticateDeviceRequest,
): nkruntime.AuthenticateDeviceRequest {
  const env = environmentFromRuntime(ctx.env);
  if (!env.deviceAuthEnabled) {
    incrementCounter("rejectedActions");
    logger.info(formatOpsLog("authentication_failure", { reason: "device_auth_disabled", environment: env.name }));
    throw new Error("device_auth_disabled");
  }
  return data;
}

export function envForcedMaintenance(_env: EnvironmentConfig, runtimeEnv?: { [key: string]: string }): boolean {
  return parseBoolEnv(runtimeEnv !== undefined ? runtimeEnv["VIBECODE_MAINTENANCE"] : undefined, false);
}
