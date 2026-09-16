import type { SourceDocument } from "./types";

export const AUTHORING_TYPES = [
  "class",
  "attribute",
  "resource",
  "level_curve",
  "ability",
  "effect",
  "item",
  "equipment_slot",
  "enemy",
  "ai_profile",
  "spawn",
  "loot_table",
  "npc",
  "dialogue_reference",
  "quest",
  "vendor",
  "inn_service",
  "zone",
  "cave_template",
  "asset_manifest_entry",
] as const;

export type AuthoringType = (typeof AUTHORING_TYPES)[number];

export interface ClientFileWrite {
  relativePath: string;
  contents: string;
  mergeJson?: boolean;
}

export interface SourcePatch {
  id: string;
  apply: (data: Record<string, unknown>) => Record<string, unknown>;
}

export interface TemplateResult {
  documents: SourceDocument[];
  clientFiles: ClientFileWrite[];
  patches: SourcePatch[];
}

const DEFAULT_IDS: { [type in AuthoringType]: string } = {
  class: "test.class.starter_template",
  attribute: "test.attribute.starter_template",
  resource: "test.resource.starter_template",
  level_curve: "test.curve.starter_template",
  ability: "test.ability.starter_template",
  effect: "test.ability.starter_effect",
  item: "item.starter_template",
  equipment_slot: "slot.starter_template",
  enemy: "test.enemy.starter_template",
  ai_profile: "test.ai.starter_template",
  spawn: "spawn.starter.starter_template",
  loot_table: "loot.starter_template",
  npc: "npc.starter_template",
  dialogue_reference: "dialogue.npc.starter_template",
  quest: "quest.starter_template",
  vendor: "vendor.starter_template",
  inn_service: "npc.starter_inn",
  zone: "test.zone.starter_template",
  cave_template: "test.zone.starter_cave",
  asset_manifest_entry: "visual_set.starter_template",
};

export function defaultIdFor(type: AuthoringType): string {
  return DEFAULT_IDS[type];
}

export function isAuthoringType(value: string): value is AuthoringType {
  return AUTHORING_TYPES.indexOf(value as AuthoringType) !== -1;
}

export function starterTemplate(type: AuthoringType, id: string): TemplateResult {
  switch (type) {
    case "class":
      return docs([classDoc(id)]);
    case "attribute":
      return docs([attributeDoc(id)]);
    case "resource":
      return docs([resourceDoc(id)]);
    case "level_curve":
      return docs([levelCurveDoc(id)]);
    case "ability":
      return docs([abilityDoc(id, "direct_damage")]);
    case "effect":
      return docs([abilityDoc(id, "timed_stat_modifier")]);
    case "item":
      return docs([itemDoc(id)]);
    case "equipment_slot":
      return docs([slotDoc(id)]);
    case "enemy":
      return enemyPack(id);
    case "ai_profile":
      return docs([aiDoc(id)]);
    case "spawn":
      return docs([spawnDoc(id, "zone.starter", "enemy.green_slime", 200, 200)]);
    case "loot_table":
      return docs([lootDoc(id)]);
    case "npc":
      return npcPack(id, "zone.starter", 720, 640, [{ type: "dialogue" }]);
    case "dialogue_reference":
      return dialogueOnly(id);
    case "quest":
      return questPack(id);
    case "vendor":
      return vendorPack(id);
    case "inn_service":
      return npcPack(id, "zone.starter", 760, 640, [
        { type: "dialogue" },
        { type: "inn", goldCost: 1, healToFull: true, restoreResources: true, bindRespawn: true },
        { type: "healer", goldCost: 0, healToFull: true, restoreResources: true },
      ]);
    case "zone":
      return zonePack(id, false);
    case "cave_template":
      return zonePack(id, true);
    case "asset_manifest_entry":
      return assetEntry(id);
    default:
      throw new Error("unknown_type:" + type);
  }
}

