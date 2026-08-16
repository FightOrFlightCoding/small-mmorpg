import { distance } from "./movement";

export { distance };

export interface InteractionNpc {
  id: string;
  npcId: string;
  x: number;
  y: number;
}

export interface InteractionInput {
  playerHealth: number;
  playerX: number;
  playerY: number;
  targetId: string;
  npcs: ReadonlyArray<InteractionNpc>;
  interactionRange: number;
}

export interface InteractionDecision {
  ok: boolean;
  code: string;
}

export function findNpc(npcs: ReadonlyArray<InteractionNpc>, targetId: string): InteractionNpc | null {
  for (let i = 0; i < npcs.length; i++) {
    const npc = npcs[i];
    if (npc.id === targetId || npc.npcId === targetId) {
      return npc;
    }
  }
  return null;
}

export function resolveInteraction(input: InteractionInput): InteractionDecision {
  if (input.playerHealth <= 0) {
    return { ok: false, code: "player_dead" };
  }
  const npc = findNpc(input.npcs, input.targetId);
  if (npc === null) {
    return { ok: false, code: "invalid_target" };
  }
  if (distance(input.playerX, input.playerY, npc.x, npc.y) > input.interactionRange) {
    return { ok: false, code: "out_of_range" };
  }
  return { ok: true, code: "ok" };
}
