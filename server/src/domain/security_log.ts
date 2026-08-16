export interface RejectedAction {
  userId: string;
  action: string;
  code: string;
  tick: number;
}

export function formatRejectedActionLog(entry: RejectedAction): string {
  return (
    "match_action rejected user_id=" +
    entry.userId +
    " action=" +
    entry.action +
    " reason=" +
    entry.code +
    " tick=" +
    String(entry.tick)
  );
}

export function isSafeRejectionLog(line: string): boolean {
  const lowered = line.toLowerCase();
  if (lowered.indexOf("token") !== -1) {
    return false;
  }
  if (lowered.indexOf("password") !== -1) {
    return false;
  }
  if (lowered.indexOf("device id") !== -1 || lowered.indexOf("deviceid") !== -1) {
    return false;
  }
  if (lowered.indexOf("authorization") !== -1) {
    return false;
  }
  return true;
}
