import { consumeSessionRate, authRateKey } from "../domain/rate_limit";
import { environmentFromRuntime, parseBoolEnv, type EnvironmentConfig } from "../domain/environment";
import { formatOpsLog, incrementCounter } from "../domain/ops_metrics";
import { throwRpcFailure } from "../domain/rpc_error";

export function beforeAuthenticateEmail(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  _nk: nkruntime.Nakama,
  data: nkruntime.AuthenticateEmailRequest,
): nkruntime.AuthenticateEmailRequest {
  const env = environmentFromRuntime(ctx.env);
  const email =
    data.account !== undefined && typeof data.account.email === "string" ? data.account.email : "";
  if (!consumeSessionRate("auth", authRateKey("email", email), Date.now())) {
    incrementCounter("rejectedActions");
    logger.info(formatOpsLog("authentication_failure", { reason: "rate_limited", environment: env.name }));
    throwRpcFailure("rate_limited");
  }
  if (data.create === true && env.accountRegistration !== "open") {
    incrementCounter("rejectedActions");
    logger.info(formatOpsLog("authentication_failure", { reason: "registration_disabled", environment: env.name }));
    throwRpcFailure("registration_disabled");
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
  const deviceId = data.account !== undefined && typeof data.account.id === "string" ? data.account.id : "";
  if (!consumeSessionRate("auth", authRateKey("device", deviceId), Date.now())) {
    incrementCounter("rejectedActions");
    logger.info(formatOpsLog("authentication_failure", { reason: "rate_limited", environment: env.name }));
    throwRpcFailure("rate_limited");
  }
  if (!env.deviceAuthEnabled) {
    incrementCounter("rejectedActions");
    logger.info(formatOpsLog("authentication_failure", { reason: "device_auth_disabled", environment: env.name }));
    throwRpcFailure("device_auth_disabled");
  }
  return data;
}

export function envForcedMaintenance(_env: EnvironmentConfig, runtimeEnv?: { [key: string]: string }): boolean {
  return parseBoolEnv(runtimeEnv !== undefined ? runtimeEnv["VIBECODE_MAINTENANCE"] : undefined, false);
}
