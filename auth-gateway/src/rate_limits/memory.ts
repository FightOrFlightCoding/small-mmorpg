import { ACCOUNT_RATE_POLICIES, type AccountRateAction } from "./catalog";

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

interface Bucket {
  timestamps: number[];
}

export class MemoryRateLimiter {
  private readonly byKey: Map<string, Bucket> = new Map();

  constructor(
    private readonly windowMs: number,
    private readonly maxEvents: number,
  ) {}

  consume(key: string, nowMs: number): RateLimitResult {
    const existing = this.byKey.get(key);
    const bucket: Bucket = existing !== undefined ? existing : { timestamps: [] };
    const cutoff = nowMs - this.windowMs;
    bucket.timestamps = bucket.timestamps.filter((stamp) => stamp > cutoff);
    if (bucket.timestamps.length >= this.maxEvents) {
      const retryMs = bucket.timestamps[0] + this.windowMs - nowMs;
      this.byKey.set(key, bucket);
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(retryMs / 1000)) };
    }
    bucket.timestamps.push(nowMs);
    this.byKey.set(key, bucket);
    return { allowed: true, retryAfterSeconds: 0 };
  }
}

export class GatewayRateLimits {
  readonly ip = new MemoryRateLimiter(ACCOUNT_RATE_POLICIES.ip.windowMs, ACCOUNT_RATE_POLICIES.ip.maxEvents);
  readonly emailHash = new MemoryRateLimiter(
    ACCOUNT_RATE_POLICIES.registration.windowMs,
    ACCOUNT_RATE_POLICIES.registration.maxEvents,
  );
  readonly login = new MemoryRateLimiter(ACCOUNT_RATE_POLICIES.login.windowMs, ACCOUNT_RATE_POLICIES.login.maxEvents);
  readonly attempt = new MemoryRateLimiter(
    ACCOUNT_RATE_POLICIES.verification_attempt.windowMs,
    ACCOUNT_RATE_POLICIES.verification_attempt.maxEvents,
  );
  readonly refresh = new MemoryRateLimiter(
    ACCOUNT_RATE_POLICIES.session_refresh.windowMs,
    ACCOUNT_RATE_POLICIES.session_refresh.maxEvents,
  );
  readonly provider = new MemoryRateLimiter(
    ACCOUNT_RATE_POLICIES.provider.windowMs,
    ACCOUNT_RATE_POLICIES.provider.maxEvents,
  );

  consume(action: AccountRateAction, key: string, nowMs: number): RateLimitResult {
    const slot = action + ":" + key;
    if (action === "ip") {
      return this.ip.consume(slot, nowMs);
    }
    if (action === "login") {
      return this.login.consume(slot, nowMs);
    }
    if (action === "session_refresh") {
      return this.refresh.consume(slot, nowMs);
    }
    if (action === "provider") {
      return this.provider.consume(slot, nowMs);
    }
    if (
      action === "verification_attempt" ||
      action === "password_reset_attempt" ||
      action === "email_change_attempt" ||
      action === "account_deletion_attempt"
    ) {
      return this.attempt.consume(slot, nowMs);
    }
    return this.emailHash.consume(slot, nowMs);
  }
}
