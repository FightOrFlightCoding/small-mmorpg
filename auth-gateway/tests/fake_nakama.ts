import { createChallengeRecord } from "../src/challenges/state";
import { MemoryChallengeStore } from "../src/challenges/state";
import type { AuthChallengePurpose } from "../src/challenges/types";
import type { GatewayRpcResult, NakamaAuthResult, NakamaBridge } from "../src/nakama/client";

interface FakeUser {
  password: string;
  userId: string;
  username: string;
  token: string;
  refreshToken: string;
  disableTime: number;
}

interface FakeProfile {
  hmac: string;
  userId: string;
  verifiedAt: number;
  status: string;
  createdAt: number;
  acceptedTermsVersion: string;
  acceptedPrivacyVersion: string;
  acceptedAt: number;
}

interface FakeSession {
  userId: string;
  token: string;
  refreshToken: string;
  revoked: boolean;
}

function jwt(userId: string, username: string, nowMs: number, jti: string): string {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ uid: userId, usn: username, iat: Math.floor(nowMs / 1000), jti: jti }),
  ).toString("base64url");
  return header + "." + payload + ".sig";
}

export class FakeNakama implements NakamaBridge {
  healthy = true;
  createCalls = 0;
  readonly users = new Map<string, FakeUser>();
  readonly profiles = new Map<string, FakeProfile>();
  readonly challenges = new MemoryChallengeStore();
  readonly sessions: FakeSession[] = [];
  usernames = new Set<string>();
  nowMs = () => Date.now();
  private tokenSeq = 0;

  async health(): Promise<boolean> {
    return this.healthy;
  }

  async authenticateEmail(email: string, password: string, create: boolean, username?: string): Promise<NakamaAuthResult> {
    const existing = this.users.get(email);
    if (create) {
      this.createCalls += 1;
      if (existing !== undefined) {
        return fail(409, "User account already exists.");
      }
      const chosen = username !== undefined && username.length > 0 ? username : "u" + String(this.users.size + 1);
      if (this.usernames.has(chosen)) {
        return fail(409, "Username is already in use.");
      }
      const userId = "user-" + String(this.users.size + 1);
      const token = this.nextToken(userId, chosen);
      const refreshToken = "refresh-" + userId + "-" + String(this.sessions.length + 1);
      this.usernames.add(chosen);
      const user: FakeUser = {
        password: password,
        userId: userId,
        username: chosen,
        token: token,
        refreshToken: refreshToken,
        disableTime: 0,
      };
      this.users.set(email, user);
      this.sessions.push({ userId: userId, token: token, refreshToken: refreshToken, revoked: false });
      return ok(user);
    }
    if (existing === undefined) {
      return fail(404, "User account not found.");
    }
    if (existing.password !== password) {
      return fail(401, "Invalid credentials.");
    }
    if (existing.disableTime > 0) {
      return fail(401, "User account is disabled.");
    }
    const token = this.nextToken(existing.userId, existing.username);
    const refreshToken = "refresh-" + existing.userId + "-" + String(this.sessions.length + 1);
    existing.token = token;
    existing.refreshToken = refreshToken;
    this.sessions.push({ userId: existing.userId, token: token, refreshToken: refreshToken, revoked: false });
    return ok(existing);
  }

  async refreshSession(refreshToken: string): Promise<NakamaAuthResult> {
    const session = this.sessions.find((entry) => entry.refreshToken === refreshToken);
    if (session === undefined || session.revoked) {
      return fail(401, "Refresh token is invalid or has expired.");
    }
    const user = this.userById(session.userId);
    if (user === undefined) {
      return fail(401, "Refresh token is invalid or has expired.");
    }
    session.revoked = true;
    const token = this.nextToken(user.userId, user.username);
    const nextRefresh = "refresh-" + user.userId + "-" + String(this.sessions.length + 1);
    user.token = token;
    user.refreshToken = nextRefresh;
    this.sessions.push({ userId: user.userId, token: token, refreshToken: nextRefresh, revoked: false });
    return ok(user);
  }

  async logout(accessToken: string, refreshToken: string): Promise<{ ok: boolean }> {
    for (let i = 0; i < this.sessions.length; i++) {
      if (this.sessions[i].token === accessToken || this.sessions[i].refreshToken === refreshToken) {
        this.sessions[i].revoked = true;
      }
    }
    return { ok: true };
  }

  async logoutAll(accessToken: string): Promise<{ ok: boolean }> {
    const session = this.sessions.find((entry) => entry.token === accessToken);
    if (session === undefined) {
      return { ok: false };
    }
    for (let i = 0; i < this.sessions.length; i++) {
      if (this.sessions[i].userId === session.userId) {
        this.sessions[i].revoked = true;
      }
    }
    return { ok: true };
  }

  async getAccount(token: string): Promise<{ ok: boolean; userId: string; email: string; username: string; disableTime: number }> {
    const session = this.sessions.find((entry) => entry.token === token && !entry.revoked);
    if (session === undefined) {
      return { ok: false, userId: "", email: "", username: "", disableTime: 0 };
    }
    const user = this.userById(session.userId);
    const email = this.emailByUserId(session.userId);
    if (user === undefined) {
      return { ok: false, userId: "", email: "", username: "", disableTime: 0 };
    }
    return { ok: true, userId: user.userId, email: email, username: user.username, disableTime: user.disableTime };
  }

