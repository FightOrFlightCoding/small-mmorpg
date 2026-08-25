export type AccountRateAction =
  | "ip"
  | "registration"
  | "verification_request"
  | "verification_attempt"
  | "login"
  | "password_reset_request"
  | "password_reset_attempt"
  | "email_change_request"
  | "email_change_attempt"
  | "account_deletion_request"
  | "account_deletion_attempt"
  | "session_refresh"
  | "provider";

export interface AccountRatePolicy {
  action: AccountRateAction;
  windowMs: number;
  maxEvents: number;
  key: "ip" | "email_hash" | "user" | "challenge" | "provider";
  retryGuidance: string;
}

function policy(
  action: AccountRateAction,
  windowMs: number,
  maxEvents: number,
  key: AccountRatePolicy["key"],
): AccountRatePolicy {
  return {
    action: action,
    windowMs: windowMs,
    maxEvents: maxEvents,
    key: key,
    retryGuidance: "Too many attempts. Wait and try again.",
  };
}

/** Named public-auth limits. None permanently lock an account from failed public requests. */
export const ACCOUNT_RATE_POLICIES: { [action in AccountRateAction]: AccountRatePolicy } = {
  ip: policy("ip", 60_000, 30, "ip"),
  registration: policy("registration", 10 * 60_000, 5, "email_hash"),
  verification_request: policy("verification_request", 10 * 60_000, 5, "email_hash"),
  verification_attempt: policy("verification_attempt", 10 * 60_000, 20, "challenge"),
  login: policy("login", 60_000, 20, "email_hash"),
  password_reset_request: policy("password_reset_request", 10 * 60_000, 5, "email_hash"),
  password_reset_attempt: policy("password_reset_attempt", 10 * 60_000, 20, "challenge"),
  email_change_request: policy("email_change_request", 10 * 60_000, 5, "user"),
  email_change_attempt: policy("email_change_attempt", 10 * 60_000, 20, "challenge"),
  account_deletion_request: policy("account_deletion_request", 10 * 60_000, 5, "user"),
  account_deletion_attempt: policy("account_deletion_attempt", 10 * 60_000, 20, "challenge"),
  session_refresh: policy("session_refresh", 60_000, 30, "ip"),
  provider: policy("provider", 60_000, 20, "provider"),
};

export const ACCOUNT_RATE_ACTIONS: AccountRateAction[] = [
  "ip",
  "registration",
  "verification_request",
  "verification_attempt",
  "login",
  "password_reset_request",
  "password_reset_attempt",
  "email_change_request",
  "email_change_attempt",
  "account_deletion_request",
  "account_deletion_attempt",
  "session_refresh",
  "provider",
];
