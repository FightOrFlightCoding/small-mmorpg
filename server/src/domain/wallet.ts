export const WALLET_CURRENCY_GOLD = "gold";

export function publicWallet(gold: number): { [key: string]: unknown } {
  return { gold: gold < 0 ? 0 : gold };
}

export function goldFromWallet(wallet: { [key: string]: number } | undefined): number {
  if (wallet === undefined) {
    return 0;
  }
  const value = wallet[WALLET_CURRENCY_GOLD];
  if (typeof value !== "number" || !isFinite(value) || value < 0) {
    return 0;
  }
  return value;
}