  async rpc(op: string, fields: { [key: string]: unknown }, requestId: string, nowMs: number): Promise<GatewayRpcResult> {
    if (op === "put_email_index") {
      const userId = String(fields.user_id);
      const hmac = String(fields.hmac);
      const existing = this.profiles.get(userId);
      const profile: FakeProfile = {
        hmac: hmac,
        userId: userId,
        verifiedAt: existing !== undefined ? existing.verifiedAt : 0,
        status: existing !== undefined ? existing.status : "PENDING_VERIFICATION",
        createdAt: existing !== undefined ? existing.createdAt : typeof fields.created_at === "number" ? fields.created_at : nowMs,
        acceptedTermsVersion:
          existing !== undefined
            ? existing.acceptedTermsVersion
            : typeof fields.terms_version === "string"
              ? fields.terms_version
              : "",
        acceptedPrivacyVersion:
          existing !== undefined
            ? existing.acceptedPrivacyVersion
            : typeof fields.privacy_version === "string"
              ? fields.privacy_version
              : "",
        acceptedAt: existing !== undefined ? existing.acceptedAt : typeof fields.accepted_at === "number" ? fields.accepted_at : nowMs,
      };
      this.profiles.set(userId, profile);
      return { ok: true, status: 200, data: { ok: true, userId: userId, status: profile.status, createdAt: profile.createdAt }, message: "" };
    }
    if (op === "lookup_email") {
      const hmac = String(fields.hmac);
      const hits: FakeProfile[] = [];
      this.profiles.forEach((profile) => {
        if (profile.hmac === hmac) {
          hits.push(profile);
        }
      });
      if (hits.length === 1) {
        return {
          ok: true,
          status: 200,
          data: {
            ok: true,
            decision: { ok: true, userId: hits[0].userId },
            profile: { userId: hits[0].userId, status: hits[0].status, verifiedAt: hits[0].verifiedAt, createdAt: hits[0].createdAt },
          },
          message: "",
        };
      }
      return {
        ok: true,
        status: 200,
        data: { ok: false, decision: { ok: false, reason: hits.length === 0 ? "missing" : "multiple" }, profile: null },
        message: "",
      };
    }
    if (op === "get_profile") {
      const profile = this.profiles.get(String(fields.user_id));
      if (profile === undefined) {
        return { ok: true, status: 200, data: { ok: false, reason: "missing" }, message: "" };
      }
      const user = this.userById(profile.userId);
      return {
        ok: true,
        status: 200,
        data: {
          ok: true,
          userId: profile.userId,
          status: profile.status,
          verifiedAt: profile.verifiedAt,
          createdAt: profile.createdAt,
          disableTime: user !== undefined ? user.disableTime : 0,
        },
        message: "",
      };
    }
    if (op === "mark_verified") {
      const userId = String(fields.user_id);
      const existing = this.profiles.get(userId);
      if (existing === undefined) {
        return { ok: false, status: 400, data: { ok: false }, message: "profile_missing" };
      }
      const verifiedAt = existing.verifiedAt > 0 ? existing.verifiedAt : nowMs;
      this.profiles.set(userId, { ...existing, verifiedAt: verifiedAt, status: "ACTIVE" });
      const email = this.emailByUserId(userId);
      return { ok: true, status: 200, data: { ok: true, verifiedAt: verifiedAt, status: "ACTIVE", email: email }, message: "" };
    }
    if (op === "purge_unverified") {
      const userId = String(fields.user_id !== undefined ? fields.user_id : "");
      const hmac = String(fields.hmac !== undefined ? fields.hmac : "");
      let target = userId;
      if (target.length === 0 && hmac.length > 0) {
        this.profiles.forEach((profile) => {
          if (profile.hmac === hmac) {
            target = profile.userId;
          }
        });
      }
      const profile = this.profiles.get(target);
      if (profile === undefined) {
        return { ok: true, status: 200, data: { ok: true, purged: false, reason: "missing", idempotent: true }, message: "" };
      }
      const retention = typeof fields.retention_ms === "number" && fields.retention_ms > 0 ? fields.retention_ms : 7 * 24 * 60 * 60 * 1000;
      if (profile.status !== "PENDING_VERIFICATION" || profile.verifiedAt > 0 || nowMs - profile.createdAt < retention) {
        return { ok: true, status: 200, data: { ok: true, purged: false, reason: "retention", idempotent: true }, message: "" };
      }
      this.deleteUser(target);
      return { ok: true, status: 200, data: { ok: true, purged: true, userId: target, idempotent: false }, message: "" };
    }
    if (op === "challenge_put") {
      const record = createChallengeRecord({
        challengeId: String(fields.challenge_id),
        accountUserId: String(fields.account_user_id !== undefined ? fields.account_user_id : ""),
        emailLookupHash: String(fields.hmac),
        purpose: fields.purpose as AuthChallengePurpose,
        secretHash: String(fields.secret_hash),
        requestId: requestId,
        nowMs: nowMs,
        ttlMs: typeof fields.ttl_ms === "number" && fields.ttl_ms > 0 ? fields.ttl_ms : undefined,
      });
      this.challenges.put(record);
      return { ok: true, status: 200, data: { ok: true, challenge_id: record.challenge_id, expires_at: record.expires_at }, message: "" };
    }
    if (op === "challenge_find") {
      const hmac = String(fields.hmac);
      const purpose = String(fields.purpose);
      const records = Array.from(this.challenges.records.values()).filter(
        (record) => record.email_lookup_hash === hmac && record.purpose === purpose && record.consumed_at === 0 && record.invalidated_at === 0 && record.expires_at > nowMs,
      );
      if (records.length === 0) {
        return { ok: true, status: 200, data: { ok: false, challenge_id: "", expires_at: 0 }, message: "" };
      }
      return { ok: true, status: 200, data: { ok: true, challenge_id: records[0].challenge_id, expires_at: records[0].expires_at }, message: "" };
    }
    if (op === "challenge_consume") {
      const existing = this.challenges.get(String(fields.challenge_id));
      if (typeof fields.hmac === "string" && fields.hmac.length > 0 && existing !== null && existing.email_lookup_hash !== fields.hmac) {
        return { ok: true, status: 200, data: { ok: false, reason: "wrong_code" }, message: "" };
      }
      const result = this.challenges.consume(
        String(fields.challenge_id),
        String(fields.secret_hash),
        fields.purpose as AuthChallengePurpose,
        nowMs,
      );
      if (!result.ok) {
        return { ok: true, status: 200, data: { ok: false, reason: result.reason }, message: "" };
      }
      return {
        ok: true,
        status: 200,
        data: {
          ok: true,
          idempotent: result.idempotent,
          account_user_id: result.record.account_user_id,
          challenge_id: result.record.challenge_id,
        },
        message: "",
      };
    }
    if (op === "replace_password") {
      const userId = String(fields.user_id);
      const password = String(fields.password);
      let email = "";
      const entries = Array.from(this.users.entries());
      for (let i = 0; i < entries.length; i++) {
        if (entries[i][1].userId === userId) {
          email = entries[i][0];
          this.users.set(entries[i][0], { ...entries[i][1], password: password });
        }
      }
      return { ok: true, status: 200, data: { ok: true, userId: userId, email: email }, message: "" };
    }
    if (op === "replace_email") {
      const userId = String(fields.user_id);
      const password = String(fields.password);
      const newEmail = String(fields.new_email);
      const entries = Array.from(this.users.entries());
      for (let i = 0; i < entries.length; i++) {
        if (entries[i][1].userId === userId) {
          this.users.delete(entries[i][0]);
          this.users.set(newEmail, { ...entries[i][1], password: password });
        }
      }
      return { ok: true, status: 200, data: { ok: true, userId: userId, email: newEmail }, message: "" };
    }
    if (op === "delete_account") {
      const userId = String(fields.user_id);
      const email = this.emailByUserId(userId);
      this.deleteUser(userId);
      return { ok: true, status: 200, data: { ok: true, recorded: true, email: email }, message: "" };
    }
    return { ok: true, status: 200, data: { ok: true, op: op }, message: "" };
  }