function docs(documents: Record<string, unknown>[]): TemplateResult {
  return {
    documents: documents.map(toDoc),
    clientFiles: [],
    patches: [],
  };
}

function toDoc(data: Record<string, unknown>): SourceDocument {
  return { fileName: String(data["id"]) + ".json", data: data };
}

function classDoc(id: string): Record<string, unknown> {
  return {
    id: id,
    kind: "class",
    displayName: "Starter Class",
    shortDescription: "Provisional starter class.",
    displayNameKey: id + ".display_name",
    shortDescriptionKey: id + ".short_description",
    longDescriptionKey: id + ".long_description",
    roleSummaryKey: id + ".role_summary",
    placeholderIconAssetId: "visual.class_warrior",
    placeholderVisualSetId: "visual.class_warrior",
    placeholderThemeKey: "theme.class.warrior",
    visualAssetSetId: "visual.class_vanguard",
    legacyMigrationDefault: false,
    progressionId: "test.progression.vanguard",
    levelCurveId: "test.curve.standard",
    startingAttributes: { "test.attribute.might": 1 },
    startingResources: { "test.resource.health": 100 },
    attributePointPolicy: { pointsAtCreate: 0 },
    skillPointPolicy: { pointsAtCreate: 0 },
    startingEquipment: [{ itemId: "item.training_sword", quantity: 1 }],
    startingAbilities: ["test.ability.basic_melee"],
    allowedEquipmentTags: ["main_hand", "off_hand", "head", "chest", "legs", "feet"],
    tags: ["starter"],
    schemaVersion: 1,
  };
}

function attributeDoc(id: string): Record<string, unknown> {
  return { id: id, kind: "attribute", displayName: "Starter Attribute", schemaVersion: 1 };
}

function resourceDoc(id: string): Record<string, unknown> {
  return { id: id, kind: "resource", displayName: "Starter Resource", role: "generic", schemaVersion: 1 };
}

function levelCurveDoc(id: string): Record<string, unknown> {
  return {
    id: id,
    kind: "level_curve",
    maxLevel: 3,
    xpRequired: [10, 20],
    attributePointsPerLevel: [1, 1],
    skillPointsPerLevel: [1, 1],
    automaticUnlocks: [],
    schemaVersion: 1,
  };
}

function abilityDoc(id: string, effectType: "direct_damage" | "timed_stat_modifier"): Record<string, unknown> {
  const effect =
    effectType === "timed_stat_modifier"
      ? {
          id: "buff",
          type: "timed_stat_modifier",
          source: "caster",
          target: "self",
          magnitude: { kind: "constant", value: 1 },
          duration: 3,
          tickInterval: 0,
          stackPolicy: "replace",
          maxStacks: 1,
          refreshPolicy: "refresh",
          removalReason: "expired",
          tags: ["buff"],
          statChannel: "attack",
        }
      : {
          id: "hit",
          type: "direct_damage",
          source: "caster",
          target: "primary",
          magnitude: { kind: "constant", value: 1 },
          duration: 0,
          tickInterval: 0,
          stackPolicy: "replace",
          maxStacks: 1,
          refreshPolicy: "refresh",
          removalReason: "expired",
          tags: ["physical"],
        };
  return {
    id: id,
    kind: "ability",
    displayName: "Starter Ability",
    displayNameKey: "ability.starter_template.name",
    descriptionKey: "ability.starter_template.desc",
    targetMode: effectType === "timed_stat_modifier" ? "self" : "entity",
    relationFilter: effectType === "timed_stat_modifier" ? "self" : "hostile",
    range: effectType === "timed_stat_modifier" ? 0 : 40,
    minimumRange: 0,
    areaShape: "none",
    areaRadius: 0,
    castTime: 0,
    channelTime: 0,
    globalCooldown: 0.7,
    individualCooldown: 1,
    resourceCosts: [],
    movementInterruptsCast: false,
    damageInterruptsCast: false,
    requiredLevel: 1,
    requiredClassTags: [],
    prerequisites: [],
    effects: [effect],
    animationAssetId: "visual.ability_melee",
    iconAssetId: "visual.ability_melee_icon",
    soundAssetId: "visual.ability_melee_sound",
    skillPointCost: 0,
    maxRank: 1,
    schemaVersion: 1,
  };
}

