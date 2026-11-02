import { z } from "zod";
export const RoundInput = z.object({
  question: z.string().trim().min(5).max(160),
  criterion: z.string().trim().min(5).max(500),
  duration: z.number().int().min(10).max(300).default(45),
  publicDistribution: z.boolean().default(false),
});
export type State = "draft" | "open" | "locked" | "resolved" | "void";
export type Call = {
  userId: string;
  name: string;
  p: number;
  direction: "yes" | "no";
  confidence: number;
  messageId: string;
  sourceAt: number;
  arrivalAt: number;
  seq: number;
  deleted?: boolean;
  separateVote?: boolean;
};
export type Round = {
  sessionId?: string;
  channelId?: string;
  id: number;
  version: number;
  question: string;
  criterion: string;
  state: State;
  openedAt: number;
  deadline: number;
  lockedAt: number | null;
  outcome: boolean | null;
  resolvedAt: number | null;
  calls: Call[];
  locked: Call[];
  crowd: number | null;
  revision: number;
  reason?: string;
  disrupted: boolean;
  publicDistribution: boolean;
};
export function canonical(direction: "yes" | "no", confidence: number) {
  if (!Number.isInteger(confidence) || confidence < 50 || confidence > 100)
    throw Error("Confidence must be an integer from 50 to 100.");
  return direction === "yes" ? confidence : 100 - confidence;
}
export function score(p: number, y: boolean) {
  if (!Number.isInteger(p) || p < 0 || p > 100)
    throw Error("Probability must be 0–100.");
  const squaredError = (p - (y ? 100 : 0)) ** 2;
  return {
    squaredError,
    brier: squaredError / 10000,
    score: 100 - squaredError / 100,
  };
}
export function parseCommand(text: string) {
  const m = text.trim().match(/^!call\s+(\d+)\s+(yes|no)\s+(\d{2,3})%?$/i);
  if (m) {
    const confidence = Number(m[3]);
    try {
      return {
        kind: "call" as const,
        round: Number(m[1]),
        direction: m[2].toLowerCase() as "yes" | "no",
        confidence,
        p: canonical(m[2].toLowerCase() as "yes" | "no", confidence),
      };
    } catch {
      return null;
    }
  }
  const u = text.trim().match(/^!uncall\s+(\d+)$/i);
  if (u) return { kind: "uncall" as const, round: Number(u[1]) };
  if (text.trim().toLowerCase() === "!calledit")
    return { kind: "help" as const };
  return null;
}
export function aggregate(calls: Call[]) {
  if (!calls.length)
    return {
      count: 0,
      mean: null,
      median: null,
      q1: null,
      q3: null,
      bins: Array(10).fill(0) as number[],
    };
  const sorted = calls.map((c) => c.p).sort((a, b) => a - b);
  const quantile = (q: number) => {
    const i = (sorted.length - 1) * q;
    return (
      sorted[Math.floor(i)] +
      (sorted[Math.ceil(i)] - sorted[Math.floor(i)]) * (i % 1)
    );
  };
  return {
    count: calls.length,
    mean: sorted.reduce((a, b) => a + b, 0) / calls.length,
    median: quantile(0.5),
    q1: quantile(0.25),
    q3: quantile(0.75),
    bins: Array.from(
      { length: 10 },
      (_, i) =>
        calls.filter((c) => Math.min(9, Math.floor(c.p / 10)) === i).length,
    ),
  };
}
export function standings(rounds: Round[], series = false) {
  const resolved = rounds.filter((r) => r.state === "resolved");
  const users = new Map<
    string,
    {
      userId: string;
      name: string;
      total: number;
      count: number;
      mean: number;
      eligible: boolean;
    }
  >();
  for (const r of resolved)
    for (const c of r.locked) {
      const a = users.get(c.userId) ?? {
        userId: c.userId,
        name: c.name,
        total: 0,
        count: 0,
        mean: 0,
        eligible: false,
      };
      a.total += score(c.p, r.outcome!).score;
      a.count++;
      a.mean = a.total / a.count;
      a.eligible =
        !series || (resolved.length >= 3 && a.count === resolved.length);
      users.set(c.userId, a);
    }
  return [...users.values()].sort((a, b) => b.mean - a.mean);
}
export function calibration(rounds: Round[]) {
  const samples = rounds.filter(
    (r) => r.state === "resolved" && r.crowd !== null,
  );
  return {
    count: samples.length,
    bins: Array.from({ length: 10 }, (_, i) => {
      const s = samples.filter(
        (r) => Math.min(9, Math.floor(r.crowd! / 10)) === i,
      );
      return {
        count: s.length,
        p: s.length ? s.reduce((a, r) => a + r.crowd!, 0) / s.length : null,
        observed: s.length
          ? (s.filter((r) => r.outcome).length / s.length) * 100
          : null,
        visible: samples.length >= 20 && s.length >= 5,
      };
    }),
  };
}
