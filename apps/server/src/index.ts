import { config } from "dotenv";
import { fileURLToPath } from "node:url";
const projectRoot = fileURLToPath(new URL("../../../", import.meta.url));
config({ path: resolve(projectRoot, ".env") });
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import websocket from "@fastify/websocket";
import serveStatic from "@fastify/static";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import type { WebSocket } from "ws";
import {
  RoundInput,
  aggregate,
  standings,
  calibration,
} from "../../../packages/shared/src/index.ts";
import { Store } from "./store.ts";
import { Twitch } from "./twitch.ts";
const live = process.env.APP_MODE === "live";
const origin = process.env.APP_ORIGIN || "http://localhost:5173";
if (live)
  for (const name of [
    "TWITCH_CLIENT_ID",
    "TWITCH_CLIENT_SECRET",
    "SESSION_SECRET",
    "TOKEN_ENCRYPTION_KEY",
  ])
    if (!process.env[name])
      throw Error(`${name} is required in live mode. See .env.example.`);
if (
  live &&
  process.env.NODE_ENV === "production" &&
  !origin.startsWith("https://")
)
  throw Error("APP_ORIGIN must use HTTPS in production live mode.");
if (live && /(?:^|\/)demo\.sqlite$/.test(process.env.DATABASE_PATH || ""))
  throw Error(
    "Live mode cannot use the demo database. Set DATABASE_PATH=.data/live.sqlite.",
  );