  disable(email: string): void {
    const user = this.users.get(email);
    if (user !== undefined) {
      user.disableTime = this.nowMs();
    }
  }

  private nextToken(userId: string, username: string): string {
    this.tokenSeq += 1;
    return jwt(userId, username, this.nowMs(), String(this.tokenSeq));
  }

  private userById(userId: string): FakeUser | undefined {
    const entries = Array.from(this.users.values());
    for (let i = 0; i < entries.length; i++) {
      if (entries[i].userId === userId) {
        return entries[i];
      }
    }
    return undefined;
  }

  private emailByUserId(userId: string): string {
    const entries = Array.from(this.users.entries());
    for (let i = 0; i < entries.length; i++) {
      if (entries[i][1].userId === userId) {
        return entries[i][0];
      }
    }
    return "";
  }

  private deleteUser(userId: string): void {
    const email = this.emailByUserId(userId);
    if (email.length > 0) {
      const user = this.users.get(email);
      if (user !== undefined) {
        this.usernames.delete(user.username);
      }
      this.users.delete(email);
    }
    this.profiles.delete(userId);
    for (let i = 0; i < this.sessions.length; i++) {
      if (this.sessions[i].userId === userId) {
        this.sessions[i].revoked = true;
      }
    }
  }
}

function fail(status: number, message: string): NakamaAuthResult {
  return { ok: false, status: status, userId: "", username: "", token: "", refreshToken: "", message: message };
}

function ok(user: FakeUser): NakamaAuthResult {
  return {
    ok: true,
    status: 200,
    userId: user.userId,
    username: user.username,
    token: user.token,
    refreshToken: user.refreshToken,
    message: "",
  };
}
