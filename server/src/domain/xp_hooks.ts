/** Trusted XP grants from server events. Amounts come from callers; this module does not invent enemy XP formulas. */

export interface TrustedXpGrant {
  characterId: string;
  amount: number;
  reasonType: string;
  reasonId: string;
  eventId: string;
}

export interface XpHookResult {
  ok: boolean;
  replay: boolean;
  applied: boolean;
  code: string;
}

export interface XpGrantSink {
  apply(userId: string, grant: TrustedXpGrant): XpHookResult;
}

export interface EnemyXpSource {
  id: string;
  enemyId: string;
  xpReward: number;
  deathCount: number;
}

export function killXpGrantFromEnemy(enemy: EnemyXpSource, characterId: string): TrustedXpGrant | null {
  if (enemy.xpReward <= 0) {
    return null;
  }
  return {
    characterId: characterId,
    amount: enemy.xpReward,
    reasonType: "kill",
    reasonId: enemy.enemyId,
    eventId: "kill:" + enemy.id + ":" + String(enemy.deathCount),
  };
}

export function questXpGrant(
  questId: string,
  amount: number,
  requestId: string,
  characterId: string,
): TrustedXpGrant | null {
  if (typeof amount !== "number" || !isFinite(amount) || amount <= 0) {
    return null;
  }
  return {
    characterId: characterId,
    amount: amount,
    reasonType: "quest",
    reasonId: questId,
    eventId: "quest:" + questId + ":" + requestId,
  };
}

export function applyServerXpGrant(
  sink: XpGrantSink,
  userId: string,
  grant: TrustedXpGrant | null,
): XpHookResult {
  if (grant === null) {
    return { ok: true, replay: false, applied: false, code: "skipped" };
  }
  if (userId.length === 0 || grant.eventId.length === 0 || grant.characterId.length === 0) {
    return { ok: false, replay: false, applied: false, code: "invalid_grant" };
  }
  return sink.apply(userId, grant);
}

export function memoryXpSink(): { sink: XpGrantSink; grants: TrustedXpGrant[] } {
  const seen: { [eventId: string]: boolean } = {};
  const grants: TrustedXpGrant[] = [];
  return {
    grants: grants,
    sink: {
      apply: function (_userId: string, grant: TrustedXpGrant): XpHookResult {
        if (seen[grant.eventId] === true) {
          return { ok: true, replay: true, applied: false, code: "ok" };
        }
        seen[grant.eventId] = true;
        grants.push({
          characterId: grant.characterId,
          amount: grant.amount,
          reasonType: grant.reasonType,
          reasonId: grant.reasonId,
          eventId: grant.eventId,
        });
        return { ok: true, replay: false, applied: true, code: "ok" };
      },
    },
  };
}
