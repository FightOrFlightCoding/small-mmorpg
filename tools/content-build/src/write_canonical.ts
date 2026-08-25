import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { canonicalDocuments } from "./canonical_documents";

function defaultRoot(): string {
  return resolve(__dirname, "..", "..", "..", "..");
}

export function writeCanonicalSource(root: string = defaultRoot()): string[] {
  const sourceDir = join(root, "content", "source");
  mkdirSync(sourceDir, { recursive: true });
  const docs = canonicalDocuments();
  const written: string[] = [];
  for (let i = 0; i < docs.length; i++) {
    const id = String(docs[i]["id"]);
    const fileName = id + ".json";
    writeFileSync(join(sourceDir, fileName), JSON.stringify(docs[i], null, 2) + "\n", "utf8");
    written.push(fileName);
  }
  written.sort();
  return written;
}

if (require.main === module) {
  const files = writeCanonicalSource();
  process.stdout.write("wrote=" + String(files.length) + "\n");
}
