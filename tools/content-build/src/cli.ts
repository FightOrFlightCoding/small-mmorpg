import { resolve } from "node:path";
import { generateContent } from "./generate";

function readArg(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index === -1 || index + 1 >= argv.length) {
    return undefined;
  }
  return argv[index + 1];
}

function defaultRoot(): string {
  return resolve(__dirname, "..", "..", "..", "..");
}

function main(): void {
  const argv = process.argv.slice(2);
  const rootArg = readArg(argv, "--root") ?? defaultRoot();
  const bundle = generateContent({
    root: resolve(rootArg),
    sourceDir: readArg(argv, "--source"),
    schemaDir: readArg(argv, "--schemas"),
    serverOut: readArg(argv, "--server-out"),
    clientOut: readArg(argv, "--client-out"),
  });
  process.stdout.write("content_hash=" + bundle.contentHash + "\n");
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : "content_build_failed";
  process.stderr.write(message + "\n");
  process.exitCode = 1;
}

