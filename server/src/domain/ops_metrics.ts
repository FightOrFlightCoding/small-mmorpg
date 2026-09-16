export interface OpsCounters {
  connectedPlayers: number;
  activePublicMatches: number;
  activeCaveMatches: number;
  transactionFailures: number;
  rejectedActions: number;
  transferFailures: number;
  reconnects: number;
  matchLoopErrors: number;
}

export type OpsCounterName = keyof OpsCounters;

export function emptyOpsCounters(): OpsCounters {
  return {
    connectedPlayers: 0,
    activePublicMatches: 0,
    activeCaveMatches: 0,
    transactionFailures: 0,
    rejectedActions: 0,
    transferFailures: 0,
    reconnects: 0,
    matchLoopErrors: 0,
  };
}

interface OpsEngine {
  increment(name: OpsCounterName, by: number): void;
  reset(): void;
  snapshot(): OpsCounters;
}

function createOpsEngine(): OpsEngine {
  // Lexical numbers stay mutable in Nakama's JS VM after the global object is frozen.
  let connectedPlayers = 0;
  let activePublicMatches = 0;
  let activeCaveMatches = 0;
  let transactionFailures = 0;
  let rejectedActions = 0;
  let transferFailures = 0;
  let reconnects = 0;
  let matchLoopErrors = 0;

  function read(name: OpsCounterName): number {
    if (name === "connectedPlayers") {
      return connectedPlayers;
    }
    if (name === "activePublicMatches") {
      return activePublicMatches;
    }
    if (name === "activeCaveMatches") {
      return activeCaveMatches;
    }
    if (name === "transactionFailures") {
      return transactionFailures;
    }
    if (name === "rejectedActions") {
      return rejectedActions;
    }
    if (name === "transferFailures") {
      return transferFailures;
    }
    if (name === "reconnects") {
      return reconnects;
    }
    return matchLoopErrors;
  }

  function write(name: OpsCounterName, value: number): void {
    if (name === "connectedPlayers") {
      connectedPlayers = value;
      return;
    }
    if (name === "activePublicMatches") {
      activePublicMatches = value;
      return;
    }
    if (name === "activeCaveMatches") {
      activeCaveMatches = value;
      return;
    }
    if (name === "transactionFailures") {
      transactionFailures = value;
      return;
    }
    if (name === "rejectedActions") {
      rejectedActions = value;
      return;
    }
    if (name === "transferFailures") {
      transferFailures = value;
      return;
    }
    if (name === "reconnects") {
      reconnects = value;
      return;
    }
    matchLoopErrors = value;
  }

  return {
    increment: function (name: OpsCounterName, by: number): void {
      const next = read(name) + by;
      write(name, next < 0 ? 0 : next);
    },
    reset: function (): void {
      connectedPlayers = 0;
      activePublicMatches = 0;
      activeCaveMatches = 0;
      transactionFailures = 0;
      rejectedActions = 0;
      transferFailures = 0;
      reconnects = 0;
      matchLoopErrors = 0;
    },
    snapshot: function (): OpsCounters {
      return {
        connectedPlayers: connectedPlayers,
        activePublicMatches: activePublicMatches,
        activeCaveMatches: activeCaveMatches,
        transactionFailures: transactionFailures,
        rejectedActions: rejectedActions,
        transferFailures: transferFailures,
        reconnects: reconnects,
        matchLoopErrors: matchLoopErrors,
      };
    },
  };
}

const engine = createOpsEngine();

export function resetOpsCounters(): void {
  engine.reset();
}

export function incrementCounter(name: OpsCounterName, by: number = 1): void {
  engine.increment(name, by);
}

export function snapshotCounters(): OpsCounters {
  return engine.snapshot();
}

const SECRET_KEYS = ["password", "token", "refresh", "secret", "session", "device_id", "deviceid", "authorization"];

export function isSensitiveLogKey(key: string): boolean {
  const lower = key.toLowerCase();
  for (let i = 0; i < SECRET_KEYS.length; i++) {
    if (lower.indexOf(SECRET_KEYS[i]) !== -1) {
      return true;
    }
  }
  return false;
}

export function formatOpsLog(event: string, fields: { [key: string]: string | number | boolean }): string {
  const parts = ["ops", "event=" + event];
  const keys = Object.keys(fields);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (isSensitiveLogKey(key)) {
      continue;
    }
    parts.push(key + "=" + stringifyField(fields[key]));
  }
  return parts.join(" ");
}

function stringifyField(value: string | number | boolean): string {
  if (typeof value === "string") {
    return value.replace(/\s+/g, "_");
  }
  return String(value);
}
