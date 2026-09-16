/** Prompt 29 cave ownership. Domain tests leave the binder unset. */

export type CaveOwnershipReleaser = (partyId: string) => { released: boolean };

let releaser: CaveOwnershipReleaser | null = null;

export function bindCaveOwnershipReleaser(next: CaveOwnershipReleaser | null): void {
  releaser = next;
}

export function releaseCaveOwnershipForDisbandedParty(partyId: string): { released: boolean } {
  if (releaser === null) {
    return { released: false };
  }
  return releaser(partyId);
}
