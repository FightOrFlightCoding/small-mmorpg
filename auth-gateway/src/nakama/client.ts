import type { GatewayConfig } from "../config/env";
import type { GatewayLogger } from "../logging/redact";
import { signRpcEnvelope } from "./assertion";

export interface NakamaAuthResult {
  ok: boolean;
  status: number;
  userId: string;
  token: string;
  refreshToken: string;
  message: string;
}

export interface GatewayRpcResult {
  ok: boolean;
  status: number;
  data: { [key: string]: unknown };
  message: string;
}

export interface NakamaBridge {
  health(): Promise<boolean>;
  authenticateEmail(email: string, password: string, create: boolean): Promise<NakamaAuthResult>;
  getAccount(token: string): Promise<{ ok: boolean; userId: string; email: string }>;
  rpc(op: string, fields: { [key: string]: unknown }, requestId: string, nowMs: number): Promise<GatewayRpcResult>;
}

export class NakamaGatewayClient implements NakamaBridge {
  constructor(
    private readonly config: GatewayConfig,
    private readonly logger: GatewayLogger,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async health(): Promise<boolean> {
    try {
      const response = await this.fetchImpl(this.config.nakamaHttpUrl + "/v2/rpc/vibecode_health?http_key=" + encodeURIComponent(this.config.nakamaHttpKey) + "&unwrap=true", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!response.ok) {
        return false;
      }
      const body = (await response.json()) as { ok?: boolean };
      return body.ok === true;
    } catch {
      return false;
    }
  }

  async authenticateEmail(email: string, password: string, create: boolean): Promise<NakamaAuthResult> {
    const response = await this.fetchImpl(
      this.config.nakamaHttpUrl + "/v2/account/authenticate/email?create=" + String(create),
      {
        method: "POST",
        headers: {
          Authorization: "Basic " + Buffer.from(this.config.nakamaServerKey + ":").toString("base64"),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: email, password: password }),
      },
    );
    const text = await response.text();
    let parsed: { token?: string; refresh_token?: string; message?: string; error?: string } = {};
    try {
      parsed = JSON.parse(text) as typeof parsed;
    } catch {
      parsed = { message: text };
    }
    if (!response.ok || typeof parsed.token !== "string") {
      return {
        ok: false,
        status: response.status,
        userId: "",
        token: "",
        refreshToken: "",
        message: typeof parsed.message === "string" ? parsed.message : typeof parsed.error === "string" ? parsed.error : text,
      };
    }
    return {
      ok: true,
      status: response.status,
      userId: userIdFromToken(parsed.token),
      token: parsed.token,
      refreshToken: typeof parsed.refresh_token === "string" ? parsed.refresh_token : "",
      message: "",
    };
  }

  async getAccount(token: string): Promise<{ ok: boolean; userId: string; email: string }> {
    const response = await this.fetchImpl(this.config.nakamaHttpUrl + "/v2/account", {
      method: "GET",
      headers: { Authorization: "Bearer " + token },
    });
    if (!response.ok) {
      return { ok: false, userId: "", email: "" };
    }
    const body = (await response.json()) as { user?: { id?: string }; email?: string };
    return {
      ok: true,
      userId: body.user !== undefined && typeof body.user.id === "string" ? body.user.id : "",
      email: typeof body.email === "string" ? body.email : "",
    };
  }

  async rpc(op: string, fields: { [key: string]: unknown }, requestId: string, nowMs: number): Promise<GatewayRpcResult> {
    const body: { [key: string]: unknown } = { op: op };
    const keys = Object.keys(fields).sort();
    for (let i = 0; i < keys.length; i++) {
      if (fields[keys[i]] !== undefined) {
        body[keys[i]] = fields[keys[i]];
      }
    }
    const signed = signRpcEnvelope(this.config.gatewayHmacSecret, op, body, requestId, nowMs);
    try {
      const response = await this.fetchImpl(
        this.config.nakamaHttpUrl + "/v2/rpc/auth_gateway?http_key=" + encodeURIComponent(this.config.nakamaHttpKey) + "&unwrap=true",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(signed.envelope),
        },
      );
      const text = await response.text();
      let data: { [key: string]: unknown } = {};
      try {
        data = JSON.parse(text) as { [key: string]: unknown };
      } catch {
        data = { raw: text };
      }
      if (typeof data.payload === "string") {
        try {
          data = JSON.parse(data.payload) as { [key: string]: unknown };
        } catch {
          data = { raw: data.payload };
        }
      }
      return { ok: response.ok, status: response.status, data: data, message: String(data.message !== undefined ? data.message : "") };
    } catch (error) {
      this.logger.error("nakama_rpc_failed", { op: op, request_id: requestId });
      return { ok: false, status: 0, data: {}, message: error instanceof Error ? error.message : "rpc_failed" };
    }
  }
}

function userIdFromToken(token: string): string {
  const parts = token.split(".");
  if (parts.length < 2) {
    return "";
  }
  const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as { uid?: string };
  return typeof payload.uid === "string" ? payload.uid : "";
}
