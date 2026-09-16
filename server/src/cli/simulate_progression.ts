import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { content } from "../generated/content";
import { catalogFromContent } from "../domain/stats";
import {
  CERT_FIGHT_DURATION_SEC,
  SECTION_12_TARGETS,
  formatHumanReport,
  formatJsonResult,
  simulateProgressionFight,
  type SimulationResult,
} from "../domain/progression_simulator";

function readArg(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index === -1 || index + 1 >= argv.length) {
    return undefined;
  }
  return argv[index + 1];
}

function hasFlag(argv: string[], name: string): boolean {
  return argv.indexOf(name) >= 0;
}

function usage(): never {
  throw new Error(
    "usage: simulate_progression [--mode analytic|seeded] [--branch id] [--duration sec] [--seed n] [--trace] [--json] [--out path]",
  );
}

function main(argv: string[]): void {
  if (hasFlag(argv, "--help")) {
    usage();
  }
  const modeRaw = readArg(argv, "--mode");
  const mode = modeRaw === "seeded" ? "seeded" : "analytic";
  const branch = readArg(argv, "--branch");
  const durationRaw = readArg(argv, "--duration");
  const duration = durationRaw !== undefined ? Number(durationRaw) : CERT_FIGHT_DURATION_SEC;
  const seedRaw = readArg(argv, "--seed");
  const seed = seedRaw !== undefined ? Number(seedRaw) : 1;
  const trace = hasFlag(argv, "--trace");
  const json = hasFlag(argv, "--json");
  const out = readArg(argv, "--out");
  const catalog = catalogFromContent(content);
  const bundle = { abilities: content.abilities, autoAttacks: content.autoAttacks };
  const branchIds = branch !== undefined && branch.length > 0 ? [branch] : Object.keys(SECTION_12_TARGETS);
  const results: SimulationResult[] = [];
  for (let i = 0; i < branchIds.length; i++) {
    results.push(
      simulateProgressionFight({
        catalog: catalog,
        content: bundle,
        branchId: branchIds[i],
        mode: mode,
        durationSec: duration,
        seed: seed,
        trace: trace,
      }),
    );
    if (branchIds[i] === "branch.mystic.charms") {
      results.push(
        simulateProgressionFight({
          catalog: catalog,
          content: bundle,
          branchId: branchIds[i],
          mode: mode,
          durationSec: duration,
          seed: seed,
          trace: trace,
          partyHeal: true,
        }),
      );
    }
  }
  const body = json ? formatJsonResult(results) : formatHumanReport(results);
  if (out !== undefined && out.length > 0) {
    writeFileSync(resolve(out), body, "utf8");
  }
  process.stdout.write(body);
  if (!body.endsWith("\n")) {
    process.stdout.write("\n");
  }
}

try {
  main(process.argv.slice(2));
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(message + "\n");
  process.exitCode = 1;
}
