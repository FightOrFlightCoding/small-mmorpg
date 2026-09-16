import {
  AUTH_RATE_MAX,
  AUTH_RATE_WINDOW_MS,
  CHARACTER_CREATE_RATE_MAX,
  CHARACTER_CREATE_RATE_WINDOW_MS,
  CHARACTER_NAME_RATE_MAX,
  CHARACTER_NAME_RATE_WINDOW_MS,
  CHARACTER_SELECT_RATE_MAX,
  CHARACTER_SELECT_RATE_WINDOW_MS,
} from "./rate_limit";

/** Named lifecycle limits. Gateway HTTP numbers match auth-gateway/src/rate_limits/catalog.ts. None permanently lock an account. */
export const ACCOUNT_RATE_CATALOG = [
  {
    action: "registration",
    windowMs: 10 * 60_000,
    maxEvents: 5,
    scope: "auth-gateway per email hash",
  },
  {
    action: "verification_request",
    windowMs: 10 * 60_000,
    maxEvents: 5,
    scope: "auth-gateway per email hash; generic 200 when unknown",
  },
  {
    action: "verification_attempt",
    windowMs: 10 * 60_000,
    maxEvents: 20,
    scope: "auth-gateway per challenge id",
  },
  {
    action: "login",
    windowMs: 60_000,
    maxEvents: 20,
    scope: "auth-gateway per email hash; plus IP 30/60s",
  },
  {
    action: "password_reset_request",
    windowMs: 10 * 60_000,
    maxEvents: 5,
    scope: "auth-gateway per email hash; same 429 copy for missing and existing",
  },
  {
    action: "password_reset_attempt",
    windowMs: 10 * 60_000,
    maxEvents: 20,
    scope: "auth-gateway per challenge id",
  },
  {
    action: "email_change_request",
    windowMs: 10 * 60_000,
    maxEvents: 5,
    scope: "auth-gateway per user id",
  },
  {
    action: "email_change_attempt",
    windowMs: 10 * 60_000,
    maxEvents: 20,
    scope: "auth-gateway per challenge id",
  },
  {
    action: "account_deletion_request",
    windowMs: 10 * 60_000,
    maxEvents: 5,
    scope: "auth-gateway per user id",
  },
  {
    action: "account_deletion_attempt",
    windowMs: 10 * 60_000,
    maxEvents: 20,
    scope: "auth-gateway per user id",
  },
  {
    action: "session_refresh",
    windowMs: 60_000,
    maxEvents: 30,
    scope: "auth-gateway per IP",
  },
  {
    action: "session_auth",
    windowMs: AUTH_RATE_WINDOW_MS,
    maxEvents: AUTH_RATE_MAX,
    scope: "Nakama authenticate before-hook per identity",
  },
  {
    action: "character_create",
    windowMs: CHARACTER_CREATE_RATE_WINDOW_MS,
    maxEvents: CHARACTER_CREATE_RATE_MAX,
    scope: "character_create RPC per user",
  },
  {
    action: "character_name",
    windowMs: CHARACTER_NAME_RATE_WINDOW_MS,
    maxEvents: CHARACTER_NAME_RATE_MAX,
    scope: "character_name_available RPC per user",
  },
  {
    action: "character_select",
    windowMs: CHARACTER_SELECT_RATE_WINDOW_MS,
    maxEvents: CHARACTER_SELECT_RATE_MAX,
    scope: "character_select RPC per user",
  },
] as const;

export const REQUIRED_ACCOUNT_RATE_ACTIONS = [
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
  "character_create",
  "character_name",
  "character_select",
  "session_refresh",
] as const;
