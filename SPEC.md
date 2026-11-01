Called It end to end technical specification
Product name: Called It

Tagline: Make your prediction. Put your confidence on record.
1 Instructions for the implementing Codex session
Build a complete Twitch forecasting companion that lets viewers predict outcomes, express confidence, and discover how accurate their confidence really is. Inspect the repository and applicable AGENTS.md before editing. Create a new project if needed; preserve unrelated work. Implement the application, Twitch connection, scoring, interface, OBS overlay, tests, and documentation rather than stopping at a plan or mockup.

Maintain SPEC.md, IMPLEMENTATION_PLAN.md, and BUILD_LOG.md. Resolve routine implementation choices independently. Request unavailable credentials or genuinely blocking decisions only when necessary. Never invent successful connections, performance results, or a Codex session ID. Keep the main build in one Codex thread and document how the user obtains that session ID with /status.
2 Product definition
Called It turns passive watching into a recurring forecasting competition. A streamer publishes a binary question before an attempt. Viewers submit an outcome and confidence through Twitch chat. Predictions lock, the attempt happens, and the streamer confirms the result. An animated reveal compares individual forecasts, the locked crowd forecast, and a neutral baseline.

The core is free, with no deposits, wagers, payouts, redeemable credits, or paid influence. Called It scores are internal forecasting scores, not Twitch Channel Points. Viewers need no separate login, extension, or companion website. Native Twitch Predictions are optional future integration and must never be implied by a chat command. Twitch currently documents native Predictions as restricted to Partners and Affiliates; the core application must not depend on that eligibility. [1]
3 First complete interaction
The streamer creates “Will I survive the next attempt?” and defines Yes as surviving the attempt to the agreed endpoint. The question opens for 45 seconds. The overlay displays the round ID and a command such as !call 14 yes 80. A viewer may replace their prediction while open.

At the deadline, submissions freeze. The overlay switches to “Calls locked.” Only then does the streamer begin. Afterward, the streamer selects Yes, No, or Void and confirms. Called It calculates scores, reveals strong calls and overconfident misses, and updates the session record. A user who entered No at 80 percent has a 20 percent forecast for Yes. If No occurs, their round score is 96 out of 100.
4 Scope and exclusions
Version one supports binary questions, one open round per channel, manual publication and resolution, chat commands, a local database, and transparent OBS graphics. It requires no video capture, OCR, game API, computer vision, or runtime language model.

Do not label the crowd average as a validated win probability. Do not fabricate live odds from chat sentiment. Model forecasts, game-specific telemetry, and automated resolution require separate validated adapters and are deferred. Keep this project distinct from Chatlas: the interaction is forecasting future outcomes, not selecting a preferred action. It is also distinct from Chat, Objection!: it does not adjudicate past claims through replay evidence.
5 Architecture and repository
Use a TypeScript workspace with React, Vite, Tailwind CSS, accessible controls, Fastify HTTP, WebSockets, SQLite with migrations, and shared Zod schemas. Use SVG for distributions and reliability plots. Install compatible supported stable dependencies and commit the lockfile. Record a supported Node LTS version in .nvmrc.

Organize apps/web, apps/server, and packages/shared, separating auth, Twitch transport, round state, command parsing, scoring, aggregates, persistence, and browser broadcasts. Keep scoring as a deterministic pure module. One persistent backend process owns round transitions. Use database transactions and uniqueness constraints rather than assuming the frontend prevents races.

Serve the production frontend and API from one origin. During development, proxy API, auth, and WebSocket routes through Vite. Begin with one broadcaster per installation while scoping all data by channel and session. Horizontal scaling and shared-state coordination are deferred.
6 Setup and configuration
Provide npm scripts for dev, build, start, lint, typecheck, unit tests, end-to-end tests, and load tests. Include README.md, .env.example, .gitignore, migrations, Dockerfile, health checks, and Windows PowerShell/macOS/Linux setup instructions.

Configuration: APP_ORIGIN, PORT, DATABASE_PATH, TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, SESSION_SECRET, TOKEN_ENCRYPTION_KEY, and LOG_LEVEL. Derive the callback as APP_ORIGIN plus /auth/twitch/callback. Generate secrets locally. Never commit tokens, database files, or session cookies. Validate configuration with actionable messages.

Demo mode runs without Twitch credentials using labeled fixtures. Live mode requires an actual authorized connection and received chat. Keep mode badges visible in the dashboard and overlay. Disconnects must never cause the application to silently generate synthetic calls.
7 Twitch registration and authorization
Write TWITCH_SETUP.md matching the actual routes. Register a uniquely available application name, such as Called It by Venmani, category Website Integration, client type Confidential. Explain account verification, required two-factor authentication, Client ID, and secret generation. Register the exact callback including protocol, host, port, and path.

