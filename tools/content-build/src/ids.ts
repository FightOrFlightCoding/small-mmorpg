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
  equipment_slot: "slot",
  ability: "test.ability",
  stat_definition: "stat",
  branch_definition: "branch",
  progression_timeline: "timeline",
  auto_attack_definition: "ability",
  effect_definition: "effect",
  talent_tree: "tree",
  talent_node: "talent",
  reference_build: "build",
  enemy_scaling_profile: "enemy.scaling",
  xp_reward: "xp.reward",
  equipment_modifier_category: "mod.stat",
  ai_profile: "test.ai",
  loot_table: "loot",
  spawn: "spawn",
  vendor: "vendor",
};

export function isContentId(value: string): boolean {
  return CONTENT_ID_PATTERN.test(value);
}

export function isAllowedEquipSlot(value: string, slotTags: readonly string[] = []): boolean {
  if (slotTags.length > 0) {
    return slotTags.indexOf(value) !== -1;
  }
  return (ALLOWED_EQUIP_SLOTS as readonly string[]).indexOf(value) !== -1;
}

export function prefixMatches(kind: string, id: string, prefix: string | undefined): boolean {
  if (!prefix) {
    return false;
  }
  if (id.indexOf(prefix + ".") === 0) {
    return true;
  }
  if (kind === "enemy" && id.indexOf("test.enemy.") === 0) {
    return true;
  }
  if (kind === "class" && id.indexOf("class.") === 0) {
    return true;
  }
  if (kind === "class_progression" && id.indexOf("progression.") === 0) {
    return true;
  }
  if (kind === "ability" && id.indexOf("ability.") === 0) {
    return true;
  }
  if (kind === "level_curve" && id.indexOf("curve.") === 0) {
    return true;
  }
  if (kind === "resource" && id.indexOf("resource.") === 0) {
    return true;
  }
  return kind === "zone" && id.indexOf("test.zone.") === 0;
}
