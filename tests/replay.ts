import { readFileSync } from "node:fs";
import { Store } from "../apps/server/src/store.ts";
const path = process.argv[2];
if (!path) throw Error("Usage: npm run replay -- path/to/replay.jsonl");
// Explicit Replay namespace: never opens the live/demo database.
const store = new Store(".data/replay.sqlite");
const round = store.create({
  question: "Will the replay complete?",
  criterion: "The declared replay outcome occurs.",
  duration: 300,
  publicDistribution: false,
});
let accepted = 0;
for (const [i, line] of readFileSync(path, "utf8")
  .trim()
  .split("\n")
  .entries()) {
  const m = JSON.parse(line);
  accepted += Number(
    store.ingest({
      id: "replay-" + (m.id || i),
      text: String(m.text).replace(/!call \d+/, `!call ${round.id}`),
      userId: String(m.userId),
      name: "Replay · " + String(m.name),
      sourceAt: round.openedAt + Number(m.offsetMs || 0),
      arrivalAt: round.openedAt + Number(m.offsetMs || 0),
    }),
  );
}
store.lock(round.id);
console.log({
  source: "Replay",
  accepted,
  effective: store.get(round.id)!.locked.length,
});
store.db.close();
