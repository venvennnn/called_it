# Connect your own Twitch channel

Demo requires no Twitch application. Live mode requires a broadcaster-owned Twitch developer registration and real authorization. Do not confuse Called It chat commands with native Twitch Predictions, which have separate eligibility restrictions.

1. Verify your Twitch account email and enable two-factor authentication as required by Twitch developer registration.
2. In the Twitch developer console, register a uniquely available name (for example, “Called It by Venmani”), category **Website Integration**, client type **Confidential**. Availability must be checked by the owner.
3. Set the exact OAuth redirect to **APP_ORIGIN + `/auth/twitch/callback`**. Development example: `http://localhost:5173/auth/twitch/callback`. Production example: `https://your-domain.example/auth/twitch/callback`.
4. Copy the Client ID and generate the client secret. Enter values in a local ignored `.env` or secure environment settings, never in chat or Git.
5. Set `APP_MODE=live`, `DATABASE_PATH=.data/live.sqlite`, your exact `APP_ORIGIN`, `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, and independently generated `SESSION_SECRET` and `TOKEN_ENCRYPTION_KEY` (64 hex characters). Restart the server.
6. Open the application and choose Connect Twitch. `/auth/twitch` requests **user:read:chat**; the broadcaster's own authorized user ID is both broadcaster and subscribing user. No separate bot account or Affiliate/Partner status is required for this core chat workflow. The implementation does not request `user:write:chat` or send chat messages.
7. `/auth/twitch/callback` checks expiring, single-use state bound to a signed initiating-browser cookie, exchanges the code on the server, verifies identity/scopes, and establishes an HttpOnly owner session.

The first broadcaster is pinned; another account cannot silently take over the same installation. Tokens are encrypted at rest, validated on startup and hourly, refreshed in a single flight, and rotated refresh tokens persist. Disconnect removes the tokens, owner sessions, and old overlay access. Get a new OBS link after reconnecting.

## Network
Required HTTPS hosts: `id.twitch.tv`, `api.twitch.tv`. EventSub requires a long-lived WSS connection to `eventsub.wss.twitch.tv` on 443 and proxy WebSocket support. The app honors `HTTPS_PROXY` for REST and WebSocket transport and keeps certificate verification enabled. A saved allowlist is not proof of current WSS reachability; test the actual connection. No live credentials or network acceptance were available during this build.

If Twitch rejects plain HTTP localhost, use a trusted local HTTPS reverse proxy or your HTTPS tunnel of choice. Set APP_ORIGIN to that exact origin and register that exact callback. Update OBS links after changing origins. Do not disable TLS verification or add alternate redirects by guesswork.

## Live acceptance (owner required)
Connect, verify the badge says Live and EventSub connected, and receive a real consenting tester's chat message. Open a clear 45-second question. Submit `!call <round> no 80`, replace while open, and withdraw with `!uncall <round>`. Verify one effective forecast per account. Lock **before** the attempt starts. Confirm the actual outcome and check a known score (No 80 + No = 96). Verify the OBS source, then restart and confirm the locked/resolved state and reveal do not repeat.

EventSub gaps are not replayed. A dropped connection during an open round marks it disrupted; void unless the owner can establish fair participation. Native chat display/broadcast delay does not extend the authoritative server deadline.

References to recheck when registering: https://dev.twitch.tv/docs/authentication/ , https://dev.twitch.tv/docs/chat/authenticating/ , https://dev.twitch.tv/docs/eventsub/handling-websocket-events/ . Live integration is not certified solely by the mocked transport tests.
