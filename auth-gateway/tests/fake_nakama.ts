import { createChallengeRecord } from "../src/challenges/state";
import { MemoryChallengeStore } from "../src/challenges/state";
import type { AuthChallengePurpose } from "../src/challenges/types";
import type { GatewayRpcResult, NakamaAuthResult, NakamaBridge } from "../src/nakama/client";

export class FakeNakama implements NakamaBridge {
  healthy = true;
  readonly users = new Map<string, { password: string; userId: string; token: string }>();
  readonly profiles = new Map<string, { hmac: string; userId: string; verifiedAt: number }>();
  readonly challenges = new MemoryChallengeStore();

  async health(): Promise<boolean> {
    return this.healthy;
  }

  async authenticateEmail(email: string, password: string, create: boolean): Promise<NakamaAuthResult> {
    const existing = this.users.get(email);
    if (create) {
      if (existing !== undefined) {
        return { ok: false, status: 409, userId: "", token: "", refreshToken: "", message: "User account already exists." };
      }
      const userId = "user-" + String(this.users.size + 1);
      const token = "token-" + userId;
      this.users.set(email, { password: password, userId: userId, token: token });
      return { ok: true, status: 200, userId: userId, token: token, refreshToken: "refresh-" + userId, message: "" };
    }
    if (existing === undefined) {
      return { ok: false, status: 404, userId: "", token: "", refreshToken: "", message: "User account not found." };
    }
    if (existing.password !== password) {
      return { ok: false, status: 401, userId: "", token: "", refreshToken: "", message: "Invalid credentials." };
    }
    return { ok: true, status: 200, userId: existing.userId, token: existing.token, refreshToken: "refresh-" + existing.userId, message: "" };
  }

  async getAccount(token: string): Promise<{ ok: boolean; userId: string; email: string }> {
    const entries = Array.from(this.users.entries());
    for (let i = 0; i < entries.length; i++) {
      if (entries[i][1].token === token) {
        return { ok: true, userId: entries[i][1].userId, email: entries[i][0] };
      }
    }
    return { ok: false, userId: "", email: "" };
  }

  async rpc(op: string, fields: { [key: string]: unknown }, requestId: string, nowMs: number): Promise<GatewayRpcResult> {
    if (op === "put_email_index") {
      const userId = String(fields.user_id);
      const hmac = String(fields.hmac);
      const existing = this.profiles.get(userId);
      this.profiles.set(userId, { hmac: hmac, userId: userId, verifiedAt: existing !== undefined ? existing.verifiedAt : 0 });
      return { ok: true, status: 200, data: { ok: true, userId: userId }, message: "" };
    }
    if (op === "lookup_email") {
      const hmac = String(fields.hmac);
      const hits: string[] = [];
      this.profiles.forEach((profile) => {
        if (profile.hmac === hmac) {
          hits.push(profile.userId);
        }
      });
      if (hits.length === 1) {
        return { ok: true, status: 200, data: { ok: true, decision: { ok: true, userId: hits[0] } }, message: "" };
      }
      return { ok: true, status: 200, data: { ok: false, decision: { ok: false, reason: hits.length === 0 ? "missing" : "multiple" } }, message: "" };
    }
    if (op === "mark_verified") {
      const userId = String(fields.user_id);
      const existing = this.profiles.get(userId);
      if (existing === undefined) {
        return { ok: false, status: 400, data: { ok: false }, message: "profile_missing" };
      }
      this.profiles.set(userId, { hmac: existing.hmac, userId: existing.userId, verifiedAt: nowMs });
      return { ok: true, status: 200, data: { ok: true, verifiedAt: nowMs }, message: "" };
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
      });
      this.challenges.put(record);
      return { ok: true, status: 200, data: { ok: true, challenge_id: record.challenge_id, expires_at: record.expires_at }, message: "" };
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
          this.users.set(entries[i][0], { password: password, userId: entries[i][1].userId, token: entries[i][1].token });
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
          this.users.set(newEmail, { password: password, userId: entries[i][1].userId, token: entries[i][1].token });
        }
      }
      return { ok: true, status: 200, data: { ok: true, userId: userId, email: newEmail }, message: "" };
    }
    if (op === "delete_account") {
      const userId = String(fields.user_id);
      let email = "";
      const entries = Array.from(this.users.entries());
      for (let i = 0; i < entries.length; i++) {
        if (entries[i][1].userId === userId) {
          email = entries[i][0];
          this.users.delete(entries[i][0]);
        }
      }
      return { ok: true, status: 200, data: { ok: true, recorded: true, email: email }, message: "" };
    }
    return { ok: true, status: 200, data: { ok: true, op: op }, message: "" };
  }
}
