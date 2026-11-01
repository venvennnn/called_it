# Architecture and trust boundaries

React/Vite/Tailwind → same-origin Fastify API + WebSocket → one SQLite owner. Vite proxies `/api`, `/auth`, `/ws` during development; the backend serves the built SPA in production.

`packages/shared/src/index.ts`: deterministic confidence/score/aggregate/standings/calibration functions and Zod publication schema.

`apps/server/src/store.ts`: explicit `BEGIN IMMEDIATE` transitions, frozen snapshot, durable message and delivery identity, ordered effective forecast documents, resolution history, idempotency results, audit and session metadata. Migrations run on startup from `migrations/001_initial.sql`. Node 24 native SQLite requires no compilation toolchain. Database work is synchronous and serialized in one process; no horizontal scaling claim.

`apps/server/src/twitch.ts`: encrypted tokens; single-flight refresh; validation; own-channel subscriptions; welcome/keepalive/reconnect/revocation; normalized messages through the same Store ingestion used by replay/demo. On a gap, every open round is disrupted. Late arrival cannot bypass deadline by claiming an old timestamp. Snapshot locking and message ingestion share the serialized database writer.

`apps/server/src/index.ts`: signed owner cookies, browser-bound OAuth state, owner rate limit/CSRF/origin checks, Zod parsing, expected round version and idempotency checks. HTTPS is mandatory for live production. Overlay token fragments bootstrap a signed cookie; hashes are compared in constant time and overlay endpoints remain read-only. Credential rotation closes existing overlay sockets. Public open payloads withhold aggregate and raw calls unless the round's frozen public-distribution flag permits it. Chat text is rendered as React text, never HTML.

Rounds carry channel and session identifiers. The current installation pins one live broadcaster, and demo/live/replay use distinct databases. This is not a multi-tenant API: separate installations/databases are required for another channel. The first five rounds per session form its predeclared series; session archive export preserves prior sessions. Live owner cookies expire after 24h; no role may outlive revoked authorization on a WebSocket.

Broadcasts coalesce visual state on a roughly 1-second timer; durable ingestion happens synchronously first. Current implementation also sends immediate snapshots for command activity. A slow client is disconnected at 1 MiB buffered output and recovers a full snapshot. Snapshots expose measured EventSub timestamp-to-arrival lag and a >5-second lag flags disruption. Adaptive visual batching remains unimplemented. Do not interpret its short load test as a production high-scale guarantee.

Storage intentionally uses JSON documents for rounds/locked forecasts plus normalized uniqueness/provenance tables. Scores are recomputed, not stored as mutable totals. This differs from the fully normalized aspirational entity model in SPEC.md. `BUILD_LOG.md` distinguishes implemented and unverified capabilities.