const store = new Store(
  resolve(
    projectRoot,
    process.env.DATABASE_PATH || `.data/${live ? "live" : "demo"}.sqlite`,
  ),
);
if (!live) store.seed();
const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || "info",
    serializers: {
      req: (req: any) => ({
        method: req.method,
        url: req.url?.split("?")[0],
        hostname: req.hostname,
      }),
    },
  },
  bodyLimit: 16384,
});
await app.register(cookie, {
  secret:
    process.env.SESSION_SECRET ||
    store.setting("sessionSecret") ||
    store.setting("sessionSecret", randomBytes(32).toString("hex"))!,
});
await app.register(websocket);
const clients = new Set<{ socket: WebSocket; owner: boolean; request: any }>();
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
if (!store.setting("overlayHash")) {
  const token = randomBytes(32).toString("hex");
  store.setting("overlayHash", hash(token));
  store.setting("overlayInitial", token);
}
const equal = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const owner = (req: any) => {
  const value = req.cookies.owner;
  return (
    !!value &&
    req.unsignCookie(value).valid &&
    Number(store.setting("session:" + req.unsignCookie(value).value) || 0) >
      Date.now() - 86400000
  );
};
const overlay = (req: any) => {
  const c = req.cookies.overlay;
  if (!c) return false;
  const u = req.unsignCookie(c);
  return u.valid && equal(hash(u.value!), store.setting("overlayHash") || "");
};
const twitch = new Twitch(store, () => broadcast());
function snapshot(isOwner: boolean) {
  const sessionId = store.setting("activeSession") || "03";
  const all = store.all().filter((r) => (r.sessionId || "03") === sessionId);
  const rounds = all.map((r) => ({
    ...r,
    calls:
      r.state === "open" && !r.publicDistribution
        ? []
        : r.calls.filter((c) => !c.deleted),
    participantCount: r.calls.filter((c) => !c.deleted).length,
    locked: r.state === "open" ? [] : r.locked,
    distribution:
      r.state === "open" && !r.publicDistribution
        ? null
        : aggregate(
            r.state === "open" ? r.calls.filter((c) => !c.deleted) : r.locked,
          ),
  }));
  return {
    schemaVersion: 1,
    sessionId,
    sessions: isOwner ? store.sessions() : [],
    demoMultipleVotes: !live && store.setting("demoMultipleVotes") === "true",
    mode: live ? "Live" : "Demo",
    channel: twitch.name || "Broadcast Director",
    connection: twitch.status,
    lastMessage: twitch.lastMessage,
    ingestionLagMs: twitch.ingestionLagMs,
    gap: twitch.gap,
    rounds,
    current: rounds.at(-1) || null,
    leaderboard: standings(all),
    series: standings(all.slice(0, 5), true),
    calibration: calibration(store.all()),
    overlayVisible: store.setting("overlayVisible") !== "false",
    authenticated: isOwner,
    serverNow: Date.now(),
  };
}
function broadcast() {
  const payload = new Map<boolean, string>();
  for (const c of clients) {
    if (c.socket.readyState !== 1) continue;
    if ((c.owner && !owner(c.request)) || (!c.owner && !overlay(c.request))) {
      c.socket.close(1008, "Authorization expired");
      continue;
    }
    if (c.socket.bufferedAmount > 1024 * 1024) {
      c.socket.close(1013, "Reconnect for current state");
      continue;
    }
    if (!payload.has(c.owner))
      payload.set(c.owner, JSON.stringify(snapshot(c.owner)));
    c.socket.send(payload.get(c.owner)!);
  }
}
let lastBroadcast = 0;
setInterval(() => {
  let changed = false;
  for (const r of store.all())
    if (r.state === "open" && Date.now() >= r.deadline) {
      store.transaction(() => store.lock(r.id));
      changed = true;
    }
  if (changed || Date.now() - lastBroadcast >= 1000) {
    broadcast();
    lastBroadcast = Date.now();
  }
}, 250).unref();
app.addHook("onRequest", async (req, reply) => {
  if (!req.url.startsWith("/api") && !req.url.startsWith("/ws")) return;
  const read = ["GET", "HEAD", "OPTIONS"].includes(req.method);
  if (
    req.url.startsWith("/api/health") ||
    req.url.startsWith("/api/overlay/bootstrap")
  )
    return;
  if (!owner(req) && !overlay(req))
    return reply
      .code(401)
      .send({ error: "Owner sign-in or an authorized overlay is required." });
  if (!read) {
    if (!owner(req))
      return reply.code(403).send({ error: "Overlay access is read-only." });
    const requestOrigin = req.headers.origin;
    if (
      requestOrigin !== origin &&
      requestOrigin !== `http://${req.headers.host}`
    )
      return reply.code(403).send({ error: "Request origin rejected." });
    if (req.headers["x-called-it"] !== "owner")
      return reply.code(403).send({ error: "CSRF header required." });
  }
});
const rates = new Map<string, { n: number; at: number }>();
app.addHook("preHandler", async (req, reply) => {
  if (["GET", "HEAD"].includes(req.method)) return;
  const key = req.ip;
  let rate = rates.get(key);
  if (!rate || Date.now() - rate.at > 60000) {
    rate = { n: 0, at: Date.now() };
    rates.set(key, rate);
  }
  if (++rate.n > 120)
    return reply
      .code(429)
      .send({ error: "Too many operations. Please wait a minute." });
});
app.setErrorHandler((error: any, _req, reply) =>
  reply.code(error instanceof z.ZodError ? 400 : error.statusCode || 409).send({
    error:
      error instanceof z.ZodError
        ? error.issues.map((i: any) => i.message).join(" ")
        : error.message,
  }),
);
app.get("/api/health", async () => ({
  ok: true,
  mode: live ? "Live" : "Demo",
  database: "ready",
}));
app.get("/auth/demo", async (req, reply) => {
  if (live) return reply.redirect("/auth/twitch");
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ALLOW_PUBLIC_DEMO !== "true"
  )
    return reply
      .code(403)
      .type("text/plain")
      .send(
        "Public demo owner access is disabled. Use live mode or explicitly set ALLOW_PUBLIC_DEMO=true for a disposable demo.",
      );
  const id = randomBytes(32).toString("hex");
  store.setting("session:" + id, String(Date.now()));
  reply
    .setCookie("owner", id, {
      signed: true,
      httpOnly: true,
      sameSite: "lax",
      secure: origin.startsWith("https://"),
      path: "/",
    })
    .redirect("/");
});
app.get("/auth/twitch", async (req, reply) => {
  if (!process.env.TWITCH_CLIENT_ID)
    return reply
      .code(503)
      .type("text/plain")
      .send(
        "Twitch is not configured. Add TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, SESSION_SECRET, TOKEN_ENCRYPTION_KEY and APP_MODE=live in .env. See TWITCH_SETUP.md.",
      );
  if (!live)
    return reply
      .code(409)
      .send(
        "Switch to APP_MODE=live with a separate database before connecting Twitch.",
      );
  const state = randomBytes(32).toString("hex");
  store.setting("oauth:" + hash(state), String(Date.now() + 600000));
  reply.setCookie("oauth", state, {
    httpOnly: true,
    signed: true,
    sameSite: "lax",
    secure: origin.startsWith("https://"),
    path: "/auth",
    maxAge: 600,
  });
  reply.redirect(
    "https://id.twitch.tv/oauth2/authorize?" +
      new URLSearchParams({
        client_id: process.env.TWITCH_CLIENT_ID,
        response_type: "code",
        redirect_uri: origin + "/auth/twitch/callback",
        scope: "user:read:chat",
        state,
      }),
  );
});
app.get("/auth/twitch/callback", async (req, reply) => {
  const q = req.query as any;
  const unsigned = req.unsignCookie(req.cookies.oauth || "");
  const state = typeof q.state === "string" ? q.state : "";
  const expiry = store.setting("oauth:" + hash(state));
  store.setting("oauth:" + hash(state), "");
  reply.clearCookie("oauth", { path: "/auth" });
  if (
    !unsigned.valid ||
    !state ||
    !equal(state, unsigned.value!) ||
    !expiry ||
    Number(expiry) < Date.now() ||
    typeof q.code !== "string"
  )
    return reply
      .code(400)
      .send("OAuth state is invalid, expired, or already used. Start again.");
  await twitch.accept(q.code, origin + "/auth/twitch/callback");
  const id = randomBytes(32).toString("hex");
  store.setting("session:" + id, String(Date.now()));
  reply
    .setCookie("owner", id, {
      signed: true,
      httpOnly: true,
      sameSite: "lax",
      secure: origin.startsWith("https://"),
      path: "/",
    })
    .redirect("/");
});
app.get("/api/state", async (req) => snapshot(owner(req)));
app.get("/ws", { websocket: true }, (socket, req) => {
  if (
    req.headers.origin &&
    req.headers.origin !== origin &&
    req.headers.origin !== `http://${req.headers.host}`
  ) {
    socket.close(1008, "Origin rejected");
    return;
  }
  const c = { socket, owner: owner(req), request: req };
  clients.add(c);
  socket.send(JSON.stringify(snapshot(c.owner)));
  socket.on("close", () => clients.delete(c));
});
app.post("/api/rounds/create", async (req) => {
  const input = RoundInput.parse(req.body);
  const key = z.string().min(8).parse(req.headers["idempotency-key"]);
  const old = store.db
    .prepare("SELECT response FROM operations WHERE key=?")
    .get(key) as any;
  if (old) return JSON.parse(old.response);
  const round = store.create(input, key);
  broadcast();
  return round;
});
app.post("/api/rounds/:id/:action", async (req) => {
  const { id, action } = req.params as { id: string; action: string };
  const input = z
    .object({
      version: z.number().int(),
      outcome: z.boolean().optional(),
      reason: z.string().max(500).optional(),
      acknowledge: z.boolean().optional(),
    })
    .parse(req.body);
  const key = z.string().min(8).parse(req.headers["idempotency-key"]);
  const result = store.transaction(() => {
    const old = store.db
      .prepare("SELECT response FROM operations WHERE key=?")
      .get(key) as any;
    if (old) return JSON.parse(old.response);
    const round = store.get(Number(id));
    if (!round || round.version !== input.version)
      throw Error("The round changed. Refresh and try again.");
    const next = store.transition(
      Number(id),
      action,
      input.outcome,
      input.reason,
      input.acknowledge,
    );
    store.db
      .prepare("INSERT INTO operations VALUES(?,?)")
      .run(key, JSON.stringify(next));
    return next;
  });
  broadcast();
  return result;
});
app.post("/api/demo/settings", async (req) => {
  if (live) throw Error("Demo settings are disabled in live mode.");
  const { multipleVotes } = z
    .object({ multipleVotes: z.boolean() })
    .parse(req.body);
  store.setting("demoMultipleVotes", String(multipleVotes));
  broadcast();
  return { ok: true };
});
app.post("/api/demo/call", async (req) => {
  if (live) throw Error("Synthetic calls are disabled in live mode.");
  const b = z
    .object({ text: z.string().max(200), name: z.string().min(1).max(30) })
    .parse(req.body);
  const accepted = store.ingest({
    id: randomBytes(16).toString("hex"),
    text: b.text,
    name: b.name,
    userId: "demo-input-" + b.name.toLowerCase(),
    separateVote: store.setting("demoMultipleVotes") === "true",
    sourceAt: Date.now(),
  });
  broadcast();
  return { accepted };
});
app.post("/api/overlay/visibility", async (req) => {
  const b = z.object({ visible: z.boolean() }).parse(req.body);
  store.setting("overlayVisible", String(b.visible));
  broadcast();
  return { ok: true };
});
app.post("/api/overlay/rotate", async () => {
  const token = randomBytes(32).toString("hex");
  store.setting("overlayHash", hash(token));
  store.setting("overlayInitial", "");
  for (const c of clients)
    if (!c.owner) c.socket.close(1008, "Credential rotated");
  return { token };
});
app.post("/api/overlay/bootstrap", async (req, reply) => {
  const { token } = z.object({ token: z.string().length(64) }).parse(req.body);
  if (!equal(hash(token), store.setting("overlayHash") || ""))
    return reply
      .code(403)
      .send({ error: "Overlay credential invalid or revoked." });
  reply.setCookie("overlay", token, {
    signed: true,
    httpOnly: true,
    sameSite: "lax",
    secure: origin.startsWith("https://"),
    path: "/",
  });
  return { ok: true };
});
app.post("/api/auth/disconnect", async (req, reply) => {
  twitch.disconnect();
  store.setting("overlayHash", hash(randomBytes(32).toString("hex")));
  store.db.prepare("DELETE FROM settings WHERE key LIKE 'session:%'").run();
  for (const c of clients) c.socket.close(1008, "Disconnected");
  reply.clearCookie("owner", { path: "/" });
  return { ok: true };
});
app.post("/api/sessions", async (req) => {
  const body = z
    .object({ name: z.string().trim().min(1).max(80) })
    .parse(req.body);
  const result = store.newSession(body.name);
  broadcast();
  return result;
});
app.get("/api/history", async (req, reply) => {
  if (!owner(req)) return reply.code(403).send({ error: "Owner only." });
  return { sessions: store.sessions(), rounds: store.all() };
});
app.post("/api/data/delete", async () => {
  store.transaction(() => {
    store.db.exec(
      "DELETE FROM rounds;DELETE FROM messages;DELETE FROM resolutions;DELETE FROM operations;DELETE FROM audit;",
    );
    store.audit("data-deleted", {});
  });
  broadcast();
  return { ok: true };
});
app.get("/api/export", async (req, reply) => {
  if (!owner(req)) return reply.code(403).send({ error: "Owner only." });
  return snapshot(true);
});
const dist = resolve(projectRoot, "apps/web/dist");
if (existsSync(dist)) {
  await app.register(serveStatic, { root: dist });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith("/api") || req.url.startsWith("/auth"))
      return reply.code(404).send({ error: "Not found" });
    return reply.sendFile("index.html");
  });
}
if (live && store.setting("tokens")) {
  try {
    await twitch.validate();
    twitch.connect();
  } catch (e) {
    app.log.error(e);
  }
}
setInterval(() => {
  if (live && store.setting("tokens"))
    twitch.validate().catch((e) => app.log.error(e));
}, 3600000).unref();
await app.listen({ port: Number(process.env.PORT) || 3001, host: "0.0.0.0" });
