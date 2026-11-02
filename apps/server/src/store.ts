import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  aggregate,
  parseCommand,
  type Call,
  type Round,
} from "../../../packages/shared/src/index.ts";
export class Store {
  db: DatabaseSync;
  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode=WAL;PRAGMA foreign_keys=ON;");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.exec(
        readFileSync(
          new URL("../migrations/001_initial.sql", import.meta.url),
          "utf8",
        ),
      );
      this.db.exec("PRAGMA user_version=1;COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  setting(key: string, value?: string) {
    if (value !== undefined)
      this.db
        .prepare(
          "INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        )
        .run(key, value);
    return (
      this.db.prepare("SELECT value FROM settings WHERE key=?").get(key) as
        { value: string } | undefined
    )?.value;
  }
  all(): Round[] {
    return (
      this.db.prepare("SELECT data FROM rounds ORDER BY id").all() as {
        data: string;
      }[]
    ).map((x) => JSON.parse(x.data));
  }
  get(id: number) {
    return this.all().find((r) => r.id === id);
  }
  save(r: Round) {
    this.db
      .prepare(
        "INSERT INTO rounds VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
      )
      .run(r.id, JSON.stringify(r));
    return r;
  }
  audit(kind: string, data: unknown) {
    this.db
      .prepare("INSERT INTO audit(at,kind,data) VALUES(?,?,?)")
      .run(Date.now(), kind, JSON.stringify(data));
  }
  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  create(
    input: {
      question: string;
      criterion: string;
      duration: number;
      publicDistribution: boolean;
    },
    idempotencyKey?: string,
  ) {
    return this.transaction(() => {
      if (this.all().some((r) => r.state === "open" || r.state === "locked"))
        throw Error("Finish or void the current round first.");
      const id = Math.max(0, ...this.all().map((r) => r.id)) + 1;
      const r: Round = {
        sessionId: this.setting("activeSession") || "03",
        channelId: this.setting("broadcasterId") || "demo",
        id,
        version: 1,
        question: input.question,
        criterion: input.criterion,
        state: "open",
        openedAt: Date.now(),
        deadline: Date.now() + input.duration * 1000,
        lockedAt: null,
        outcome: null,
        resolvedAt: null,
        calls: [],
        locked: [],
        crowd: null,
        revision: 0,
        disrupted: false,
        publicDistribution: input.publicDistribution,
      };
      this.audit("publish", { id });
      this.save(r);
      if (idempotencyKey)
        this.db
          .prepare("INSERT INTO operations VALUES(?,?)")
          .run(idempotencyKey, JSON.stringify(r));
      return r;
    });
  }
  ingest(message: {
    id: string;
    delivery?: string;
    text: string;
    userId: string;
    name: string;
    sourceAt: number;
    arrivalAt?: number;
    separateVote?: boolean;
  }) {
    return this.transaction(() => {
      if (
        this.db
          .prepare("SELECT id FROM messages WHERE id=? OR delivery=?")
          .get(message.id, message.delivery ?? message.id)
      )
        return false;
      const command = parseCommand(message.text);
      const arrivalAt = message.arrivalAt ?? Date.now();
      this.db
        .prepare("INSERT INTO messages VALUES(?,?,?,?)")
        .run(
          message.id,
          message.delivery ?? message.id,
          command && "round" in command ? (command.round ?? null) : null,
          JSON.stringify({ ...message, arrivalAt }),
        );
      if (!command || command.kind === "help") return false;
      const r = this.get(command.round);
      if (
        !r ||
        r.state !== "open" ||
        arrivalAt >= r.deadline ||
        message.sourceAt < r.openedAt ||
        message.sourceAt >= r.deadline
      )
        return false;
      const seq = Number(
        (
          this.db.prepare("SELECT count(*) n FROM messages").get() as {
            n: number;
          }
        ).n,
      );
      const old = r.calls.find(
        (c) => c.userId === message.userId && !c.separateVote,
      );
      if (
        !message.separateVote &&
        old &&
        (old.sourceAt > message.sourceAt ||
          (old.sourceAt === message.sourceAt && old.seq >= seq))
      )
        return false;
      const call: Call = {
        separateVote: message.separateVote,
        userId: message.userId,
        name: message.name,
        p: command.kind === "call" ? command.p : 50,
        direction: command.kind === "call" ? command.direction : "yes",
        confidence: command.kind === "call" ? command.confidence : 50,
        messageId: message.id,
        sourceAt: message.sourceAt,
        arrivalAt,
        seq,
        deleted: command.kind === "uncall",
      };
      r.calls = r.calls.filter(
        (c) =>
          c.userId !== call.userId ||
          (command.kind === "call" && (message.separateVote || c.separateVote)),
      );
      r.calls.push(call);
      this.save(r);
      return true;
    });
  }
  moderate(userId?: string, messageId?: string) {
    this.transaction(() => {
      const rows = this.db.prepare("SELECT id,data FROM messages").all() as {
        id: string;
        data: string;
      }[];
      for (const row of rows) {
        const m = JSON.parse(row.data);
        if (
          (userId && m.userId === userId) ||
          (messageId && m.id === messageId)
        ) {
          m.deleted = true;
          this.db
            .prepare("UPDATE messages SET data=? WHERE id=?")
            .run(JSON.stringify(m), row.id);
        }
      }
      for (const r of this.all()) {
        if (r.state === "open") {
          const messages = rows
            .map((row) =>
              JSON.parse(
                (
                  this.db
                    .prepare("SELECT data FROM messages WHERE id=?")
                    .get(row.id) as { data: string }
                ).data,
              ),
            )
            .filter((m) => !m.deleted)
            .sort((a, b) => a.sourceAt - b.sourceAt);
          r.calls = [];
          for (const m of messages) {
            const c = parseCommand(m.text);
            if (
              !c ||
              c.kind === "help" ||
              c.round !== r.id ||
              m.sourceAt < r.openedAt ||
              m.sourceAt >= r.deadline ||
              m.arrivalAt >= r.deadline
            )
              continue;
            r.calls = r.calls.filter(
              (x) =>
                x.userId !== m.userId ||
                (c.kind === "call" && (m.separateVote || x.separateVote)),
            );
            r.calls.push({
              separateVote: m.separateVote,
              userId: m.userId,
              name: m.name,
              p: c.kind === "call" ? c.p : 50,
              direction: c.kind === "call" ? c.direction : "yes",
              confidence: c.kind === "call" ? c.confidence : 50,
              messageId: m.id,
              sourceAt: m.sourceAt,
              arrivalAt: m.arrivalAt,
              seq: 0,
              deleted: c.kind === "uncall",
            });
          }
          this.save(r);
        } else {
          for (const c of r.locked)
            if (
              (userId && c.userId === userId) ||
              (messageId && c.messageId === messageId)
            )
              c.name = "Viewer";
          this.save(r);
        }
      }
    });
  }
  lock(id: number) {
    const r = this.get(id);
    if (!r || r.state !== "open") throw Error("Only open rounds can lock.");
    r.locked = r.calls.filter((c) => !c.deleted);
    r.crowd = aggregate(r.locked).mean;
    r.lockedAt = Date.now();
    r.state = "locked";
    r.version++;
    this.audit("lock", { id, count: r.locked.length });
    return this.save(r);
  }
  transition(
    id: number,
    action: string,
    outcome?: boolean,
    reason?: string,
    acknowledge?: boolean,
  ) {
    const r = this.get(id);
    if (!r) throw Error("Round not found.");
    if (action === "lock") return this.lock(id);
    if (action === "void") {
      if (r.state === "void") throw Error("Already void.");
      r.state = "void";
      r.reason = reason || "Invalid or interrupted attempt";
    } else if (action === "resolve" || action === "correct") {
      if (action === "resolve" && r.state !== "locked")
        throw Error("Lock before resolving.");
      if (action === "correct" && (r.state !== "resolved" || !reason?.trim()))
        throw Error("A correction needs a resolved round and reason.");
      if (typeof outcome !== "boolean") throw Error("Select Yes or No.");
      if (r.disrupted && !acknowledge)
        throw Error("Acknowledge the ingestion disruption or void this round.");
      r.outcome = outcome;
      r.resolvedAt = Date.now();
      r.state = "resolved";
      r.revision++;
      r.reason = reason;
      this.db.prepare("INSERT INTO resolutions VALUES(?,?,?)").run(
        id,
        r.revision,
        JSON.stringify({
          outcome,
          reason,
          at: r.resolvedAt,
          resolver: "owner",
        }),
      );
    } else throw Error("Unknown action.");
    r.version++;
    this.audit(action, { id, outcome, reason });
    return this.save(r);
  }
  sessions() {
    return JSON.parse(
      this.setting("sessions") || '[ {"id":"03","name":"Session 03"} ]',
    ) as { id: string; name: string }[];
  }
  newSession(name: string) {
    return this.transaction(() => {
      if (this.all().some((r) => r.state === "open" || r.state === "locked"))
        throw Error(
          "Resolve or void the current round before starting a session.",
        );
      const list = this.sessions();
      const id = String(Number(list.at(-1)!.id) + 1).padStart(2, "0");
      list.push({ id, name });
      this.setting("sessions", JSON.stringify(list));
      this.setting("activeSession", id);
      this.audit("session-start", { id, name });
      return { id, name };
    });
  }
  seed() {
    if (this.all().length) return;
    const names = [
      "LunarFox",
      "PixelPilot",
      "MossKnight",
      "Cloudwalker",
      "NovaRay",
      "TheQuietOne",
      "Fern & Fire",
      "Echo",
      "Juniper",
      "Skybound",
    ];
    for (let i = 1; i <= 4; i++) {
      const r: Round = {
        sessionId: "03",
        channelId: "demo",
        id: i,
        version: i === 4 ? 2 : 3,
        question: "Will I survive the next attempt?",
        criterion:
          "Survive the attempt and reach the next checkpoint. Falling or losing all hearts counts as No.",
        state: i === 4 ? "locked" : "resolved",
        openedAt: Date.now() - i * 120000,
        deadline: Date.now() - i * 120000 + 45000,
        lockedAt: Date.now() - i * 120000 + 45000,
        outcome: i === 4 ? null : i !== 2,
        resolvedAt: i === 4 ? null : Date.now() - i * 120000 + 90000,
        calls: [],
        locked: [],
        crowd: 34,
        revision: i === 4 ? 0 : 1,
        disrupted: false,
        publicDistribution: false,
      };
      for (let j = 0; j < 68; j++) {
        const p = [20, 30, 15, 75, 10, 40, 25, 60, 35, 30][j % 10];
        r.locked.push({
          userId: `demo-${j}`,
          name: j < 10 ? names[j] : `Viewer ${j + 1}`,
          p,
          direction: p >= 50 ? "yes" : "no",
          confidence: p >= 50 ? p : 100 - p,
          messageId: `fixture-${i}-${j}`,
          sourceAt: r.openedAt + 1000,
          arrivalAt: r.openedAt + 1100,
          seq: j,
        });
      }
      r.calls = r.locked;
      r.crowd = aggregate(r.locked).mean;
      this.save(r);
    }
    this.setting("overlayVisible", "true");
  }
}
