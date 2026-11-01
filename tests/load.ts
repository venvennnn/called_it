import { performance } from "node:perf_hooks";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir, cpus, totalmem } from "node:os";
import { join } from "node:path";
import { Store } from "../apps/server/src/store.ts";
const dir = mkdtempSync(join(tmpdir(), "called-it-load-"));
const store = new Store(join(dir, "load.sqlite"));
const round = store.create({
  question: "Will the load replay finish?",
  criterion: "All eligible account calls are persisted exactly once.",
  duration: 300,
  publicDistribution: false,
});
const measurements: number[] = [];
const started = performance.now();
let accepted = 0,
  total = 0;
for (const [rate, seconds] of [
  [50, 10],
  [200, 2],
]) {
  for (let second = 0; second < seconds; second++) {
    const tick = performance.now();
    for (let i = 0; i < rate; i++) {
      const index = total++;
      const id = "replay-" + index;
      const at = performance.now();
      const message = {
        id,
        delivery: id,
        text: `!call ${round.id} ${index % 2 ? "yes" : "no"} 80`,
        userId: "user-" + (index % 100),
        name: "Replay " + (index % 100),
        sourceAt: Date.now(),
      };
      if (store.ingest(message)) accepted++;
      store.ingest(message);
      measurements.push(performance.now() - at);
    }
    await new Promise((r) =>
      setTimeout(r, Math.max(0, 1000 - (performance.now() - tick))),
    );
  }
}
store.transaction(() => store.lock(round.id));
const locked = store.get(round.id)!;
if (locked.locked.length !== 100 || accepted !== total)
  throw Error("Load correctness failed");
measurements.sort((a, b) => a - b);
const result = {
  timestamp: new Date().toISOString(),
  source: "Synthetic replay; never live audience",
  hardware: {
    cpu: cpus()[0].model,
    logicalCpus: cpus().length,
    memoryGiB: Math.round(totalmem() / 2 ** 30),
  },
  target:
    "50 messages/s for 10s, 200 messages/s for 2s; each message delivered twice",
  messages: total,
  accepted,
  effectiveAccounts: locked.locked.length,
  durationMs: Math.round(performance.now() - started),
  processingMs: {
    p50: measurements[Math.floor(measurements.length * 0.5)],
    p95: measurements[Math.floor(measurements.length * 0.95)],
    max: measurements.at(-1),
  },
  rssMiB: Math.round(process.memoryUsage().rss / 2 ** 20),
  limitations:
    "Local SQLite processing latency, not end-to-end Twitch network latency; short engineering smoke, not a long-duration soak.",
};
console.log(JSON.stringify(result, null, 2));
writeFileSync("docs/load-results.json", JSON.stringify(result, null, 2) + "\n");
store.db.close();
rmSync(dir, { recursive: true, force: true });
