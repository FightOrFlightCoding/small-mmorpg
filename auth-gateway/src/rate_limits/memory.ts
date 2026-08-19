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
  readonly ip = new MemoryRateLimiter(60_000, 30);
  readonly emailHash = new MemoryRateLimiter(10 * 60_000, 5);
}
