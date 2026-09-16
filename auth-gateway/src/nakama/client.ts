import type { GatewayConfig } from "../config/env";
import type { GatewayLogger } from "../logging/redact";
import { signRpcEnvelope } from "./assertion";

export interface NakamaAuthResult {
  ok: boolean;
  status: number;
  userId: string;
  username: string;
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
  authenticateEmail(email: string, password: string, create: boolean, username?: string): Promise<NakamaAuthResult>;
  refreshSession(refreshToken: string): Promise<NakamaAuthResult>;
  logout(accessToken: string, refreshToken: string): Promise<{ ok: boolean }>;
  logoutAll(accessToken: string): Promise<{ ok: boolean }>;
  getAccount(token: string): Promise<{ ok: boolean; userId: string; email: string; username: string; disableTime: number }>;
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

  async authenticateEmail(email: string, password: string, create: boolean, username?: string): Promise<NakamaAuthResult> {
    const body: { [key: string]: unknown } = { email: email, password: password };
    if (username !== undefined && username.length > 0) {
      body.username = username;
    }
    const response = await this.fetchImpl(
      this.config.nakamaHttpUrl + "/v2/account/authenticate/email?create=" + String(create),
      {
        method: "POST",
        headers: {
          Authorization: "Basic " + Buffer.from(this.config.nakamaServerKey + ":").toString("base64"),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );
    return parseAuthResponse(response);
  }

  async refreshSession(refreshToken: string): Promise<NakamaAuthResult> {
    const response = await this.fetchImpl(this.config.nakamaHttpUrl + "/v2/account/session/refresh", {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(this.config.nakamaServerKey + ":").toString("base64"),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token: refreshToken }),
    });
    return parseAuthResponse(response);
  }

  async logout(accessToken: string, refreshToken: string): Promise<{ ok: boolean }> {
    const response = await this.fetchImpl(this.config.nakamaHttpUrl + "/v2/session/logout", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + accessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token: accessToken, refresh_token: refreshToken }),
    });
    return { ok: response.ok || response.status === 401 };
  }

  async logoutAll(accessToken: string): Promise<{ ok: boolean }> {
    const response = await this.fetchImpl(this.config.nakamaHttpUrl + "/v2/session/logout", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + accessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token: "", refresh_token: "" }),
    });
    return { ok: response.ok || response.status === 401 };
  }

  async getAccount(token: string): Promise<{ ok: boolean; userId: string; email: string; username: string; disableTime: number }> {
    const response = await this.fetchImpl(this.config.nakamaHttpUrl + "/v2/account", {
      method: "GET",
      headers: { Authorization: "Bearer " + token },
    });
    if (!response.ok) {
      return { ok: false, userId: "", email: "", username: "", disableTime: 0 };
    }
    const body = (await response.json()) as {
      user?: { id?: string; username?: string };
      email?: string;
      disable_time?: number;
    };
    return {
      ok: true,
      userId: body.user !== undefined && typeof body.user.id === "string" ? body.user.id : "",
      email: typeof body.email === "string" ? body.email : "",
      username: body.user !== undefined && typeof body.user.username === "string" ? body.user.username : "",
      disableTime: typeof body.disable_time === "number" ? body.disable_time : 0,
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

async function parseAuthResponse(response: Response): Promise<NakamaAuthResult> {
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
      username: "",
      token: "",
      refreshToken: "",
      message: typeof parsed.message === "string" ? parsed.message : typeof parsed.error === "string" ? parsed.error : text,
    };
  }
  return {
    ok: true,
    status: response.status,
    userId: userIdFromToken(parsed.token),
    username: usernameFromToken(parsed.token),
    token: parsed.token,
    refreshToken: typeof parsed.refresh_token === "string" ? parsed.refresh_token : "",
    message: "",
  };
}

function userIdFromToken(token: string): string {
  const payload = jwtPayload(token);
  return typeof payload.uid === "string" ? payload.uid : "";
}

function usernameFromToken(token: string): string {
  const payload = jwtPayload(token);
  return typeof payload.usn === "string" ? payload.usn : "";
}

function jwtPayload(token: string): { uid?: string; usn?: string; iat?: number } {
  const parts = token.split(".");
  if (parts.length < 2) {
    return {};
  }
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as { uid?: string; usn?: string; iat?: number };
  } catch {
    return {};
  }
}

export function accessTokenIssuedAt(token: string): number {
  const payload = jwtPayload(token);
  return typeof payload.iat === "number" ? payload.iat * 1000 : 0;
}