Use authorization-code OAuth with expiring, single-use state bound to the initiating browser. Exchange codes server-side, verify the identity, and establish an HttpOnly session cookie. The initial application reads the broadcaster’s own channel using their user token. Request user:read:chat; add user:write:chat only when the broadcaster enables instruction/result messages. A separate bot account is unnecessary for this version. [2]

Encrypt persisted tokens with authenticated encryption. Validate startup authorization and revalidate hourly. Coordinate refresh with a single-flight operation, persist rotated refresh tokens, and end sessions after revocation. Disconnect stops ingestion, removes tokens, and rotates overlay access. Use HTTPS in deployment. If localhost HTTP registration is rejected, provide trusted local HTTPS or tunnel instructions and use that exact origin consistently. [3]
8 EventSub and reliable commands
Connect through EventSub WebSockets. Use the welcome session ID to create Helix subscriptions for chat and applicable message-deletion/clearing events. Use the authorized broadcaster’s ID for both the target own-channel broadcaster and subscribing user. Handle keepalive, instructed reconnect migration, ordinary reconnect/resubscription, revocation, and duplicate deliveries. Display data gaps because missed events are not replayed. [4]

Persist each normalized message with its Twitch message ID, source timestamp, arrival timestamp, arrival sequence, user ID, channel/session, deletion state, and source mode. Store delivery IDs separately. Commands affect state at most once.

Support !call <round> yes <confidence>, !call <round> no <confidence>, !uncall <round>, and !calledit. Confidence must be an integer from 50 to 100, optionally followed by a percent sign. Round IDs are mandatory to prevent a delayed message targeting the next question. Malformed commands never alter an existing forecast. Show examples on the overlay; keep optional outgoing acknowledgments rate-limited and disabled by default.
9 Canonical forecast semantics
Every round has one immutable positive proposition. Canonical probability p always means probability that Yes occurs. Convert Yes confidence c to p=c/100; convert No confidence c to p=1−c/100. Thus Yes 80 and No 20 are not interchangeable accepted commands: No 20 is invalid because directional confidence must be at least 50. A viewer who wants p=0.20 submits No 80.

Store canonical probability as an integer from 0 to 100, plus the original direction, confidence, and source message. Yes 50 and No 50 represent the same uncertainty and must score identically. Endpoint probabilities are allowed and receive the full consequence of being confidently wrong.

Each account has one effective forecast per round. A valid replacement changes it; repetition cannot increase influence. Subscriptions, donations, badges, and message frequency do not affect weight. Be explicit that this is fairness per Twitch account, not proof of one human per account.
10 Round state and information timing
States: draft, open, locked, resolved, and void. Permit at most one open round per channel. Freeze the question, Yes/No meanings, deadline, and resolution rules at publication. Editing them requires voiding and recreating the round. Use a short preset library, including survival, completion, and beating a declared time, with streamer-editable drafts.

Accept forecasts only when the backend receives them before the deadline and their source timestamp belongs to the open interval. Order replacements deterministically by source timestamp, arrival sequence, and message ID; ignore older out-of-order replacements. Do not accept post-deadline messages merely because they claim an earlier time. Use transactional state checks for concurrent close and message processing.

Hide forecasts and the crowd average while open by default, showing only participant count. Reveal the locked distribution afterward to reduce copying. Provide an explicit alternative public-distribution setting, label it, and keep it fixed for the round. Never imply hidden forecasts are confidential when viewers themselves submit visible chat messages.

The streamer starts the attempt only after locking. Broadcast delay means viewers may see the closing announcement later; show instructions early and the authoritative server countdown. If the event began or became knowable before lock, void the round rather than treating contaminated forecasts as valid.
11 Outcome confirmation and corrections
Only the authenticated owner resolves a round initially. Show its frozen criterion, lock time, participant count, and Yes/No/Void choices, followed by a confirmation step. Store the outcome, resolver, time, and optional evidence note. Mark it Streamer confirmed; never describe manual confirmation as automatic verification.

Void ambiguous, interrupted, prematurely started, or unresolvable events. Void rounds do not affect scores or eligibility denominators. If ingestion drops during the open interval, mark the round disrupted and require owner acknowledgment; default to void when fair participation cannot be established.

Corrections create a new resolution revision with a required reason. Recompute all affected aggregates from immutable effective forecasts, supersede previous score rows, and show a visible Corrected result badge. Never double-add points or silently overwrite history. Pending or failed database operations cannot trigger a result reveal.
12 Scoring mathematics
Use the single-probability binary Brier score: BS=(p−y)², where y=1 for Yes and y=0 for No. Lower is better. Translate for viewers to Round score=100×(1−BS); higher is better. Keep this scoring convention explicit because other Brier formulations sum both outcome probabilities and have a different scale.

