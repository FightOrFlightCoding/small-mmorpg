import {
  GROUND_PUBLIC_AVAILABLE,
  type GroundItem,
} from "./ground_item";

export const MANUAL_QA_ACCOUNT_EMAIL = "pedrobh91@gmail.com";
export const MANUAL_QA_CHARACTER_NAME = "Ada";
export const MANUAL_QA_GOLD_BALANCE = 5000;
export const MANUAL_QA_GROUND_ITEM_ID = "item.test_potion";
export const MANUAL_QA_GROUND_ENTITY_ID = "ground.qa.potion";
// Spawn is cell (31, 46) at (2016, 2976). Place the potion on the same south road,
// two tiles north, so the camera center shows it above the hotbar and bag column.
export const MANUAL_QA_GROUND_X = 2016;
export const MANUAL_QA_GROUND_Y = 2816;
export const MANUAL_QA_GROUND_TTL_SEC = 60 * 60 * 24;

export function manualQaGoldDelta(email: string, characterName: string, currentGold: number): number {
  if (!manualQaAccountMatches(email, characterName)) {
    return 0;
  }
  if (!(currentGold < MANUAL_QA_GOLD_BALANCE)) {
    return 0;
  }
  return MANUAL_QA_GOLD_BALANCE - currentGold;
}

export function manualQaAccountMatches(email: string, characterName: string): boolean {
  const normalized = email.trim().toLowerCase();
  if (normalized === MANUAL_QA_ACCOUNT_EMAIL) {
    return true;
  }
  return normalized.length === 0 && characterName.trim() === MANUAL_QA_CHARACTER_NAME;
}

export function seedManualQaGroundItems(input: {
  itemsById: { [id: string]: { id?: string; rarity?: string } };
  tickRate: number;
}): GroundItem[] {
  const definition = input.itemsById[MANUAL_QA_GROUND_ITEM_ID];
  if (definition === undefined) {
    return [];
  }
  const rarity = definition.rarity !== undefined && definition.rarity.length > 0 ? definition.rarity : "rarity.common";
  return [
    {
      groundEntityId: MANUAL_QA_GROUND_ENTITY_ID,
      itemInstanceId: "inst.qa.ground.potion",
      itemId: MANUAL_QA_GROUND_ITEM_ID,
      quantity: 1,
      x: MANUAL_QA_GROUND_X,
      y: MANUAL_QA_GROUND_Y,
      createdByCharacterId: "world.qa",
      createdAtTick: 0,
      expiresAtTick: Math.round(MANUAL_QA_GROUND_TTL_SEC * input.tickRate),
      state: GROUND_PUBLIC_AVAILABLE,
      revision: 1,
      rarity: rarity,
    },
  ];
}
