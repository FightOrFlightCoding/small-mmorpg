import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { issue, type ContentIssue } from "./issues";
import type { SourceDocument } from "./types";

export function loadSourceDocuments(sourceDir: string): { documents: SourceDocument[]; issues: ContentIssue[] } {
  const documents: SourceDocument[] = [];
  const issues: ContentIssue[] = [];
  const names = readdirSync(sourceDir).sort();
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    const fullPath = join(sourceDir, name);
    if (!statSync(fullPath).isFile() || !name.endsWith(".json")) {
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(fullPath, "utf8"));
    } catch {
      issues.push(issue("malformed_json:" + name));
      continue;
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      issues.push(issue("malformed_json:" + name));
      continue;
    }
    documents.push({ fileName: basename(name), data: parsed as Record<string, unknown> });
  }
  if (documents.length === 0 && issues.length === 0) {
    issues.push(issue("no_source_documents"));
  }
  return { documents, issues };
}
