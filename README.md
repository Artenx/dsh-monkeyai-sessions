# DSH MonkeyAI Sessions

English | [简体中文](README.zh.md)

Read and continue your MonkeyAI conversations inside DeepSeek Harness.

Browse the sessions on your MonkeyAI devices, open one to read its full conversation history, and send new instructions to carry on the work you started in the MonkeyAI client — no copy-pasting context, no restarting the task. Replies stream back live, and you can stop a running turn or switch models without leaving DSH.

Authorization uses the MonkeyAI OAuth authorization-code flow with PKCE; DSH stores the resulting grant in its credential store.

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

Three ways to connect, in order of convenience:

- **Sign in (default)**: enter the MonkeyAI server origin, account email, and password in the panel. The Host performs the whole OAuth exchange server-side — it logs in, opens an authorization request, approves it, and exchanges the returned code — so nothing has to come back from the browser. This is the only mode that works when the browser runs on a phone or any machine other than the DSH Host. The password is used for those requests only and is never stored; the panel clears the field on success.
- **Browser authorization (loopback)**: the Host listens on `127.0.0.1` with a random port and the MonkeyAI server redirects to `http://127.0.0.1:<port>/oauth/callback`. When the browser shares the Host's machine the callback page posts the code back to the panel and the grant completes with no copy-paste. A remote browser cannot reach that loopback address, so use sign-in instead.
- **Paste callback (scheme)**: the original `monkeyai-desktop://oauth/callback` redirect for environments where loopback is rejected.

All three request `device:connect`, `session:read`, and `session:control` through the registered `monkeyai-desktop` public client. OAuth state and the PKCE verifier stay in the DSH Host process.

## Sessions

Full conversation history is loaded over the runtime's HTTP read channel (`POST {http_base}/read/session` with `_monkeyai/session/messages`, paginated by cursor) instead of the bounded ACP `session/load` replay, so long sessions show every turn including the latest replies. After mounting the session with the same `historyHTTP` capabilities as the MonkeyAI client, the panel subscribes to ACP live updates: messages and assistant chunks started in the MonkeyAI desktop client appear as they stream, without refreshing. For large replies persisted by the runtime, `history_changed` triggers a cursor-based HTTP delta refresh and replaces any partial snapshot. A status badge next to the session title shows the turn state (running / idle / error / interrupted), driven by the runtime's `_monkeyai/session/state` notifications, so turns started from the MonkeyAI desktop client also show as running; when the panel opens while a turn is already in flight, the host fetches the current state to seed the badge. While a turn is running (from either side) the composer shows a stop button that sends `session/cancel`; the model switcher uses `_monkeyai/session/model/set` on the live session connection. Assistant messages render lightweight markdown (code blocks, inline code, bold, headings, lists).

## Installation

From npm, once published:

```sh
dsh plugin --profile web add dsh-monkeyai-sessions
```

From the plugin market index: enable **Custom plugin indexes** under Plugins → Experimental plugins, open **Discover**, and add this index source:

```
https://artenx.github.io/dsh-monkeyai-sessions/index.json
```

From a checkout:

```sh
npm install
npm run build
npm pack
dsh plugin --profile web add ./dsh-monkeyai-sessions-0.1.12.tgz
```

Verified against a real DSH `0.2.2-rc.1` web profile and a live MonkeyAI runtime: authorization, full history loading, prompt delivery, model switching, and turn cancellation all work end to end.

## Publishing

The package declares a DSH bundle (`dsh.bundle.patch`), a web Client (`dsh.client`), and `engines.dsh`. Host-provided modules resolve through the running DSH installation, so the only peer dependency is `@deepseek-ai/cordis`.

```sh
# Build the Client bundle and the market index
npm run build
npm run build:market

# Publish the package (requires an npm account with publish rights)
npm publish --access public
```

`scripts/build-market-index.mjs` reads published versions and their publish times from the npm registry, falling back to the current `package.json` version before the first release. The resulting `market/index.json` follows plugin market index format 1 and is deployed to GitHub Pages by `.github/workflows/market-index.yml`. Set `MARKET_INDEX_URL` to override the printed index address.

## License

MIT