Examples: p=0.80 and Yes gives BS=0.04 and score 96. The same forecast with No gives BS=0.64 and score 36. p=0.90 and No gives score 19. p=0.50 gives score 75 for either result. A perfect endpoint forecast scores 100; the opposite endpoint scores zero.

Calculate from integer probability percentages with exact squared-error numerators where possible; round only for display. Show the formula and worked examples in How scoring works. Brier scoring rewards truthful probability reporting in expectation; one high score does not establish forecasting skill. Never award a separate accuracy bonus that changes the intended incentive.
13 Leaderboards and entertaining reveals
Use two leaderboard contexts. Casual session standings show mean round score and completed-round count, labeled exploratory because entrants may have answered different questions. Do not rank by total score, which primarily rewards participation.

For a comparable competition, offer a predeclared five-round Series. Series standings require forecasts on every nonvoid round in the fixed set. Until completion, show provisional standings; incomplete entrants remain visible without a final rank. If fewer than three nonvoid rounds remain, label the series insufficient for final ranking. This avoids inventing a penalty for missing forecasts.

Round awards: Sharpest call for highest score, Crowd surprise for a result the locked average considered unlikely, and Confidence check for an overconfident miss. Ties share awards. Playful personal teasing is opt-in; default to neutral language. Avoid implying volume or confidence equals actual loudness. Public display names are configurable and should respect moderation removals.
14 Crowd forecasts and calibration
At lock, compute the equally weighted arithmetic mean of effective probabilities. Preserve forecast count, distribution, median, and interquartile range. Label the line Crowd forecast, never Model win probability. Do not derive money-like odds or imply trade execution.

During open rounds, hidden-mode aggregate updates stay owner-private or are withheld. At lock, save the complete eligible snapshot and aggregate atomically. Later moderation may hide names but must not silently rewrite an already locked aggregate.

After outcomes accumulate, plot predicted probability against observed Yes frequency in bins. Show count per bin, raw scatter/history, and uncertainty where supported. Default minimum is 20 resolved forecasts overall and five observations per displayed bin; otherwise show Not enough history. These are display safeguards, not proof of statistical sufficiency or independent observations.

Personal calibration uses one viewer’s resolved rounds; crowd calibration uses one locked crowd forecast per round. Never pool hundreds of viewers from the same event as independent crowd outcomes. Optional Brier skill relative to p=0.50 must use the same evaluated rounds, disclose the baseline, and allow negative values.
15 Dashboard visual design
Use a white background, near-black typography, subtle gray dividers, teal/emerald for primary actions, cobalt for Yes, and muted coral for No. Prefer a distinctive serif headline and clean sans-serif controls, with tabular numerals. Avoid casino imagery, betting slips, purple gradients, neon dashboards, and unnecessary metric-card grids. Use proper names without underscores.

Navigation: Live room, Results, Leaderboard, History, and Settings. Header shows channel, session, source mode, connection state, and OBS preview. The main area emphasizes the current question, its state, deadline, participant count, and command syntax. A right operator panel provides draft templates, locking, resolution, and cancellation.

While open, show a calm confidence-entry explanation and incoming accepted-call activity without broadcasting private annotations. Once locked, reveal a readable probability distribution. After resolution, show the actual outcome, a few forecasts with their scores, the crowd forecast, and a concise explanation. Give the next question a clear creation path without cluttering the reveal.
16 OBS overlay and accessibility
Provide transparent Compact, Forecast, Locked, Results, and Series layouts with a 1920×1080 preview canvas and configurable safe placement. Compact shows question, round ID, countdown, and a legible command. Locked shows the frozen crowd forecast and “No more calls.” Results show the outcome and selected scores. Keep game action visible.

Implement reveal-once event IDs so OBS refresh or reconnect restores state without repeating celebrations. Include Clear overlay, reduced motion, muted-by-default original sound effects, keyboard controls, visible focus, and accessible text alternatives. Charts must remain understandable without color alone.

Use a random revocable read-only overlay credential, store its hash, and bootstrap from a URL fragment into a restricted session. Protect overlay HTTP, media, and WebSocket access by role. Overlay credentials cannot create, lock, resolve, or inspect secret-bearing configuration. Document OBS Browser Source dimensions, transparency, URL handling, and reconnect checks.
17 Persistence and security
Entities: ChannelConnection, OwnerSession, StreamSession, Round, ForecastRevision, LockedForecast, ResolutionRevision, Score, Series, SeriesRound, OverlayCredential, and AuditEvent. Add unique constraints for delivery/message IDs, effective account forecasts, resolution versions, and score provenance. Use foreign keys and channel/session scope throughout.

Preserve forecast revisions until lock. On deletion of an open-round forecast message, remove that revision and reconstruct from remaining valid revisions; uncall explicitly creates an empty effective forecast. At lock, freeze the active snapshot. Later message deletion suppresses attribution, while corrections or explicit voiding are required to alter scored outcomes. Provide this policy in settings.