function itemDoc(id: string): Record<string, unknown> {
  return {
    id: id,
    kind: "item",
    displayName: "Starter Item",
    displayNameKey: "item.starter_template.name",
    descriptionKey: "item.starter_template.desc",
    visualId: "visual.item_pebble",
    iconAssetId: "visual.item_pebble",
    worldAssetId: "visual.item_pebble",
    category: "miscellaneous",
    maxStack: 20,
    tradeable: true,
    destroyable: true,
    uniquePolicy: "none",
    classRequirements: [],
    levelRequirement: 0,
    attackBonus: 0,
    statModifiers: [],
    sellValue: 1,
    schemaVersion: 1,
  };
}

function slotDoc(id: string): Record<string, unknown> {
  const tag = id.indexOf("slot.") === 0 ? id.slice("slot.".length) : "starter_template";
  return {
    id: id,
    kind: "equipment_slot",
    tag: tag,
    displayName: "Starter Slot",
    allowedCategories: ["armor"],
    schemaVersion: 1,
  };
}

function aiDoc(id: string): Record<string, unknown> {
  return {
    id: id,
    kind: "ai_profile",
    displayName: "Starter AI",
    style: "melee",
    acquireMode: "nearest",
    damageThreatWeight: 1,
    healThreatWeight: 0,
    generateHealThreat: false,
    threatSwitchRatio: 1.1,
    preferredRange: 0,
    kiteRange: 0,
    resetHealthOnReturn: false,
    resetThreatOnReturn: true,
    schemaVersion: 1,
  };
}

function lootDoc(id: string): Record<string, unknown> {
  return {
    id: id,
    kind: "loot_table",
    displayName: "Starter Loot",
    ownershipPolicy: "ground_free",
    entries: [
      {
        itemDefinitionId: "item.test_pebble",
        minimumQuantity: 1,
        maximumQuantity: 1,
        chance: 1,
        guaranteed: true,
      },
    ],
    schemaVersion: 1,
  };
}

function spawnDoc(id: string, zoneId: string, enemyId: string, x: number, y: number): Record<string, unknown> {
  return {
    id: id,
    kind: "spawn",
    zoneId: zoneId,
    enemyId: enemyId,
    x: x,
    y: y,
    spawnCount: 1,
    respawnDelay: 10,
    activationPolicy: "manual",
    groupId: "group.starter_template",
    schemaVersion: 1,
  };
}

function enemyPack(id: string): TemplateResult {
  const lootId = "loot." + slugFrom(id);
  const spawnId = "spawn.starter." + slugFrom(id);
  return {
    documents: [
      toDoc({
        id: id,
        kind: "enemy",
        displayName: "Starter Enemy",
        displayNameKey: "enemy.starter_template.name",
        visualId: "visual.enemy_test_melee",
        level: 1,
        maxHealth: 8,
        damage: 1,
        moveSpeed: 30,
        aggroRadius: 40,
        attackRange: 24,
        attackCooldown: 1.5,
        leashRadius: 80,
        respawnDelay: 10,
        abilityLoadout: [],
        aiProfileId: "test.ai.melee",
        xpReward: 1,
        lootTableId: lootId,
        collisionProfileId: "collision.enemy_default",
        tags: ["starter"],
        schemaVersion: 1,
      }),
      toDoc(lootDoc(lootId)),
      toDoc(spawnDoc(spawnId, "zone.starter", id, 200, 200)),
    ],
    clientFiles: [],
    patches: [],
  };
}

