export function listedStorageObjects(listed: unknown): nkruntime.StorageObject[] {
  if (listed === null || listed === undefined || typeof listed !== "object") {
    return [];
  }
  const data = listed as { objects?: { length?: number } };
  const raw = data.objects;
  if (raw === undefined || raw === null || typeof raw !== "object") {
    return [];
  }
  const len = typeof raw.length === "number" ? raw.length : 0;
  const objects: nkruntime.StorageObject[] = [];
  for (let i = 0; i < len; i++) {
    const row = (raw as { [index: number]: nkruntime.StorageObject })[i];
    if (row !== undefined) {
      objects.push(row);
    }
  }
  return objects;
}
