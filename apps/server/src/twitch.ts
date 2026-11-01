import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import WebSocket from "ws";
import { HttpsProxyAgent } from "https-proxy-agent";
import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";
if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY)
  setGlobalDispatcher(new EnvHttpProxyAgent());
import type { Store } from "./store.ts";
export class Twitch {
  socket?: WebSocket;
  status = "disconnected";
  broadcaster?: string;
  name?: string;
  lastMessage: number | null = null;
  ingestionLagMs: number | null = null;
  gap: string | null = null;
  refreshFlight?: Promise<any>;
  retry?: ReturnType<typeof setTimeout>;
  watchdog?: ReturnType<typeof setTimeout>;
  stopped = false;
  constructor(
    public store: Store,
    public changed: () => void,
    public socketFactory?: (url: string) => WebSocket,
  ) {}
  key() {
    const k = process.env.TOKEN_ENCRYPTION_KEY;
    if (!k || !/^[a-f\d]{64}$/i.test(k))
      throw Error("TOKEN_ENCRYPTION_KEY must be 64 hexadecimal characters.");
    return Buffer.from(k, "hex");
  }
  seal(value: unknown) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key(), iv);
    const data = Buffer.concat([
      cipher.update(JSON.stringify(value)),
      cipher.final(),
    ]);
    return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64");
  }
  unseal() {
    const s = this.store.setting("tokens");
    if (!s) return null;
    const b = Buffer.from(s, "base64");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.key(),
      b.subarray(0, 12),
    );
    decipher.setAuthTag(b.subarray(12, 28));
    return JSON.parse(
      Buffer.concat([
        decipher.update(b.subarray(28)),
        decipher.final(),
      ]).toString(),
    );
  }
  async token() {
    const t = this.unseal();
    if (!t) throw Error("Connect Twitch first.");
    if (Date.now() < t.expiresAt - 60000) return t.access_token;
    if (!this.refreshFlight)
      this.refreshFlight = (async () => {
        const response = await fetch("https://id.twitch.tv/oauth2/token", {
          method: "POST",
          body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: t.refresh_token,
            client_id: process.env.TWITCH_CLIENT_ID!,
            client_secret: process.env.TWITCH_CLIENT_SECRET!,
          }),
        });
        if (!response.ok) {
          this.revoke();
          throw Error("Twitch authorization expired. Reconnect your account.");
        }
        const next = (await response.json()) as any;
        this.store.setting(
          "tokens",
          this.seal({
            ...next,
            expiresAt: Date.now() + next.expires_in * 1000,
          }),
        );
        return next.access_token;
      })().finally(() => (this.refreshFlight = undefined));
    return this.refreshFlight;
  }
  async helix(path: string, body?: unknown) {
    const res = await fetch("https://api.twitch.tv/helix/" + path, {
      method: body ? "POST" : "GET",
      headers: {
        "Client-Id": process.env.TWITCH_CLIENT_ID!,
        Authorization: `Bearer ${await this.token()}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok)
      throw Error(
        `Twitch API returned ${res.status}. Verify authorization and scopes.`,
      );
    return res.status === 204 ? null : res.json();
  }
  async validate() {
    const res = await fetch("https://id.twitch.tv/oauth2/validate", {
      headers: { Authorization: `OAuth ${await this.token()}` },
    });
    if (!res.ok) {
      this.revoke();
      throw Error("Twitch token validation failed.");
    }
    const data = (await res.json()) as any;
    if (
      data.client_id !== process.env.TWITCH_CLIENT_ID ||
      !data.scopes.includes("user:read:chat") ||
      (this.store.setting("broadcasterId") &&
        this.store.setting("broadcasterId") !== data.user_id)
    ) {
      this.revoke();
      throw Error("Twitch authorization is missing the required chat scope.");
    }
    this.broadcaster = data.user_id;
    this.name = data.login;
    return data;
  }
  async accept(code: string, redirect: string) {
    const res = await fetch("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      body: new URLSearchParams({
        client_id: process.env.TWITCH_CLIENT_ID!,
        client_secret: process.env.TWITCH_CLIENT_SECRET!,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirect,
      }),
    });
    if (!res.ok) throw Error("Twitch code exchange failed.");
    const tokens = (await res.json()) as any;
    const validation = await fetch("https://id.twitch.tv/oauth2/validate", {
      headers: { Authorization: `OAuth ${tokens.access_token}` },
    });
    if (!validation.ok) throw Error("Twitch identity validation failed.");
    const identity = (await validation.json()) as any;
    if (
      identity.client_id !== process.env.TWITCH_CLIENT_ID ||
      !identity.scopes?.includes("user:read:chat")
    )
      throw Error("Twitch authorization lacks the required chat scope.");
    const pinned = this.store.setting("broadcasterId");
    if (pinned && pinned !== identity.user_id)
      throw Error(
        "This installation belongs to a different broadcaster. Use the original account.",
      );
    this.store.setting("broadcasterId", identity.user_id);
    this.store.setting(
      "tokens",
      this.seal({
        ...tokens,
        expiresAt: Date.now() + tokens.expires_in * 1000,
      }),
    );
    this.broadcaster = identity.user_id;
    this.name = identity.login;
    this.socket?.close();
    this.connect();
  }
  markGap(message: string) {
    this.gap = message;
    for (const r of this.store.all())
      if (r.state === "open") {
        r.disrupted = true;
        this.store.save(r);
      }
    this.changed();
  }
  connect(url = "wss://eventsub.wss.twitch.tv/ws", migrating = false) {
    if (!/^wss:\/\/eventsub\.wss\.twitch\.tv\//.test(url))
      throw Error("Unexpected Twitch reconnect host.");
    this.stopped = false;
    this.status = "connecting";
    this.changed();
    const previous = this.socket;
    const ws = this.socketFactory
      ? this.socketFactory(url)
      : new WebSocket(
          url,
          process.env.HTTPS_PROXY
            ? { agent: new HttpsProxyAgent(process.env.HTTPS_PROXY) }
            : {},
        );
    this.socket = ws;
    let keepalive = 15;
    const beat = () => {
      if (this.watchdog) clearTimeout(this.watchdog);
      this.watchdog = setTimeout(() => ws.close(), (keepalive + 5) * 1000);
    };
    ws.on("message", async (raw) => {
      try {
        const m = JSON.parse(raw.toString());
        beat();
        const type = m.metadata.message_type;
        if (type === "session_welcome") {
          keepalive = m.payload.session.keepalive_timeout_seconds || 15;
          if (migrating) previous?.close();
          else
            for (const event of [
              "channel.chat.message",
              "channel.chat.message_delete",
              "channel.chat.clear_user_messages",
              "channel.chat.clear",
            ])
              await this.helix("eventsub/subscriptions", {
                type: event,
                version: "1",
                condition: {
                  broadcaster_user_id: this.broadcaster,
                  user_id: this.broadcaster,
                },
                transport: {
                  method: "websocket",
                  session_id: m.payload.session.id,
                },
              });
          this.status = "connected";
          this.changed();
        } else if (type === "session_reconnect") {
          this.connect(m.payload.session.reconnect_url, true);
        } else if (type === "revocation") {
          this.markGap("Twitch revoked a subscription. Reconnect to continue.");
          this.revoke();
        } else if (type === "notification") {
          const e = m.payload.event;
          this.lastMessage = Date.now();
          this.ingestionLagMs = Math.max(
            0,
            Date.now() - Date.parse(m.metadata.message_timestamp),
          );
          if (this.ingestionLagMs > 5000 && !this.gap)
            this.markGap(
              "Ingestion lag exceeded 5 seconds. Review participation fairness before confirming an outcome.",
            );
          if (m.payload.subscription.type === "channel.chat.message")
            this.store.ingest({
              id: e.message_id,
              delivery: m.metadata.message_id,
              text: e.message.text,
              userId: e.chatter_user_id,
              name: e.chatter_user_name,
              sourceAt: Date.parse(m.metadata.message_timestamp),
            });
          else if (
            m.payload.subscription.type === "channel.chat.message_delete"
          )
            this.store.moderate(undefined, e.message_id);
          else if (
            m.payload.subscription.type === "channel.chat.clear_user_messages"
          )
            this.store.moderate(e.target_user_id);
          else if (m.payload.subscription.type === "channel.chat.clear")
            for (const c of this.store.all().flatMap((r) => r.calls))
              this.store.moderate(c.userId);
          this.changed();
        }
      } catch (e) {
        this.markGap(
          e instanceof Error ? e.message : "Twitch processing failed",
        );
      }
    });
    ws.on("error", () => {
      if (this.socket === ws)
        this.markGap("EventSub connection failed. Calls may be missing.");
    });
    ws.on("close", () => {
      if (this.socket !== ws || this.stopped) return;
      this.status = "disconnected";
      this.markGap(
        "EventSub disconnected. Events during this gap are not replayed.",
      );
      this.retry = setTimeout(() => this.connect(), 5000);
    });
  }
  revoke() {
    this.store.db
      .prepare("DELETE FROM settings WHERE key LIKE 'session:%'")
      .run();
    this.store.setting("overlayHash", randomBytes(32).toString("hex"));
    this.disconnect();
  }
  disconnect() {
    this.stopped = true;
    clearTimeout(this.retry);
    clearTimeout(this.watchdog);
    this.socket?.close();
    this.socket = undefined;
    this.status = "disconnected";
    this.store.setting("tokens", "");
    this.changed();
  }
}
