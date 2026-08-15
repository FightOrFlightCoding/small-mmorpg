import { readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv2020, { type ErrorObject, type ValidateFunction } from "ajv/dist/2020";
import { issue, type ContentIssue } from "./issues";

const SCHEMA_FILES = ["common.json", "player.json", "item.json", "npc.json", "enemy.json", "quest.json", "zone.json"];

const KIND_SCHEMA: Record<string, string> = {
  player: "https://vibecode.local/content-schemas/player.json",
  item: "https://vibecode.local/content-schemas/item.json",
  npc: "https://vibecode.local/content-schemas/npc.json",
  enemy: "https://vibecode.local/content-schemas/enemy.json",
  quest: "https://vibecode.local/content-schemas/quest.json",
  zone: "https://vibecode.local/content-schemas/zone.json",
};

export function loadAjv(schemaDir: string): Ajv2020 {
  const ajv = new Ajv2020({ allErrors: true, strict: true, validateFormats: false });
  for (let i = 0; i < SCHEMA_FILES.length; i++) {
    const name = SCHEMA_FILES[i];
    const parsed = JSON.parse(readFileSync(join(schemaDir, name), "utf8")) as object;
    ajv.addSchema(parsed);
  }
  return ajv;
}

export function mapAjvErrors(errors: ErrorObject[] | null | undefined): ContentIssue[] {
  if (!errors || errors.length === 0) {
    return [issue("schema_invalid")];
  }
  const mapped: ContentIssue[] = [];
  for (let i = 0; i < errors.length; i++) {
    mapped.push(mapAjvError(errors[i]));
  }
  return mapped;
}

function mapAjvError(error: ErrorObject): ContentIssue {
  const field = fieldName(error.instancePath);
  if (error.keyword === "minimum" || error.keyword === "exclusiveMinimum" || error.keyword === "maximum") {
    if (field === "maxStack" || field === "quantity") {
      return issue("invalid_stack_size:" + field);
    }
    return issue("invalid_range:" + field);
  }
  if (error.keyword === "additionalProperties") {
    const extra = String(error.params["additionalProperty"] ?? "unknown");
    return issue("unknown_field:" + extra);
  }
  if (error.keyword === "required") {
    const missing = String(error.params["missingProperty"] ?? field);
    return issue("missing_field:" + missing);
  }
  return issue("schema_invalid:" + (field || error.keyword));
}

function fieldName(instancePath: string): string {
  const parts = instancePath.split("/").filter((part) => part.length > 0);
  return parts.length === 0 ? "" : parts[parts.length - 1];
}

export function validatorForKind(ajv: Ajv2020, kind: string): ValidateFunction | null {
  const schemaId = KIND_SCHEMA[kind];
  if (!schemaId) {
    return null;
  }
  const fn = ajv.getSchema(schemaId);
  return fn ?? null;
}
