import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CERT_CAPACITY_TICKS,
  CERT_SOAK_AUTOMATED_TICKS,
  CERT_SOAK_CERTIFICATION_SEC,
  runCapacityScenario,
  runSoakScenario,
  soakCertificationTicks,
  type CapacityReport,
  type SoakReport,
} from "../domain/cert_load";

function readArg(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index === -1 || index + 1 >= argv.length) {
    return undefined;
  }
  return argv[index + 1];
}

function memoryNow(): { rss: number; heapUsed: number } {
  const usage = process.memoryUsage();
  return { rss: usage.rss, heapUsed: usage.heapUsed };
}

function attachMemory<T extends { memory: { rss: number; heapUsed: number; heapDelta: number } }>(
  report: T,
  before: { rss: number; heapUsed: number },
): T {
  const after = memoryNow();
  report.memory = {
    rss: after.rss,
    heapUsed: after.heapUsed,
    heapDelta: after.heapUsed - before.heapUsed,
  };
  return report;
}

function writeReport(path: string | undefined, report: CapacityReport | SoakReport): void {
  const body = JSON.stringify(report, null, 2);
  if (path !== undefined && path.length > 0) {
    writeFileSync(resolve(path), body, "utf8");
  }
  process.stdout.write(body + "\n");
}

function usage(): never {
  throw new Error(
    "usage: cert capacity [--ticks n] [--out path] | cert soak [--ticks n] [--duration-sec n] [--seed n] [--out path]",
  );
}

function main(argv: string[]): void {
  const command = argv[0];
  if (command !== "capacity" && command !== "soak") {
    usage();
  }
  const out = readArg(argv, "--out");
  const before = memoryNow();
  if (command === "capacity") {
    const ticksRaw = readArg(argv, "--ticks");
    const ticks = ticksRaw !== undefined ? Number(ticksRaw) : CERT_CAPACITY_TICKS;
    const report = attachMemory(runCapacityScenario(ticks), before);
    writeReport(out, report);
    if (!report.caveCleanupOk || report.ghostPresences > 0) {
      process.exitCode = 1;
    }
    return;
  }
  const durationRaw = readArg(argv, "--duration-sec");
  const ticksRaw = readArg(argv, "--ticks");
  let ticks = CERT_SOAK_AUTOMATED_TICKS;
  if (durationRaw !== undefined) {
    ticks = soakCertificationTicks(Number(durationRaw));
  } else if (ticksRaw !== undefined) {
    ticks = Number(ticksRaw);
  }
  const seedRaw = readArg(argv, "--seed");
  const seed = seedRaw !== undefined ? Number(seedRaw) : 34;
  const report = attachMemory(runSoakScenario(ticks, seed), before);
  if (durationRaw === undefined && ticks === CERT_SOAK_AUTOMATED_TICKS) {
    process.stderr.write(
      "soak automated duration is " +
        String(CERT_SOAK_AUTOMATED_TICKS) +
        " ticks. Manual certification: --duration-sec " +
        String(CERT_SOAK_CERTIFICATION_SEC) +
        "\n",
    );
  }
  writeReport(out, report);
  if (
    report.errors > 0 ||
    report.ghostEntities > 0 ||
    report.unreleasedItemLocks > 0 ||
    report.unreleasedTradeRecords > 0 ||
    report.unreleasedPartyRecords > 0 ||
    !report.goldUnchanged
  ) {
    process.exitCode = 1;
  }
}

try {
  main(process.argv.slice(2));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(message + "\n");
  process.exitCode = 1;
}
