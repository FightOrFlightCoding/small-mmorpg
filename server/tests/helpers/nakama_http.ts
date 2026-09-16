const DEFAULT_HOST = "http://127.0.0.1:7350";
const DEFAULT_CONSOLE = "http://127.0.0.1:7351";
const DEFAULT_SERVER_KEY = "defaultkey";

export interface HttpJson {
  status: number;
  ok: boolean;
  body: unknown;
  text: string;
}

export interface SessionTokens {
  token: string;
  refresh_token: string;
  user_id?: string;
}

function basicAuth(serverKey: string): string {
  return "Basic " + Buffer.from(serverKey + ":").toString("base64");
}

function host(): string {
  return process.env.NAKAMA_HTTP !== undefined && process.env.NAKAMA_HTTP.length > 0 ? process.env.NAKAMA_HTTP : DEFAULT_HOST;
}

function consoleHost(): string {
  return process.env.NAKAMA_CONSOLE !== undefined && process.env.NAKAMA_CONSOLE.length > 0
    ? process.env.NAKAMA_CONSOLE
    : DEFAULT_CONSOLE;
}

function serverKey(): string {
  return process.env.NAKAMA_SERVER_KEY !== undefined && process.env.NAKAMA_SERVER_KEY.length > 0
    ? process.env.NAKAMA_SERVER_KEY
    : DEFAULT_SERVER_KEY;
}

export async function httpJson(
  method: string,
  url: string,
  headers: { [name: string]: string },
  body?: unknown,
): Promise<HttpJson> {
  const init: RequestInit = { method: method, headers: headers };
  if (body !== undefined) {
    init.body = typeof body === "string" ? body : JSON.stringify(body);
    if (headers["Content-Type"] === undefined) {
      headers["Content-Type"] = "application/json";
    }
  }
  const response = await fetch(url, init);
  const text = await response.text();
  let parsed: unknown = text;
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }
  }
  return { status: response.status, ok: response.ok, body: parsed, text: text };
}

export function errorMessage(body: unknown): string {
  if (body === null || typeof body !== "object") {
    return String(body);
  }
  const data = body as { message?: unknown; error?: unknown };
  if (typeof data.message === "string" && data.message.length > 0) {
    return data.message;
  }
  if (typeof data.error === "string" && data.error.length > 0) {
    return data.error;
  }
  return JSON.stringify(body);
}

export async function authenticateEmail(email: string, password: string, create: boolean, username?: string): Promise<HttpJson> {
  const payload: { [key: string]: string } = { email: email, password: password };
  if (username !== undefined && username.length > 0) {
    payload.username = username;
  }
  return httpJson(
    "POST",
    host() + "/v2/account/authenticate/email?create=" + String(create),
    { Authorization: basicAuth(serverKey()) },
    payload,
  );
}

export function sessionFromAuth(body: unknown): SessionTokens {
  const data = body as { token?: string; refresh_token?: string };
  if (typeof data.token !== "string" || typeof data.refresh_token !== "string") {
    throw new Error("authenticate response missing tokens: " + JSON.stringify(body));
  }
  return { token: data.token, refresh_token: data.refresh_token };
}

export function userIdFromToken(token: string): string {
  const parts = token.split(".");
  if (parts.length < 2) {
    throw new Error("malformed jwt");
  }
  const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as { uid?: string };
  if (typeof payload.uid !== "string") {
    throw new Error("jwt missing uid");
  }
  return payload.uid;
}

export async function linkEmail(token: string, email: string, password: string): Promise<HttpJson> {
  return httpJson("POST", host() + "/v2/account/link/email", { Authorization: "Bearer " + token }, {
    email: email,
    password: password,
  });
}

export async function unlinkEmail(token: string, email: string, password: string): Promise<HttpJson> {
  return httpJson("POST", host() + "/v2/account/unlink/email", { Authorization: "Bearer " + token }, {
    email: email,
    password: password,
  });
}

export async function linkDevice(token: string, deviceId: string): Promise<HttpJson> {
  return httpJson("POST", host() + "/v2/account/link/device", { Authorization: "Bearer " + token }, { id: deviceId });
}

export async function unlinkDevice(token: string, deviceId: string): Promise<HttpJson> {
  return httpJson("POST", host() + "/v2/account/unlink/device", { Authorization: "Bearer " + token }, { id: deviceId });
}

export async function sessionLogout(
  token: string,
  body: { token?: string; refresh_token?: string },
): Promise<HttpJson> {
  return httpJson("POST", host() + "/v2/session/logout", { Authorization: "Bearer " + token }, body);
}

export async function sessionRefresh(refreshToken: string): Promise<HttpJson> {
  return httpJson("POST", host() + "/v2/account/session/refresh", { Authorization: basicAuth(serverKey()) }, {
    token: refreshToken,
  });
}

export async function getAccount(token: string): Promise<HttpJson> {
  return httpJson("GET", host() + "/v2/account", { Authorization: "Bearer " + token });
}

export async function deleteOwnAccount(token: string): Promise<HttpJson> {
  return httpJson("DELETE", host() + "/v2/account", { Authorization: "Bearer " + token });
}

export async function rpcJson(token: string, id: string, payload: { [key: string]: unknown }): Promise<HttpJson> {
  const unwrapped = await httpJson("POST", host() + "/v2/rpc/" + id + "?unwrap=true", { Authorization: "Bearer " + token }, payload);
  if (unwrapped.status !== 404) {
    return unwrapped;
  }
  return httpJson("POST", host() + "/v2/rpc/" + id, { Authorization: "Bearer " + token }, { payload: JSON.stringify(payload) });
}

export async function consoleAuthenticate(): Promise<string> {
  const username = process.env.NAKAMA_CONSOLE_USERNAME !== undefined ? process.env.NAKAMA_CONSOLE_USERNAME : "admin";
  const password = process.env.NAKAMA_CONSOLE_PASSWORD !== undefined ? process.env.NAKAMA_CONSOLE_PASSWORD : "password";
  const response = await httpJson("POST", consoleHost() + "/v2/console/authenticate", {}, {
    username: username,
    password: password,
  });
  const body = response.body as { token?: string; session?: { token?: string } };
  if (typeof body.token === "string") {
    return body.token;
  }
  if (body.session !== undefined && typeof body.session.token === "string") {
    return body.session.token;
  }
  throw new Error("console authenticate failed: " + response.status + " " + response.text);
}

export async function consoleExport(consoleToken: string, userId: string): Promise<HttpJson> {
  return httpJson("GET", consoleHost() + "/v2/console/account/" + userId + "/export", {
    Authorization: "Bearer " + consoleToken,
  });
}

export async function consoleDeleteAccount(consoleToken: string, userId: string, record: boolean): Promise<HttpJson> {
  return httpJson(
    "DELETE",
    consoleHost() + "/v2/console/account/" + userId + "?record=" + String(record),
    { Authorization: "Bearer " + consoleToken },
  );
}

export function uniqueId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export function uniqueEmail(label: string): string {
  return "acct01." + label + "." + uniqueId() + "@example.com";
}

export function uniquePassword(label: string): string {
  return "compat horse " + label + " " + uniqueId();
}

export function uniqueDeviceId(label: string): string {
  const id = "acct01-device-" + label + "-" + uniqueId();
  return id.length >= 10 ? id : id + "xxxxxxxxxx".slice(0, 10 - id.length);
}

export function uniqueCharacterName(): string {
  const letters = uniqueId().replace(/[^a-z]/g, "") + "zzzzzz";
  return "Ac" + letters.slice(0, 10);
}

export async function sleep(ms: number): Promise<void> {
  await new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}
