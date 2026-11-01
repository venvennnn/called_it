# Build log

Main build: this single Codex conversation, 1 November 2026. No delegated build sessions. Obtain the actual session ID with `/status`; none is invented here.

## Delivered
- Created the empty repository's Node 24 / npm TypeScript workspace, React/Vite/Tailwind UI, Fastify/WebSocket backend, SQLite migration and shared deterministic scoring.
- Implemented the provided visual direction with serif headlines, white/emerald/cobalt/coral palette, persistent navigation, locked director view, illustrative game scene, transparent forecast overlay, confirmation workflow, results, history, standings and settings. SVG game/portrait artwork is original Demo illustration.
- Implemented publish, authoritative deadline, replacement/withdrawal/moderation, atomic lock, confirmation, void, reasoned correction, session archive export and fixed first-five-round Series. Stored messages/deliveries/operations/resolution provenance avoid duplicate influence and score accumulation.
- Added Twitch OAuth state binding, encrypted tokens, refresh coordination, validation, own-channel EventSub subscriptions, reconnect migration, revocation and disruption handling. Demo/live/replay storage stays isolated.
- Added revocable read-only OBS credential bootstrap, role checks, transparent layouts, snapshot restoration, native keyboard controls, dialog focus trap, and reduced-motion styling.
- Added setup, scoring, Twitch, OBS, architecture, demo and deployment instructions, `.env.example`, Dockerfile and committed dependency lockfile.

## Verified in the cloud machine
- `npm run build`: passed (TypeScript + production Vite build). Upstream Zod annotation warnings are nonfatal.
- `npm run lint`: passed (Prettier + TypeScript), after final formatting.
- `npm test`: **11 passed**, none skipped. Includes all integer scoring symmetry/bounds, canonical semantics, deadlines, replacements, withdrawal, duplicates, moderation reconstruction, frozen lock, correction, void, restart, series, sessions, token encryption/tamper, single-flight refresh, mocked EventSub welcome/migration/revocation/deletion.
- `npm run test:e2e`: **2 passed**, none skipped, using installed Chromium and disposable `.data/e2e.sqlite`. Covers publication → call → lock → confirmation → exact 96 score, history, OBS refresh, rejected overlay mutation, invalid OAuth state, CSRF/origin rejection, version conflict, idempotent resolution, unauthenticated read rejection and mobile overflow.
- Final initial locked dashboard captured at desktop size; no horizontal overflow. Mobile captured and visually inspected; overlay resized for its smaller canvas.
- `npm run replay -- tests/fixture.jsonl`: **3 accepted revisions, 2 effective accounts**, Replay namespace.
- `npm run test:load`: **900 accepted unique messages**, each delivered twice; **100 effective accounts**. 50/s for 10 seconds plus 200/s for 2 seconds. 12,010ms total; processing p50 0.201ms, p95 0.487ms, max 3.995ms; RSS 86 MiB. AMD EPYC 9V74, 5 available logical CPUs, 33 GiB reported memory. See `docs/load-results.json`. Local processing smoke only, not Twitch network latency or a long soak.
- Production instance on a separate disposable database: health response and built HTML served successfully from one origin.

## Unverified / remaining
No Twitch credentials were present. OAuth/EventSub behavior has mocked transport coverage, not an actual authorized broadcaster/audience run. Actual OBS compositing, Docker build/run, public HTTPS deployment, a long soak, video recording and external submission have not been executed. These must not be presented as passed.

The implementation uses documented JSON-backed round documents rather than every normalized entity in SPEC.md. No optional chat sending; no runtime LLM, native Twitch Predictions, game capture, automatic outcome verification, personalized teasing, or predictive superiority claim. Calibration offers guarded crowd bins, not full personal scatter/uncertainty analysis. Ingestion lag is exposed in snapshots with disruption after five seconds; adaptive broadcast batching remains an extension. Live acceptance needs the broadcaster's secure environment configuration and consenting real testers.

## Environment
The provided command sandbox blocks network/listening sockets. Package installation and runtime/browser tests worked through the normal configured proxy outside that command sandbox; TLS verification remained enabled. Playwright's browser download was policy-denied, so tests used the existing `/usr/bin/chromium`. Network draft includes Twitch service hosts and browser distribution hosts; a saved draft does not apply/publish runtime policy or prove EventSub reachability.
