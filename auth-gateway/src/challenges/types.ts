export type AuthChallengePurpose =
  | "EMAIL_VERIFICATION"
  | "PASSWORD_RESET"
  | "EMAIL_CHANGE"
  | "ACCOUNT_DELETION";

export interface AuthChallengeRecord {
  challenge_id: string;
  account_user_id: string;
  email_lookup_hash: string;
  purpose: AuthChallengePurpose;
  secret_hash: string;
  created_at: number;
  expires_at: number;
  attempt_count: number;
  maximum_attempts: number;
  consumed_at: number;
  invalidated_at: number;
  request_id: string;
  schema_version: number;
}
