import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type WebSocket from "ws";
import { Store } from "../apps/server/src/store.ts";
import { Twitch } from "../apps/server/src/twitch.ts";
const tick = () => new Promise((r) => setImmediate(r));
class FakeSocket extends EventEmitter {
  close() {
    this.emit("close");
  }
  deliver(type: string, payload: unknown, id = "d") {
    this.emit(
      "message",
      Buffer.from(
        JSON.stringify({
          metadata: {
            message_type: type,
            message_id: id,
            message_timestamp: new Date().toISOString(),
          },
          payload,
        }),
      ),
    );
  }
}
test("authenticated encryption rejects tampering, tokens refresh single-flight and rotate", async () => {
  process.env.TOKEN_ENCRYPTION_KEY = "ab".repeat(32);
  process.env.TWITCH_CLIENT_ID = "test-client";
  process.env.TWITCH_CLIENT_SECRET = "test-secret";
  const store = new Store(":memory:");
  const twitch = new Twitch(store, () => {});
  const sealed = twitch.seal({
    access_token: "old",
    refresh_token: "refresh-old",
    expiresAt: 0,
  });
  store.setting("tokens", sealed);
  assert.equal(twitch.unseal().access_token, "old");
  const damaged = Buffer.from(sealed, "base64");
  damaged[30] ^= 1;
  store.setting("tokens", damaged.toString("base64"));
  assert.throws(() => twitch.unseal());
  store.setting("tokens", sealed);
  const previous = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => {
    requests++;
    await tick();
    return new Response(
      JSON.stringify({
        access_token: "new",
        refresh_token: "refresh-new",
        expires_in: 3600,
      }),
      { status: 200 },
    );
  };
  try {
    assert.deepEqual(
      await Promise.all([twitch.token(), twitch.token(), twitch.token()]),
      ["new", "new", "new"],
    );
    assert.equal(requests, 1);
    assert.equal(twitch.unseal().refresh_token, "refresh-new");
  } finally {
    globalThis.fetch = previous;
    store.db.close();
  }
});
test("EventSub welcome subscribes, duplicate delivery is ignored, deletion reconstructs, reconnect migrates, revocation closes authorization", async () => {
  const store = new Store(":memory:");
  const round = store.create({
    question: "Will EventSub work?",
    criterion: "All test deliveries are handled correctly.",
    duration: 45,
    publicDistribution: false,
  });
  const sockets: FakeSocket[] = [];
  let updates = 0;
  const twitch = new Twitch(
    store,
    () => updates++,
    () => {
      const s = new FakeSocket();
      sockets.push(s);
      return s as unknown as WebSocket;
    },
  );
  twitch.broadcaster = "42";
  const subscriptions: any[] = [];
  twitch.helix = async (_path, body) => {
    subscriptions.push(body);
    return {};
  };
  store.setting("session:example", String(Date.now()));
  twitch.connect();
  const first = sockets[0];
  first.deliver("session_welcome", {
    session: { id: "welcome", keepalive_timeout_seconds: 15 },
  });
  await tick();
  assert.equal(subscriptions.length, 4);
  assert.equal(subscriptions[0].condition.broadcaster_user_id, "42");
  assert.equal(twitch.status, "connected");
  const payload = {
    subscription: { type: "channel.chat.message" },
    event: {
      message_id: "message-a",
      message: { text: `!call ${round.id} no 80` },
      chatter_user_id: "viewer",
      chatter_user_name: "Viewer",
    },
  };
  first.deliver("notification", payload, "delivery-a");
  first.deliver("notification", payload, "delivery-a");
  assert.equal(store.get(round.id)!.calls.length, 1);
  assert.equal(store.get(round.id)!.calls[0].p, 20);
  first.deliver(
    "notification",
    {
      subscription: { type: "channel.chat.message_delete" },
      event: { message_id: "message-a" },
    },
    "delete-a",
  );
  assert.equal(store.get(round.id)!.calls.length, 0);
  first.deliver("session_reconnect", {
    session: { reconnect_url: "wss://eventsub.wss.twitch.tv/ws?migration=1" },
  });
  assert.equal(sockets.length, 2);
  sockets[1].deliver("session_welcome", {
    session: { id: "migrated", keepalive_timeout_seconds: 15 },
  });
  await tick();
  assert.equal(subscriptions.length, 4);
  sockets[1].deliver("revocation", {
    subscription: { status: "authorization_revoked" },
  });
  assert.equal(twitch.status, "disconnected");
  assert.equal(store.setting("session:example"), undefined);
  assert.equal(store.get(round.id)!.disrupted, true);
  assert.ok(updates > 3);
  twitch.disconnect();
  store.db.close();
});
