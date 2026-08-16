export interface ClassItemStack {
  itemId: string;
  quantity: number;
}

export interface ClassDefinition {
  id: string;
  startingEquipment: ClassItemStack[];
  legacyMigrationDefault?: boolean;
}

export function sortedClassIds(classes: { [id: string]: ClassDefinition }): string[] {
  const ids = Object.keys(classes);
  ids.sort();
  return ids;
}

export function classExists(classes: { [id: string]: ClassDefinition }, classId: string): boolean {
  return classes[classId] !== undefined;
}

export function migrationDefaultClassId(classes: { [id: string]: ClassDefinition }): string {
  const ids = sortedClassIds(classes);
  for (let i = 0; i < ids.length; i++) {
    if (classes[ids[i]].legacyMigrationDefault === true) {
      return ids[i];
    }
  }
  if (ids.length === 0) {
    throw new Error("invalid_class");
  }
  return ids[0];
}

export function startingEquipmentForClass(classes: { [id: string]: ClassDefinition }, classId: string): ClassItemStack[] {
  const def = classes[classId];
  if (def === undefined) {
    return [];
  }
  const stacks: ClassItemStack[] = [];
  for (let i = 0; i < def.startingEquipment.length; i++) {
    stacks.push({ itemId: def.startingEquipment[i].itemId, quantity: def.startingEquipment[i].quantity });
  }
  return stacks;
}

export function classDefinitionsFromContent(classes: {
  [id: string]: {
    id: string;
    startingEquipment: ReadonlyArray<{ itemId: string; quantity: number }>;
    legacyMigrationDefault?: boolean;
  };
}): { [id: string]: ClassDefinition } {
  const mapped: { [id: string]: ClassDefinition } = {};
  const ids = Object.keys(classes);
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const def = classes[id];
    const startingEquipment: ClassItemStack[] = [];
    for (let e = 0; e < def.startingEquipment.length; e++) {
      startingEquipment.push({ itemId: def.startingEquipment[e].itemId, quantity: def.startingEquipment[e].quantity });
    }
    const mappedDef: ClassDefinition = { id: def.id, startingEquipment: startingEquipment };
    if (def.legacyMigrationDefault === true) {
      mappedDef.legacyMigrationDefault = true;
    }
    mapped[id] = mappedDef;
  }
  return mapped;
}
