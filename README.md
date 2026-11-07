# DSH MonkeyAI Sessions

A DeepSeek Harness plugin for viewing and interacting with sessions owned by a remote MonkeyAI client. The first version uses the MonkeyAI OAuth authorization-code flow with PKCE. DSH stores the resulting grant in its credential store.

## Development

The plugin targets DSH `v0.2.2-rc.1` and Node.js `>=24.9.0`.

```sh
npm test
npm run build
```

`npm test` builds the Client bundle before running tests. The build generates `client.js` and `lib/client-runtime.cjs`; both artifacts are distributed with the package.
Tests load the generated Client bundle, validate unary and duplex stream descriptors, check the `main` and `sidebar.panellist` registrations, verify stream and Remote cleanup on unload, and test PKCE state/challenge construction.
Host-service and Host-stream tests use credential-store, fetch, and WebSocket fakes to cover authorization exchange, device/session scoping, connection tickets, history and live frames, prompt delivery, connection loss, permission revocation, and read-only rejection.

The Host registers invocation descriptors through `ctx.typert`. The Client mounts the package's Remote contribution with `$mount()`. Shared Remote metadata uses the protocol package's `remote-info` entry, which has no Cordis runtime import.
The Client bundle inlines a spec-compatible copy of that factory (`src/shared/remote-info-lite.mjs`): DSH materializes only the modules listed in `dsh.client.inject`, and the protocol package's subpath entries are not seed words there.

## Authorization

The panel uses DSH's light theme for a consistent, simple look. The layout is state-driven: an unconnected panel shows a single connect card (server origin plus one primary button, with the paste-callback mode collapsed), a connected panel shows a compact toolbar (account, device, one Refresh action that loads devices and sessions together, disconnect) above the session cards, and an open session focuses the conversation with a compact header (back button, title, model switcher), an approval card with plain option buttons instead of raw JSON, and an Enter-to-send composer. Secondary actions (adding a device by machine ID, creating a new session) stay collapsed in details sections.
The device list reads the account-wide endpoint directory (`GET /api/v1/endpoints`, no runtime-API header) so every registered device appears, marking `online` from the boolean field and skipping revoked entries. Selecting a device loads its sessions automatically. Headless runtime devices that register through the separate device-code grant may not appear in that directory; for those, add a device manually by machine ID ("Device missing?..." section in the panel) - the entry is kept in browser storage and merged into the device selector.

Two authorization modes are available in the panel:

- **Automatic callback (loopback)**: the Host listens on `127.0.0.1` with a random port and the MonkeyAI server redirects to `http://127.0.0.1:<port>/oauth/callback` (officially allowed for the `monkeyai-desktop` client). On desktop the grant completes with no copy-paste; on phones the OS shows a failed connection page whose address bar keeps the full callback URL to paste as a fallback.
- **Paste callback (scheme)**: the original `monkeyai-desktop://oauth/callback` redirect for environments where loopback is rejected.

Both modes request `device:connect`, `session:read`, and `session:control` through the registered `monkeyai-desktop` public client. OAuth state and the PKCE verifier stay in the DSH Host process; the Host answers the loopback callback itself and the panel polls `authorizationStatus`.

## Sessions

Full conversation history is loaded over the runtime's HTTP read channel (`POST {http_base}/read/session` with `_monkeyai/session/messages`, paginated by cursor) instead of the bounded ACP `session/load` replay, so long sessions show every turn including the latest replies. While a turn is running the composer shows a stop button that sends `session/cancel`; the model switcher uses `_monkeyai/session/model/set` on the live session connection. Assistant messages render lightweight markdown (code blocks, inline code, bold, headings, lists).

## Installation

```sh
npm install
npm run build
npm pack
dsh plugin --profile web add ./dsh-monkeyai-sessions-0.1.0.tgz
```

Verified against a real DSH `0.2.2-rc.1` web profile and a live MonkeyAI runtime: authorization, full history loading, prompt delivery, model switching, and turn cancellation all work end to end.
