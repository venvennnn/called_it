# Called It
**Make your prediction. Put your confidence on record.**

A Twitch forecasting companion with a persistent local backend, an operator dashboard, and a transparent OBS source. Free internal forecasting scores; no money, wagers, Twitch Channel Points, or paid influence.

## Run locally
Node **24 LTS** and npm are required (`.nvmrc`). From this repository:

```sh
npm ci
npm run dev
```

Open the Vite address shown in the terminal (default port 5173). The API runs on 3001. A visibly labeled Demo starts with three completed rounds and a locked fourth round. The game scene and director portrait are original illustrative SVG fixtures, not a live video feed. The header accurately reports Demo source, not a fabricated Twitch connection.

No credentials are needed for Demo. Resolve the current round, create a question, and use **Settings → Demo sandbox** to submit `!call <round> no 80`. Lock, confirm No, and find the exact score **96** in History. One process owns the SQLite database. Data persists across restarts; refreshing never reopens a locked round.

### Demo testing: multiple votes
In **Settings → Demo sandbox**, enable **Count every message as a separate vote** to add multiple votes with the same display name. This Demo-only switch defaults off and persists across refreshes. It affects new sandbox messages; previous test votes remain when switched off. `!uncall <round>` withdraws all that viewer’s open votes. Test votes contribute to the distribution and scores. Live Twitch calls keep one effective forecast per account.

The live room now shows a probability histogram with vote counts, crowd average, median, and keyboard/hover bucket details. To watch it fill during an open round, enable **Show distribution while calls are open** when creating the question; otherwise it appears at lock.

### macOS / Linux
Install Node 24 from nodejs.org or your existing version manager (`nvm install && nvm use` with nvm), then run the commands above. To configure live mode: `cp .env.example .env`, edit locally, and follow [TWITCH_SETUP.md](TWITCH_SETUP.md).

### Windows PowerShell
Install Node 24 LTS, open PowerShell in the repository, run `npm ci` and `npm run dev`. Use `Copy-Item .env.example .env` when configuring live mode. No Bash-specific runtime scripts are required.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | API watcher + Vite, proxied API/auth/WebSocket |
| `npm run build` | Type checking + production frontend |
| `npm start` | One-origin production server, default 3001 |
| `npm run typecheck` / `npm run lint` | TypeScript static checks; lint also checks Prettier formatting |
| `npm test` | Scoring, database and mocked Twitch tests |
| `npm run test:e2e` | Chromium director + read-only OBS checks |
| `npm run test:load` | Timed synthetic throughput / duplicate-delivery smoke; writes measured JSON |
| `npm run replay -- tests/fixture.jsonl` | Explicitly separate Replay database |

For browser tests, set `CHROMIUM_PATH` to an installed Chromium binary if `/usr/bin/chromium` is absent. Alternatively install Playwright Chromium and update the local executable setting. Browser tests use a dedicated disposable database; do not aim them at your actual session.

## Configuration and deployment
See `.env.example`. Demo defaults to `.data/demo.sqlite`; **live must use `.data/live.sqlite`**. The root `.env` is loaded in development and production, regardless of the workspace command directory. Generate each local secret separately:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Never commit `.env`, session cookies, tokens, or database files. Tokens use AES-256-GCM. The first authorized live broadcaster is pinned to this installation. Owner cookies expire after 24 hours; token revocation ends owner sessions and invalidates overlay access. OAuth callbacks and access tokens are not logged. Live production requires HTTPS. Run behind a TLS reverse proxy with WebSocket upgrades and persistent storage. Do not use a request-only serverless host.

```sh
npm ci
npm run build
# Set APP_ORIGIN to your public HTTPS origin and APP_MODE=live.
npm start
```

`GET /api/health` checks process/database startup. Docker is optional: `docker build -t called-it .`, then run with `--env-file .env -e DATABASE_PATH=/data/live.sqlite -v called-it-data:/data -p 3001:3001`. Place HTTPS in front. A production Demo requires an explicit `ALLOW_PUBLIC_DEMO=true`; it grants public demo-owner access and is for a disposable demonstration only.

## What is implemented / limits
- Binary publish, immutable criterion/deadline, automatic/manual lock, confirmation, void, reasoned corrections, history, mean-score standings, and a predeclared first-five-round series per session. New sessions preserve prior rounds in archive export.
- Durable message/delivery deduplication, deterministic replacement order, withdrawal, moderation reconstruction, locked snapshots, idempotent publication/resolution, expected round versions, and atomic resolution revisions.
- OAuth code flow, browser-bound expiring state, encrypted/rotated tokens, single-flight refresh, validation, EventSub subscriptions, reconnect migration, gap marking, and explicit disruption acknowledgment. These are covered with mocked transports; **real Twitch acceptance has not been performed**.
- Read-only revocable OBS credentials, transparent layouts, reduced-motion CSS, keyboard-accessible native controls, focus-trapped dialogs, and complete snapshot recovery. There are no replayed celebration animations. Preview audio is a local opt-in synthesized tone, not an OBS sound pack.
- Hidden open-round aggregate; session standings are exploratory. Series requires every nonvoid round, at least three resolved rounds, and completion before final ranks. Crowd calibration has count safeguards and uses one crowd forecast per round.

This is a **single-broadcaster, local SQLite installation**, not a multi-tenant service. Session/channel identifiers are recorded in round documents. Database rows use versioned JSON documents plus delivery, operation and resolution uniqueness tables, rather than the fully normalized entity layout proposed in SPEC.md. Scores are deterministically recomputed from locked forecasts and the current immutable resolution revision instead of incrementally adding score rows. This avoids double-counting on correction.

Remaining delivery work: real Twitch/OBS acceptance with the broadcaster and consenting testers; a longer-duration ingestion soak; optional outgoing chat acknowledgments (disabled/unimplemented); richer calibration scatter/uncertainty and opt-in personal awards; recorded video and submission. The current app does not claim validated predictive superiority or measured engagement uplift. See [BUILD_LOG.md](BUILD_LOG.md) for verified results and limitations.

## Project map
`apps/web` — React/Vite/Tailwind dashboard and transparent overlay. `apps/server` — Fastify owner API, OAuth/EventSub, SQLite migration/store. `packages/shared` — Zod input schema, pure command parsing/scoring/aggregates. See [architecture](docs/ARCHITECTURE.md), [scoring](SCORING.md), [Twitch setup](TWITCH_SETUP.md), [OBS setup](OBS_SETUP.md), and [demo script](docs/DEMO_SCRIPT.md).

The main build stays in this Codex conversation. Use **`/status`** in Codex to obtain the actual main-build session ID. No session ID, live audience, video, or submitted status has been invented.