Escape chat text, validate all input, rate-limit owner mutations, enforce CSRF protection, check browser WebSocket origins, and authorize every endpoint. Do not fetch arbitrary URLs supplied in chat. Endpoints must not expose tokens, private session details, or other channels’ data.
18 API and live updates
Implement auth start/callback/disconnect, connection status, session lifecycle, round drafts/publication/locking/resolution/void/correction, series management, forecast history, leaderboard, aggregate history, overlay rotation, and data deletion. Consequential mutations require idempotency keys and expected round versions. Return clear conflicts instead of overwriting concurrent actions.

Broadcast schema-versioned events for connection status, round state, participant count, locked aggregate, resolution, leaderboard, and overlay stage. Separate owner and public payloads. A reconnect receives a complete current snapshot and revision and ignores older messages.

Persist calls immediately and batch visual updates around 250–1000 milliseconds. Backpressure may drop decorative activity events, never silently drop forecast processing. Track ingestion lag. If lag threatens deadline integrity, mark the round disrupted and expose the issue instead of claiming fair real-time operation.
19 Tests and verification
Unit-test canonical conversions, boundaries, malformed commands, explicit round IDs, replacements, withdrawals, duplicates, ordering, deadlines, outcome symmetry, all worked scores, ties, voids, correction recomputation, series eligibility, and calibration denominators. Property tests should confirm scores stay within range and p versus 1−p is symmetric when outcomes flip.

Integration tests cover OAuth state rejection, token refresh, EventSub welcome/reconnect/revocation, message deletion, lock-versus-message races, idempotent resolution, persistent restart, and owner/overlay authorization. Playwright covers question creation through reveal, keyboard operation, mode badges, OBS recovery, and attempted overlay mutation.

Add a timestamped JSONL replay through the same normalization pipeline. Synthetic fixtures remain visibly Demo; consented captures remain Replay. Isolate namespaces and never mix simulated participants into a live round. Measure 50 messages per second sustained and short 200-per-second bursts as engineering targets on declared hardware. Report achieved latency, correctness, and memory honestly.
20 Build sequence and delivery
Implement deterministic scoring and round states first, then a polished Demo workflow, real Twitch OAuth/ingestion, atomic forecast locking, persistent scoring and series, OBS, moderation, and recovery. Keep features complete before adding automation. No runtime model is required; Codex’s value must be demonstrated through the actual engineering work.

Deliver README, TWITCH_SETUP, OBS_SETUP, SCORING, architecture notes, .env.example, migrations, tests, measured results, and a demo script. Provide local one-command startup and optional single-instance Docker deployment with HTTPS and persistent SQLite storage. Persistent EventSub connections need a long-running host, not request-only serverless execution.

Manual live acceptance: connect the broadcaster’s account, publish a question, receive real participants’ calls, replace a forecast, lock, begin the attempt, confirm the outcome, verify exact scores, and reveal in OBS. Verify restart does not reopen a locked round or duplicate results. Without an audience, use consenting testers with real Twitch accounts; do not impersonate organic participation.
21 Hackathon video and submission
Record 150–175 seconds: introduce the confidence problem, show an actual question and Twitch calls, lock before the attempt, confirm the result, reveal contrasting scores, and show real Codex build footage. A small real Twitch demonstration is sufficient to show the interaction; labeled fixtures may illustrate additional scale but cannot replace the live integration.

Submit the runnable repository with assets/instructions, a description explaining features and Codex use, the actual main-build session ID, and a public or unlisted YouTube video under three minutes. Confirm Submitted status. Keep this entry substantially different from Chatlas and Chat, Objection! Freeze submitted repository, video, and links after the deadline until winners are announced. [6]

Judge the result equally on innovation, impact, implementation, and design. Do not claim calibrated predictive superiority, universal audience reach, or engagement uplift without appropriate evidence. The product succeeds when viewers understand the question, can submit a meaningful forecast, and enjoy an accurate, transparent reveal.
Implementation references
Sources checked 1 November 2026; recheck current requirements during implementation.
1. Native Twitch Predictions: https://dev.twitch.tv/docs/api/predictions/
2. Chat authentication: https://dev.twitch.tv/docs/chat/authenticating/
3. OAuth registration, authorization, validation, refresh: https://dev.twitch.tv/docs/authentication/
4. EventSub subscriptions and reconnects: https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/ and https://dev.twitch.tv/docs/eventsub/handling-websocket-events/
5. API operations and chat sending: https://dev.twitch.tv/docs/api/reference/
6. Submission rules and organizer guidance: https://twitchcon-codex.devpost.com/rules and https://twitchcon-codex.devpost.com/updates/47341-final-weekend-make-your-project-come-alive