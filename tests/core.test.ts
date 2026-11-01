import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  canonical,
  score,
  parseCommand,
  aggregate,
  standings,
  calibration,
} from "../packages/shared/src/index.ts";
import { Store } from "../apps/server/src/store.ts";
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "called-it-"));
  const path = join(dir, "test.sqlite");
  const store = new Store(path);
  return {
    store,
    path,
    close() {
      store.db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
const input = {
  question: "Will this test pass?",
  criterion: "All assertions pass without an error.",
  duration: 45,
  publicDistribution: false,
};
test("directional confidence and mandatory round commands", () => {
  assert.equal(canonical("no", 80), 20);
  assert.equal(canonical("yes", 80), 80);
  assert.equal(canonical("yes", 50), canonical("no", 50));
  for (const n of [0, 20, 49, 101, 80.1])
    assert.throws(() => canonical("no", n));
  assert.equal(parseCommand("!call 14 NO 80%")?.kind, "call");
  for (const text of [
    "!call yes 80",
    "!call 14 no 20",
    "!call 14 yes 101",
    "!call 14 maybe 80",
    "!call 14 yes 80.1",
    "!call 14 yes 80 trailing",
  ])
    assert.equal(parseCommand(text), null);
  assert.deepEqual(parseCommand("!uncall 14"), { kind: "uncall", round: 14 });
});
test("worked scores, endpoints, bounds and symmetry for every integer probability", () => {
  assert.equal(score(80, true).score, 96);
  assert.equal(score(80, false).score, 36);
  assert.equal(score(90, false).score, 19);
  assert.equal(score(20, false).score, 96);
  assert.equal(score(50, true).score, 75);
  assert.equal(score(50, false).score, 75);
  assert.equal(score(100, true).score, 100);
  assert.equal(score(100, false).score, 0);
  for (let p = 0; p <= 100; p++)
    for (const y of [true, false]) {
      assert.equal(score(p, y).score, score(100 - p, !y).score);
      assert.ok(score(p, y).score >= 0 && score(p, y).score <= 100);
    }
});
test("replacements, duplicate delivery, malformed call and source ordering", () => {
  const f = fixture();
  try {
    const r = f.store.create(input);
    const msg = {
      id: "1",
      delivery: "d1",
      text: `!call ${r.id} no 80`,
      userId: "a",
      name: "A",
      sourceAt: r.openedAt + 1,
      arrivalAt: r.openedAt + 5,
    };
    assert.equal(f.store.ingest(msg), true);
    assert.equal(f.store.ingest(msg), false);
    assert.equal(
      f.store.ingest({
        ...msg,
        id: "2",
        delivery: "d2",
        text: `!call ${r.id} yes 90`,
        sourceAt: r.openedAt + 3,
      }),
      true,
    );
    assert.equal(
      f.store.ingest({
        ...msg,
        id: "3",
        delivery: "d3",
        sourceAt: r.openedAt + 2,
      }),
      false,
    );
    assert.equal(
      f.store.ingest({
        ...msg,
        id: "4",
        delivery: "d4",
        text: `!call ${r.id} yes wrong`,
      }),
      false,
    );
    assert.equal(f.store.get(r.id)!.calls[0].p, 90);
    assert.equal(f.store.get(r.id)!.calls.length, 1);
  } finally {
    f.close();
  }
});
test("deadline acceptance uses both arrival and source time", () => {
  const f = fixture();
  try {
    const r = f.store.create(input);
    const m = {
      id: "a",
      text: `!call ${r.id} yes 80`,
      userId: "a",
      name: "A",
      sourceAt: r.openedAt,
      arrivalAt: r.deadline,
    };
    assert.equal(f.store.ingest(m), false);
    assert.equal(
      f.store.ingest({
        ...m,
        id: "b",
        arrivalAt: r.openedAt + 1,
        sourceAt: r.openedAt - 1,
      }),
      false,
    );
    assert.equal(
      f.store.ingest({
        ...m,
        id: "c",
        arrivalAt: r.openedAt + 1,
        sourceAt: r.deadline,
      }),
      false,
    );
  } finally {
    f.close();
  }
});
test("withdrawal and deleting a replacement reconstruct previous valid forecast", () => {
  const f = fixture();
  try {
    const r = f.store.create(input);
    const m = {
      id: "a",
      text: `!call ${r.id} yes 80`,
      userId: "a",
      name: "A",
      sourceAt: r.openedAt + 1,
      arrivalAt: r.openedAt + 2,
    };
    f.store.ingest(m);
    f.store.ingest({
      ...m,
      id: "b",
      text: `!call ${r.id} no 90`,
      sourceAt: r.openedAt + 2,
    });
    f.store.moderate(undefined, "b");
    assert.equal(f.store.get(r.id)!.calls[0].p, 80);
    f.store.ingest({
      ...m,
      id: "c",
      text: `!uncall ${r.id}`,
      sourceAt: r.openedAt + 3,
    });
    assert.equal(f.store.get(r.id)!.calls[0].deleted, true);
    f.store.moderate(undefined, "c");
    assert.equal(f.store.get(r.id)!.calls[0].p, 80);
  } finally {
    f.close();
  }
});
test("lock freezes snapshot; later moderation hides attribution, corrections recompute once, void excludes scores", () => {
  const f = fixture();
  try {
    const r = f.store.create(input);
    f.store.ingest({
      id: "a",
      text: `!call ${r.id} yes 80`,
      userId: "a",
      name: "Alice",
      sourceAt: r.openedAt,
      arrivalAt: r.openedAt,
    });
    f.store.transaction(() => f.store.lock(r.id));
    assert.equal(f.store.get(r.id)!.crowd, 80);
    assert.equal(
      f.store.ingest({
        id: "b",
        text: `!call ${r.id} no 90`,
        userId: "a",
        name: "Alice",
        sourceAt: r.openedAt + 1,
      }),
      false,
    );
    f.store.moderate("a");
    assert.equal(f.store.get(r.id)!.locked[0].name, "Viewer");
    assert.equal(f.store.get(r.id)!.crowd, 80);
    f.store.transaction(() => f.store.transition(r.id, "resolve", true));
    assert.equal(standings(f.store.all())[0].mean, 96);
    assert.throws(() =>
      f.store.transaction(() => f.store.transition(r.id, "resolve", false)),
    );
    assert.throws(() =>
      f.store.transaction(() => f.store.transition(r.id, "correct", false, "")),
    );
    f.store.transaction(() =>
      f.store.transition(r.id, "correct", false, "Misread checkpoint"),
    );
    assert.equal(standings(f.store.all())[0].mean, 36);
    assert.equal(f.store.get(r.id)!.revision, 2);
    f.store.transition(r.id, "void");
    assert.equal(standings(f.store.all()).length, 0);
  } finally {
    f.close();
  }
});
test("SQLite restart retains locked round and rejects a second active round", () => {
  const f = fixture();
  const r = f.store.create(input);
  assert.throws(() => f.store.create(input));
  f.store.lock(r.id);
  f.store.db.close();
  const reopened = new Store(f.path);
  assert.equal(reopened.get(r.id)!.state, "locked");
  reopened.db.close();
  rmSync(join(f.path, ".."), { recursive: true, force: true });
});
test("series eligibility, ties and crowd calibration denominator", () => {
  const f = fixture();
  try {
    f.store.seed();
    const all = f.store.all();
    const rows = standings(all);
    assert.equal(rows[0].mean, rows[1].mean);
    assert.ok(standings(all, true).every((x) => x.eligible));
    assert.equal(calibration(all).count, 3);
    assert.ok(calibration(all).bins.every((b) => !b.visible));
    assert.equal(aggregate([]).mean, null);
    assert.equal(aggregate(all[0].locked).count, 68);
  } finally {
    f.close();
  }
});
test("new sessions preserve archives and require finishing active rounds", () => {
  const f = fixture();
  try {
    const r = f.store.create(input);
    assert.equal(r.sessionId, "03");
    assert.throws(() => f.store.newSession("Next"));
    f.store.lock(r.id);
    f.store.transition(r.id, "resolve", true);
    const session = f.store.newSession("Next stream");
    assert.equal(session.id, "04");
    const next = f.store.create(input);
    assert.equal(next.sessionId, "04");
    assert.equal(f.store.all().length, 2);
    assert.equal(f.store.sessions().length, 2);
  } finally {
    f.close();
  }
});
