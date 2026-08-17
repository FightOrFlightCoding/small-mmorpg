export interface PartyCreditEvent {
  eventId: string;
  enemyId: string;
  instanceId: string;
  contributors: string[];
}

export type PartyCreditSink = (event: PartyCreditEvent) => void;

export function noopPartyCredit(_event: PartyCreditEvent): void {}

export function partyCreditFromThreat(
  eventId: string,
  enemyId: string,
  instanceId: string,
  threatByPlayerId: { [userId: string]: number } | undefined,
  killerId: string,
): PartyCreditEvent {
  const contributors: string[] = [];
  const seen: { [id: string]: boolean } = {};
  if (killerId.length > 0) {
    contributors.push(killerId);
    seen[killerId] = true;
  }
  const threat = threatByPlayerId !== undefined ? threatByPlayerId : {};
  const ids = Object.keys(threat);
  ids.sort();
  for (let i = 0; i < ids.length; i++) {
    if (seen[ids[i]] === true) {
      continue;
    }
    if (threat[ids[i]] <= 0) {
      continue;
    }
    contributors.push(ids[i]);
    seen[ids[i]] = true;
  }
  return {
    eventId: eventId,
    enemyId: enemyId,
    instanceId: instanceId,
    contributors: contributors,
  };
}
