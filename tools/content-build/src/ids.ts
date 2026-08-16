export const CONTENT_ID_PATTERN = /^[a-z]+(\.[a-z0-9_]+)+$/;

export const ALLOWED_EQUIP_SLOTS = ["main_hand"] as const;

export type EquipSlot = (typeof ALLOWED_EQUIP_SLOTS)[number];

export const KIND_PREFIX: Record<string, string> = {
  player: "player",
  item: "item",
  npc: "npc",
  enemy: "enemy",
  quest: "quest",
  zone: "zone",
  class: "test.class",
  attribute: "test.attribute",
  resource: "test.resource",
  derived_stat: "test.stat",
  level_curve: "test.curve",
  class_progression: "test.progression",
};

export function isContentId(value: string): boolean {
  return CONTENT_ID_PATTERN.test(value);
}

export function isAllowedEquipSlot(value: string): value is EquipSlot {
  return (ALLOWED_EQUIP_SLOTS as readonly string[]).indexOf(value) !== -1;
}