function npcPack(
  id: string,
  zoneId: string,
  x: number,
  y: number,
  services: unknown[],
): TemplateResult {
  const dialogueId = "dialogue." + id;
  return {
    documents: [
      toDoc({
        id: id,
        kind: "npc",
        displayName: "Starter NPC",
        displayNameKey: id + ".name",
        visualId: "visual.npc_herald",
        zoneId: zoneId,
        position: { x: x, y: y },
        interactionRange: 48,
        dialogueId: dialogueId,
        services: services,
        schemaVersion: 1,
      }),
    ],
    clientFiles: [
      {
        relativePath: "client/content/dialogue/" + id + ".dialogue",
        contents: "~ start\nNPC: Starter dialogue. Replace this line.\n=> END\n",
      },
      {
        relativePath: "client/content/dialogue_map.json",
        contents: JSON.stringify({ [dialogueId]: "res://content/dialogue/" + id + ".dialogue" }, null, 2) + "\n",
        mergeJson: true,
      },
    ],
    patches: zoneId === "zone.starter" ? [appendNpcPatch(id, x, y)] : [],
  };
}

function questPack(id: string): TemplateResult {
  const npcId = "npc." + slugFrom(id);
  const npc = npcPack(npcId, "zone.starter", 800, 640, [
    { type: "dialogue" },
    { type: "quest_offer", questIds: [id] },
    { type: "quest_turn_in", questIds: [id] },
  ]);
  return {
    documents: npc.documents.concat([
      toDoc({
        id: id,
        kind: "quest",
        displayName: "Starter Quest",
        category: "side",
        acceptNpcId: npcId,
        turnInNpcId: npcId,
        objectives: [{ type: "talk_to_npc", npcId: npcId, quantity: 1 }],
        consume: [],
        rewards: { gold: 1, xp: 1, items: [] },
        completeOnce: true,
        schemaVersion: 1,
      }),
    ]),
    clientFiles: npc.clientFiles,
    patches: npc.patches,
  };
}

function vendorPack(id: string): TemplateResult {
  const npcId = "npc." + slugFrom(id);
  const npc = npcPack(npcId, "zone.starter", 840, 640, [
    { type: "dialogue" },
    { type: "vendor", vendorId: id },
  ]);
  return {
    documents: npc.documents.concat([
      toDoc({
        id: id,
        kind: "vendor",
        displayName: "Starter Vendor",
        stock: [{ itemId: "item.test_pebble", buyPrice: 1, classRequirements: [], levelRequirement: 0 }],
        sellMultiplier: 0.5,
        schemaVersion: 1,
      }),
    ]),
    clientFiles: npc.clientFiles,
    patches: npc.patches,
  };
}

function zonePack(id: string, cave: boolean): TemplateResult {
  const slug = slugFrom(id);
  const npcId = "npc." + slug + "_keeper";
  const enemyId = "test.enemy." + slug;
  const lootId = "loot." + slug;
  const spawnId = "spawn." + slug + ".wildlife";
  const width = cave ? 640 : 1280;
  const height = cave ? 512 : 768;
  const npcX = cave ? 80 : 96;
  const npcY = cave ? 256 : 256;
  const enemyX = cave ? 480 : 640;
  const enemyY = cave ? 256 : 384;
  const dialogueId = "dialogue." + npcId;
  return {
    documents: [
      toDoc({
        id: id,
        kind: "zone",
        displayName: cave ? "Starter Cave" : "Starter Zone",
        visualId: cave ? "visual.zone_cave" : "visual.zone_starter",
        tileSize: 16,
        width: width,
        height: height,
        playerSpawn: { x: cave ? 96 : 96, y: 256 },
        npcs: [{ npcId: npcId, x: npcX, y: npcY }],
        enemies: [{ enemyId: enemyId, x: enemyX, y: enemyY, spawnId: spawnId }],
        walkableBounds: { x: 16, y: 16, width: width - 32, height: height - 32 },
        collisions: [
          { x: 0, y: 0, width: width, height: 16 },
          { x: 0, y: height - 16, width: width, height: 16 },
          { x: 0, y: 0, width: 16, height: height },
          { x: width - 16, y: 0, width: 16, height: height },
        ],
        schemaVersion: 1,
        developmentOnly: true,
      }),
      toDoc({
        id: npcId,
        kind: "npc",
        displayName: "Starter Keeper",
        displayNameKey: npcId + ".name",
        visualId: "visual.npc_cave_exit",
        zoneId: id,
        position: { x: npcX, y: npcY },
        interactionRange: 48,
        dialogueId: dialogueId,
        services: cave
          ? [{ type: "dialogue" }, { type: "cave_exit" }]
          : [{ type: "dialogue" }],
        schemaVersion: 1,
        developmentOnly: true,
      }),
      toDoc({
        id: enemyId,
        kind: "enemy",
        displayName: "Starter Wildlife",
        displayNameKey: enemyId + ".name",
        visualId: "visual.enemy_test_melee",
        level: 1,
        maxHealth: 8,
        damage: 1,
        moveSpeed: 30,
        aggroRadius: 40,
        attackRange: 24,
        attackCooldown: 1.5,
        leashRadius: 80,
        respawnDelay: 10,
        abilityLoadout: [],
        aiProfileId: "test.ai.melee",
        xpReward: 1,
        lootTableId: lootId,
        collisionProfileId: "collision.enemy_default",
        tags: ["starter"],
        schemaVersion: 1,
        developmentOnly: true,
      }),
      toDoc({ ...lootDoc(lootId), developmentOnly: true }),
      toDoc({ ...spawnDoc(spawnId, id, enemyId, enemyX, enemyY), activationPolicy: "always", developmentOnly: true }),
    ],
    clientFiles: [
      {
        relativePath: "client/content/dialogue/" + npcId + ".dialogue",
        contents: "~ start\nKeeper: Starter zone dialogue.\n=> END\n",
      },
      {
        relativePath: "client/content/dialogue_map.json",
        contents: JSON.stringify({ [dialogueId]: "res://content/dialogue/" + npcId + ".dialogue" }, null, 2) + "\n",
        mergeJson: true,
      },
    ],
    patches: [],
  };
}

function dialogueOnly(id: string): TemplateResult {
  const fileId = id.indexOf("dialogue.") === 0 ? id.slice("dialogue.".length) : id;
  return {
    documents: [],
    clientFiles: [
      {
        relativePath: "client/content/dialogue/" + fileId + ".dialogue",
        contents: "~ start\nNPC: Starter dialogue reference.\n=> END\n",
      },
      {
        relativePath: "client/content/dialogue_map.json",
        contents: JSON.stringify({ [id]: "res://content/dialogue/" + fileId + ".dialogue" }, null, 2) + "\n",
        mergeJson: true,
      },
    ],
    patches: [],
  };
}

function assetEntry(id: string): TemplateResult {
  const set = {
    [id]: {
      kind: "item",
      contentId: "item.starter_template",
      spriteVisualId: "visual.item_pebble",
      fallbackVisualId: "visual.item_pebble",
    },
  };
  return {
    documents: [],
    clientFiles: [
      {
        relativePath: "client/content/asset_manifest.json",
        contents: JSON.stringify({ sets: set }, null, 2) + "\n",
        mergeJson: true,
      },
    ],
    patches: [],
  };
}

function appendNpcPatch(npcId: string, x: number, y: number): SourcePatch {
  return {
    id: "zone.starter",
    apply: function (data: Record<string, unknown>): Record<string, unknown> {
      const npcs = Array.isArray(data["npcs"]) ? (data["npcs"] as Array<{ npcId: string; x: number; y: number }>) : [];
      const next = npcs.slice();
      let found = false;
      for (let i = 0; i < next.length; i++) {
        if (next[i].npcId === npcId) {
          found = true;
        }
      }
      if (!found) {
        next.push({ npcId: npcId, x: x, y: y });
      }
      return { ...data, npcs: next };
    },
  };
}

function slugFrom(id: string): string {
  const parts = id.split(".");
  return parts[parts.length - 1];
}
