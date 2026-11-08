import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { credentialKey, credentialKeyId, credentialKeyScope } from '@deepseek-ai/dsh-credentials'
import { openAcpJsonRpc } from '../shared/acp-json-rpc.mjs'
import { AsyncQueue } from '../shared/async-queue.mjs'
import {
  createAuthorizationRequest,
  createRefreshForm,
  createTokenForm,
  MONKEYAI_REDIRECT_URI,
  MONKEYAI_SCOPES,
  normalizeServerOrigin,
  normalizeTokenResponse,
  parseAuthorizationCallback,
} from '../shared/oauth-pkce.mjs'
import { MonkeyAIHttpError, requestJson } from '../shared/http-json.mjs'
import { PACKAGE_NAME, SERVICE_KEY } from '../remote.js'

const OAUTH_REQUEST_TTL_MS = 10 * 60 * 1000
const MIN_ACCESS_TOKEN_TTL_MS = 30 * 1000
const ACP_CLIENT_INFO = Object.freeze({ name: PACKAGE_NAME, version: '0.1.0' })

function accountIdFor(origin, userId) {
  const suffix = typeof userId === 'string' && userId !== ''
    ? createHash('sha256').update(userId).digest('hex').slice(0, 12)
    : 'shared'
  return `srv-${createHash('sha256').update(origin).digest('hex').slice(0, 12)}-${suffix}`
}

function accountIdForOrigin(origin) {
  return accountIdFor(origin, undefined)
}

function grantKey(accountId) {
  return credentialKey(PACKAGE_NAME, accountId)
}

// The endpoint directory carries `status: 'online' | 'offline'`; older
// servers only expose the `online` boolean. Prefer the explicit status.
function endpointStatus(item) {
  const status = typeof item?.status === 'string' ? item.status.toLowerCase() : ''
  if (status === 'online' || status === 'offline') return status
  if (status !== '') return status
  return item?.online === true ? 'online' : 'offline'
}

// Grants stored before the plugin was renamed from dsh-monkeyai-remote-sessions.
const LEGACY_PACKAGE_NAME = 'dsh-monkeyai-remote-sessions'

// Served on the Host's loopback callback. When the browser shares this machine
// the exchange already happened server-side; when it does not (remote DSH Web),
// this page hands the callback URL to the opening panel via postMessage so the
// user never has to copy it. The URL is also shown for manual copying.
function loopbackRelayPage(callbackUrl) {
  const payload = JSON.stringify(callbackUrl).replace(/</g, '\\u003c')
  const escaped = callbackUrl.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  return `<!doctype html><meta charset="utf-8"><title>MonkeyAI authorization</title>
<style>body{font:14px/1.6 system-ui,sans-serif;max-width:640px;margin:48px auto;padding:0 20px;color:#1f2328}
code{display:block;word-break:break-all;background:#f6f8fa;border:1px solid #e4e7ec;border-radius:8px;padding:10px;font-size:12px}
button{margin-top:12px;padding:8px 14px;border-radius:8px;border:1px solid #2b5bd7;background:#3568e8;color:#fff;font-weight:600;cursor:pointer}</style>
<h2>Completing authorization&hellip;</h2>
<p id="msg">Returning to the DSH panel.</p>
<details><summary>Copy the callback manually</summary><code id="url">${escaped}</code><button id="copy" type="button">Copy</button></details>
<script>
(function(){
  var url = ${payload};
  try {
    if (window.opener) {
      window.opener.postMessage({ source: 'monkeyai-dsh-oauth', callbackUrl: url }, '*');
      document.getElementById('msg').textContent = 'Authorization sent to the DSH panel. You can close this tab.';
      setTimeout(function(){ window.close(); }, 800);
      return;
    }
  } catch (e) {}
  document.getElementById('msg').textContent = 'Copy the callback URL below into the DSH panel to finish.';
  document.querySelector('details').open = true;
  document.getElementById('copy').addEventListener('click', function(){
    navigator.clipboard && navigator.clipboard.writeText(url);
    this.textContent = 'Copied';
  });
})();
</script>`
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function parseStoredGrant(record) {
  if (!isObject(record) || record.kind !== 'grant' || !isObject(record.payload)) return undefined
  const payload = record.payload
  if (payload.version !== 1 || typeof payload.serverOrigin !== 'string' || !isObject(payload.token)) return undefined
  if (typeof payload.token.accessToken !== 'string' || payload.token.accessToken.length < 16) return undefined
  if (typeof payload.token.refreshToken !== 'string' || payload.token.refreshToken === '') return undefined
  if (!Number.isFinite(payload.token.expiresAt) || !Array.isArray(payload.token.scopes)
    || !payload.token.scopes.every(scope => typeof scope === 'string' && scope !== '')) return undefined
  try {
    if (normalizeServerOrigin(payload.serverOrigin) !== payload.serverOrigin) return undefined
  } catch {
    return undefined
  }
  return payload
}

function publicAccount(accountId, payload) {
  return {
    accountId,
    serverOrigin: payload.serverOrigin,
    scopes: [...payload.token.scopes],
    expiresAt: payload.token.expiresAt,
  }
}

function requiredString(value, label, maxLength = 512) {
  if (typeof value !== 'string' || value.trim() === '' || value.length > maxLength) {
    throw new TypeError(`${label} is invalid`)
  }
  return value
}

function errorText(error) {
  if (error instanceof Error) return error.message
  if (typeof error === 'string' && error !== '') return error
  return 'authorization failed'
}

function machineId(value) {
  if (typeof value !== 'string' || value === '' || value.length > 256 || !/^[A-Za-z0-9._-]+$/.test(value)) {
    throw new TypeError('Machine ID is invalid')
  }
  return value
}

function sessionId(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 256) throw new TypeError('Session ID is invalid')
  return value
}

export class MonkeyAIRemoteService extends TypertRemoteService {
  constructor(ctx) {
    super(ctx, SERVICE_KEY)
    this.ctx = ctx
    this.pendingAuthorizations = new Map()
    this.activeAcpConnections = new Map()
    this.connectionTickets = new Map()
  }

  async listAccounts() {
    const records = await this.ctx.credentials.listRecords()
    const accounts = []
    const staleKeys = []
    for (const entry of records) {
      const scope = credentialKeyScope(entry.key)
      if (scope !== PACKAGE_NAME && scope !== LEGACY_PACKAGE_NAME) continue
      const record = await this.ctx.credentials.readRecord(entry.key)
      const payload = parseStoredGrant(record)
      if (!payload) {
        staleKeys.push(entry.key)
        continue
      }
      const accountId = credentialKeyId(entry.key)
      if (scope === LEGACY_PACKAGE_NAME) {
        // Migrate pre-rename grants so existing authorizations keep working.
        try {
          await this.ctx.credentials.modifyRecord(grantKey(accountId), async () => ({ kind: 'grant', payload }))
          await this.ctx.credentials.deleteRecord(entry.key)
        } catch {}
      }
      accounts.push(publicAccount(accountId, payload))
    }
    for (const key of staleKeys) {
      try { await this.ctx.credentials.deleteRecord(key) } catch {}
    }
    return accounts.sort((left, right) => left.serverOrigin.localeCompare(right.serverOrigin))
  }

  beginAuthorization(request) {
    const callbackMode = request?.callbackMode === 'loopback' ? 'loopback' : 'scheme'
    if (callbackMode === 'loopback') {
      return this.beginLoopbackAuthorization(requiredString(request?.serverAddress, 'Server address'))
    }
    const auth = createAuthorizationRequest(requiredString(request?.serverAddress, 'Server address'))
    if (this.pendingAuthorizations.size >= 16) {
      const oldest = this.pendingAuthorizations.keys().next().value
      if (oldest) this.dropPending(oldest)
    }
    const requestId = randomUUID()
    this.pendingAuthorizations.set(requestId, { auth, results: this.newPendingResults() })
    return {
      requestId,
      serverOrigin: auth.serverOrigin,
      authorizationUrl: auth.authorizationUrl,
      redirectUri: auth.redirectUri,
      expiresAt: auth.expiresAt,
    }
  }

  newPendingResults() {
    let resolveStatus
    const status = new Promise(resolve => { resolveStatus = resolve })
    return { resolveStatus }
  }

  settlePending(requestId, result) {
    const pending = this.pendingAuthorizations.get(requestId)
    if (!pending) return
    pending.result = result
    pending.resolveStatus?.(result)
    pending.resolveStatus = undefined
  }

  async authorizationStatus(request) {
    const requestId = requiredString(request?.requestId, 'Authorization request ID')
    const pending = this.pendingAuthorizations.get(requestId)
    if (!pending) return { status: 'expired' }
    if (pending.auth.expiresAt <= Date.now()) {
      this.dropPending(requestId)
      return { status: 'expired' }
    }
    if (pending.result) {
      const result = pending.result
      this.dropPending(requestId)
      return result
    }
    return { status: 'pending', expiresAt: pending.auth.expiresAt }
  }

  dropPending(requestId) {
    const pending = this.pendingAuthorizations.get(requestId)
    if (!pending) return
    this.pendingAuthorizations.delete(requestId)
    pending.resolveStatus?.({ status: 'expired' })
    if (pending.loopback) {
      pending.loopback.close()
    }
  }

  async beginLoopbackAuthorization(serverAddress) {
    const http = await import('node:http')
    if (this.pendingAuthorizations.size >= 16) {
      const oldest = this.pendingAuthorizations.keys().next().value
      if (oldest) this.dropPending(oldest)
    }
    const requestId = randomUUID()
    const listener = await new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => this.onLoopbackRequest(requestId, req, res))
      server.on('error', reject)
      server.listen(0, '127.0.0.1', () => resolve(server))
    })
    const port = listener.address().port
    const auth = createAuthorizationRequest(serverAddress, Date.now(), randomBytes, { callbackMode: 'loopback', loopbackPort: port })
    const pending = {
      auth,
      results: this.newPendingResults(),
      loopback: listener,
    }
    pending.timer = setTimeout(() => this.dropPending(requestId), OAUTH_REQUEST_TTL_MS + 1000)
    pending.timer.unref?.()
    this.pendingAuthorizations.set(requestId, pending)
    return {
      requestId,
      serverOrigin: auth.serverOrigin,
      authorizationUrl: auth.authorizationUrl,
      redirectUri: auth.redirectUri,
      expiresAt: auth.expiresAt,
    }
  }

  onLoopbackRequest(requestId, req, res) {
    const pending = this.pendingAuthorizations.get(requestId)
    const base = pending?.auth?.loopbackPort
      ? `http://127.0.0.1:${pending.auth.loopbackPort}`
      : 'http://127.0.0.1'
    const url = new URL(req.url, base)
    if (url.pathname !== '/oauth/callback') {
      res.writeHead(404, { connection: 'close' })
      res.end()
      return
    }
    if (!pending?.auth) {
      res.writeHead(410, { 'content-type': 'text/html; charset=utf-8', connection: 'close' })
      res.end('<!doctype html><meta charset="utf-8"><title>MonkeyAI authorization</title><p>This authorization request is no longer active. Restart it from the DSH panel.</p>')
      return
    }
    // The browser may run on a different machine than this Host (DSH Web
    // served remotely), so its 127.0.0.1 is not this listener. Serve a page
    // that hands the callback to the opening panel via postMessage; the panel
    // then completes the exchange through completeAuthorization. The same
    // page offers manual copying when the opener is unavailable.
    if (url.searchParams.get('code') || url.searchParams.get('error')) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', connection: 'close' })
      res.end(loopbackRelayPage(url.toString()))
      return
    }
    this.exchangeAuthorization(pending.auth, url.toString())
      .then(account => {
        this.settlePending(requestId, { status: 'completed', account })
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', connection: 'close' })
        res.end('<!doctype html><meta charset="utf-8"><title>MonkeyAI authorization</title><p>Authorization received. Return to the DSH panel.</p>')
      })
      .catch(error => {
        this.settlePending(requestId, { status: 'failed', error: errorText(error) })
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', connection: 'close' })
        res.end(`<!doctype html><meta charset="utf-8"><title>MonkeyAI authorization</title><p>Authorization failed: ${errorText(error)}</p>`)
      })
  }

  async completeAuthorization(request) {
    const requestId = requiredString(request?.requestId, 'Authorization request ID')
    const pending = this.pendingAuthorizations.get(requestId)
    if (!pending) throw new Error('Authorization request is unavailable or expired')
    try {
      const account = await this.exchangeAuthorization(pending.auth, request.callbackUrl)
      this.settlePending(requestId, { status: 'completed', account })
      return account
    } catch (error) {
      this.settlePending(requestId, { status: 'failed', error: errorText(error) })
      throw error
    }
  }

  // Password sign-in runs the whole OAuth dance on the Host: log in to the
  // MonkeyAI server, open an authorization request, approve it, and exchange
  // the returned code. Nothing has to come back from the browser, so this
  // works on phones where the loopback redirect cannot reach this machine.
  // Credentials are used for these requests only and never stored.
  async signIn(request) {
    const serverOrigin = normalizeServerOrigin(requiredString(request?.serverAddress, 'Server address'))
    const email = requiredString(request?.email, 'Email', 320)
    const password = requiredString(request?.password, 'Password', 1024)
    const auth = createAuthorizationRequest(serverOrigin, Date.now(), randomBytes, {
      callbackMode: 'loopback',
      loopbackPort: 1,
    })

    const login = await fetch(`${serverOrigin}/api/auth/v1/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ email, password }),
      redirect: 'manual',
      signal: AbortSignal.timeout(20_000),
    })
    if (!login.ok) {
      const detail = await login.json().catch(() => null)
      throw new Error(detail?.error?.message || `MonkeyAI sign-in failed (${login.status})`)
    }
    const cookie = (login.headers.getSetCookie?.() ?? [])
      .map(value => value.split(';')[0])
      .filter(Boolean)
      .join('; ')
    if (cookie === '') throw new Error('MonkeyAI did not return a session for this sign-in')

    const withCookie = { cookie, accept: 'application/json' }
    const authorize = await fetch(auth.authorizationUrl, {
      headers: withCookie,
      redirect: 'manual',
      signal: AbortSignal.timeout(20_000),
    })
    const location = authorize.headers.get('location') ?? ''
    const requestId = new URL(location, serverOrigin).searchParams.get('request_id')
    if (!requestId) throw new Error('MonkeyAI did not start an authorization request for this sign-in')

    const requestPath = `/api/auth/v1/client-requests/${encodeURIComponent(requestId)}`
    const consentResponse = await fetch(`${serverOrigin}${requestPath}`, {
      headers: withCookie,
      signal: AbortSignal.timeout(20_000),
    })
    const consent = await consentResponse.json().catch(() => null)
    if (!consentResponse.ok || !consent?.csrf_token) {
      throw new Error(consent?.error?.message || 'MonkeyAI did not return an approvable authorization request')
    }
    const scopes = Array.isArray(consent.scopes) && consent.scopes.length > 0
      ? consent.scopes.filter(scope => typeof scope === 'string')
      : [...MONKEYAI_SCOPES]

    const approvedResponse = await fetch(`${serverOrigin}${requestPath}/complete`, {
      method: 'POST',
      headers: { ...withCookie, 'content-type': 'application/json', 'x-csrf-token': consent.csrf_token },
      body: JSON.stringify({ approved_scopes: scopes }),
      signal: AbortSignal.timeout(20_000),
    })
    const approved = await approvedResponse.json().catch(() => null)
    if (!approvedResponse.ok || typeof approved?.launch_url !== 'string') {
      throw new Error(approved?.error?.message || 'MonkeyAI did not approve the authorization request')
    }
    // The launch URL carries the code; rebuild it against the redirect this
    // request registered so the existing callback validation still applies.
    const launch = new URL(approved.launch_url, serverOrigin)
    const callbackUrl = `${auth.redirectUri}?${launch.searchParams.toString()}`
    return this.exchangeAuthorization(auth, callbackUrl)
  }

  async exchangeAuthorization(auth, callbackUrl) {
    const callback = parseAuthorizationCallback(callbackUrl, auth)
    const tokens = await requestJson(auth.serverOrigin, '/oauth/token', {
      method: 'POST',
      form: createTokenForm({ ...callback, redirectUri: auth.redirectUri }),
    })
    const token = normalizeTokenResponse(tokens)
    if (!token.scopes.includes('session:read')) throw new Error('MonkeyAI did not grant session:read')

    let userId
    try {
      const me = await requestJson(auth.serverOrigin, '/api/v1/me', { accessToken: token.accessToken })
      if (typeof me?.id === 'string' && me.id !== '') userId = me.id
    } catch {
      // Identity lookup is best-effort; fall back to the origin-scoped account id.
    }
    const accountId = accountIdFor(auth.serverOrigin, userId)
    const key = grantKey(accountId)
    const payload = { version: 1, serverOrigin: auth.serverOrigin, token, userId }
    await this.ctx.credentials.modifyRecord(key, async () => ({ kind: 'grant', payload }))
    return publicAccount(accountId, payload)
  }

  async disconnect(request) {
    const id = requiredString(request?.accountId, 'Account ID', 64)
    await this.ctx.credentials.deleteRecord(grantKey(id))
    for (const cacheKey of [...this.connectionTickets.keys()]) {
      if (cacheKey.startsWith(id + '|')) this.connectionTickets.delete(cacheKey)
    }
    for (const [controller, connection] of this.activeAcpConnections) {
      if (connection.accountId !== id) continue
      const reason = new Error('MonkeyAI account disconnected')
      controller.abort(reason)
      connection.events.close()
      connection.acp?.close(reason)
      this.activeAcpConnections.delete(controller)
    }
    return { disconnected: true }
  }

  async listDevices(request) {
    const accountId = requiredString(request?.accountId, 'Account ID', 64)
    const grant = await this.getGrant(accountId)
    this.requireScope(grant, 'device:connect')
    const token = await this.refreshAccessToken(accountId)
    const page = Number.isInteger(request.page) && request.page > 0 ? request.page : 1
    const response = await requestJson(grant.serverOrigin,
      `/api/v1/endpoints?page=${page}&page_size=100`, {
        accessToken: token.accessToken,
      })
    const items = Array.isArray(response.items) ? response.items : []
    return {
      items: items.filter(item => item?.revoked_at == null).map(item => ({
        machineId: String(item.machine_id ?? ''),
        displayName: String(item.alias ?? item.display_name ?? item.machine_id ?? 'MonkeyAI device'),
        platform: String(item.platform ?? 'unknown'),
        arch: String(item.arch ?? 'unknown'),
        // The endpoint directory reports liveness in `status`; the detail
        // endpoint's `online` boolean tracks a different (control-plane)
        // channel and stays false for devices that serve sessions fine.
        status: endpointStatus(item),
        stale: false,
      })).filter(item => item.machineId !== ''),
      total: Number.isSafeInteger(response.total) && response.total >= 0 ? response.total : items.length,
    }
  }

  async listSessions(request) {
    const accountId = requiredString(request?.accountId, 'Account ID', 64)
    const target = machineId(request?.machineId)
    const grant = await this.getGrant(accountId)
    this.requireScope(grant, 'session:read')
    const token = await this.refreshAccessToken(accountId)
    const page = Number.isInteger(request.page) && request.page > 0 ? request.page : 1
    const pageSize = Number.isInteger(request.pageSize) && request.pageSize > 0
      ? Math.min(request.pageSize, 100)
      : 50
    const response = await requestJson(grant.serverOrigin,
      `/api/v1/sessions?machine_id=${encodeURIComponent(target)}&page=${page}&page_size=${pageSize}`, {
        accessToken: token.accessToken,
      })
    const items = Array.isArray(response.items) ? response.items : []
    const pagination = isObject(response.pagination) ? response.pagination : {}
    return {
      items: items.filter(item => item?.machine_id === target).map(item => ({
        id: String(item.id ?? ''),
        machineId: target,
        title: String(item.title ?? ''),
        sessionType: String(item.session_type ?? 'conversation'),
        startedAt: String(item.started_at ?? ''),
        lastActiveAt: typeof item.last_active_at === 'string' ? item.last_active_at : null,
        deviceStatus: String(item.device_status ?? 'unknown'),
        stale: item.stale === true,
      })).filter(item => item.id !== ''),
      page: Number.isInteger(pagination.page) ? pagination.page : page,
      pageSize: Number.isInteger(pagination.page_size) ? pagination.page_size : pageSize,
      total: Number.isSafeInteger(pagination.total) && pagination.total >= 0 ? pagination.total : items.length,
      serverTime: String(response.server_time ?? ''),
    }
  }

  async createSession(request) {
    const accountId = requiredString(request?.accountId, 'Account ID', 64)
    const target = machineId(request?.machineId)
    const cwd = requiredString(request?.cwd, 'Session working directory', 4096)
    if (!cwd.startsWith('/')) throw new TypeError('Session working directory must be absolute')
    const requestedModel = typeof request?.model === 'string' && request.model !== '' ? request.model : undefined
    const grant = await this.getGrant(accountId)
    this.requireScope(grant, 'device:connect')
    this.requireScope(grant, 'session:read')
    const token = await this.refreshAccessToken(accountId)
    const ticket = await this.requestConnectionTicket(accountId, grant, token, target)
    const acp = await openAcpJsonRpc(grant.serverOrigin, target, ticket.ticket)
    try {
      const initialized = await acp.request('initialize', {
        protocolVersion: 1,
        clientInfo: ACP_CLIENT_INFO,
        clientCapabilities: {},
      })
      if (initialized?.agentCapabilities?.loadSession !== true) {
        throw new Error('MonkeyAI runtime does not advertise ACP session support')
      }
      const newParams = { cwd, mcpServers: [] }
      if (requestedModel) newParams.model = requestedModel
      const created = await acp.request('session/new', newParams, { timeoutMs: 60_000 })
      const sessionId = created?.sessionId ?? created?.id
      if (typeof sessionId !== 'string' || sessionId === '') throw new Error('MonkeyAI runtime did not return a session id')
      const title = typeof created?.title === 'string' && created.title !== '' ? created.title : undefined
      const finalCwd = typeof created?.cwd === 'string' && created.cwd !== '' ? created.cwd : cwd
      const sessionModel = typeof created?._meta?.model === 'string' ? created._meta.model : undefined
      return {
        sessionId,
        cwd: finalCwd,
        ...(title === undefined ? {} : { title }),
        ...(sessionModel === undefined ? {} : { model: sessionModel }),
      }
    } finally {
      acp.close()
    }
  }

  async listRuntimeSessions(request) {
    const accountId = requiredString(request?.accountId, 'Account ID', 64)
    const target = machineId(request?.machineId)
    const grant = await this.getGrant(accountId)
    this.requireScope(grant, 'session:read')
    const token = await this.refreshAccessToken(accountId)
    const ticket = await this.requestConnectionTicket(accountId, grant, token, target)
    const acp = await openAcpJsonRpc(grant.serverOrigin, target, ticket.ticket)
    try {
      const initialized = await acp.request('initialize', {
        protocolVersion: 1,
        clientInfo: ACP_CLIENT_INFO,
        clientCapabilities: {},
      })
      const listed = await acp.request('session/list', {})
      const sessions = Array.isArray(listed?.sessions) ? listed.sessions : []
      return {
        sessions: sessions.map(item => ({
          id: String(item.sessionId ?? item.id ?? ''),
          title: String(item.title ?? ''),
          cwd: typeof item.cwd === 'string' ? item.cwd : '',
        })).filter(item => item.id !== ''),
      }
    } finally {
      acp.close()
    }
  }

  async listModels(request) {
    const accountId = requiredString(request?.accountId, 'Account ID', 64)
    const grant = await this.getGrant(accountId)
    this.requireScope(grant, 'session:read')
    const token = await this.refreshAccessToken(accountId)
    const response = await requestJson(grant.serverOrigin, '/api/v1/models', {
      accessToken: token.accessToken,
    })
    const items = Array.isArray(response?.models) ? response.models : []
    return {
      models: items.map(item => ({
        id: String(item.id ?? ''),
        displayName: String(item.display_name ?? item.name ?? ''),
        model: String(item.model ?? ''),
        kind: String(item.kind ?? 'text'),
        contextWindowTokens: Number.isFinite(item.context_window_tokens) ? Number(item.context_window_tokens) : 0,
        ...(item.supports_vision === true ? { supportsVision: true } : {}),
      })).filter(item => item.id !== ''),
    }
  }

  async switchModel(request) {
    const accountId = requiredString(request?.accountId, 'Account ID', 64)
    const target = machineId(request?.machineId)
    const selectedSession = sessionId(request?.sessionId)
    const modelId = requiredString(request?.model, 'Model', 512)
    const grant = await this.getGrant(accountId)
    this.requireScope(grant, 'device:connect')
    this.requireScope(grant, 'session:read')
    const token = await this.refreshAccessToken(accountId)
    const ticket = await this.requestConnectionTicket(accountId, grant, token, target)
    const acp = await openAcpJsonRpc(grant.serverOrigin, target, ticket.ticket)
    try {
      await acp.request('initialize', {
        protocolVersion: 1,
        clientInfo: ACP_CLIENT_INFO,
        clientCapabilities: {},
      })
      // Try the spec-aligned ACP method first, then the MonkeyAI private
      // variants. At least one is accepted by every runtime generation that
      // advertises loadSession; older builds return "method not found" for
      // the ones they do not implement.
      const attempts = [
        ['session/switchModel', { sessionId: selectedSession, model: modelId }],
        ['session/switchModel', { session_id: selectedSession, model: modelId }],
        ['_monkeyai/session/model/set', { session_id: selectedSession, model: modelId }],
        ['_monkeyai/session/model/set', { sessionId: selectedSession, modelId }],
      ]
      for (const [method, params] of attempts) {
        try {
          await acp.request(method, params, { timeoutMs: 30_000 })
          return { switched: true, model: modelId }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          if (/not found/i.test(message)) continue
          if (/invalid params/i.test(message)) continue
          throw error
        }
      }
      return {
        switched: false,
        message: 'This MonkeyAI runtime does not support switching models on an active session. Create a new session to use a different model.',
      }
    } finally {
      acp.close()
    }
  }

  async *followSession(request, remoteSignal) {
    const accountId = requiredString(request?.accountId, 'Account ID', 64)
    const target = machineId(request?.machineId)
    const selectedSession = sessionId(request?.sessionId)
    const cwd = requiredString(request?.cwd, 'Session working directory', 4096)
    if (!cwd.startsWith('/')) throw new TypeError('Session working directory must be absolute')

    const controller = new AbortController()
    const signal = remoteSignal
      ? AbortSignal.any([remoteSignal, controller.signal])
      : controller.signal
    const events = new AsyncQueue({ maxItems: 4096, maxBytes: 64 * 1024 * 1024, backpressure: true })
    const connection = { accountId, controller, events, acp: undefined }
    this.activeAcpConnections.set(controller, connection)
    let currentAcp
    let unsubscribe = () => {}
    let unsubscribeClose = () => {}
    let uplinkIterator
    let commandPump = Promise.resolve()
    let abortListener
    let reconnectsUsed = 0
    const MAX_REPLAY_RECONNECTS = 32
    let ticketValue
    let loadCompleted = false
    let currentLoadedModel = undefined
    const aborted = new Promise(resolve => {
      if (signal.aborted) {
        resolve({ done: true, value: undefined })
        return
      }
      abortListener = () => resolve({ done: true, value: undefined })
      signal.addEventListener('abort', abortListener, { once: true })
    })
    const emit = frame => {
      // With backpressure enabled push only fails on a closed queue or an
      // oversized single frame; both end the stream.
      const pushed = events.push(frame)
      if (pushed === false) {
        const reason = new Error('Remote session event queue exceeded its limit')
        controller.abort(reason)
        currentAcp?.close(reason)
        return false
      }
      return pushed
    }
    const pendingRequests = new Map()
    // MonkeyAI's ACP session/load replays a bounded recent history window and
    // closes the socket before the load response resolves. Each reconnect
    // re-issues session/load and the runtime replays the same window; the
    // projection layer deduplicates by messageId/toolCallId. Track seen replay
    // keys so that a reconnect which yields no new frames is treated as the
    // end of the bounded replay (history complete), instead of looping until
    // the reconnect budget is exhausted and reporting history_incomplete.
    const seenReplayKeys = new Set()
    let newReplayKeysThisConnection = 0
    // Message ids already delivered via the HTTP history channel (see
    // fetchFullSessionHistory). Replay frames for these messages are counted
    // for close detection but suppressed from the event stream to avoid
    // duplicating text the projection already folded in.
    const httpHistoryMessageIds = new Set()
    // When the HTTP channel delivered the full history, the ACP replay adds
    // nothing: skip session/load entirely and mount the session live.
    let httpHistoryComplete = false
    let httpConfigurationRevision
    // history_loaded can be triggered by both the HTTP history channel and
    // the ACP load path; the stream must carry it exactly once.
    let historyLoadedEmitted = false
    const emitHistoryLoaded = model => {
      if (historyLoadedEmitted) return
      historyLoadedEmitted = true
      emit({ type: 'history_loaded', sessionId: selectedSession, ...(model === undefined ? {} : { model }) })
    }

    function replayKey(params) {
      const update = params?.update
      if (!update || typeof update !== 'object') return null
      const messageId = typeof params?._meta?.messageId === 'string' && params._meta.messageId !== ''
        ? params._meta.messageId
        : (typeof update.messageId === 'string' ? update.messageId : '')
      if (messageId !== '') return `msg:${messageId}`
      const toolCallId = typeof update._meta?.parentToolCallId === 'string' && update._meta.parentToolCallId !== ''
        ? update._meta.parentToolCallId
        : (typeof update.toolCallId === 'string' ? update.toolCallId : '')
      if (toolCallId !== '') return `tool:${toolCallId}`
      const sessionUpdate = typeof update.sessionUpdate === 'string' ? update.sessionUpdate : ''
      if (sessionUpdate === 'agent_thought_chunk' || sessionUpdate === 'agent_thought') {
        return `thought:${messageId || `auto:${seenReplayKeys.size}`}`
      }
      return null
    }

    // Establishes one ACP connection generation. `withLoad` replays history;
    // reconnects use `false` so the runtime mounts the session without a full replay.
    const establishAcp = async withLoad => {
      const acp = await openAcpJsonRpc(grantRef.serverOrigin, target, ticketValue, { signal })
      currentAcp = acp
      connection.acp = acp
      pendingRequests.clear()
      newReplayKeysThisConnection = 0
      const unsubscribeThis = acp.subscribe(event => {
        if (currentAcp !== acp) return
        if (event.params?.sessionId !== selectedSession) return
        if (event.kind === 'request') {
          if (pendingRequests.size >= 64) {
            const reason = new Error('Remote session has too many pending requests')
            controller.abort(reason)
            acp.close(reason)
            return
          }
          pendingRequests.set(requestKey(event.id), { method: event.method, params: event.params })
          emit({
            type: 'request',
            sessionId: selectedSession,
            requestId: event.id,
            method: event.method,
            data: event.params,
          })
        } else {
        if (withLoad && !loadCompleted) {
          const key = replayKey(event.params)
            if (key !== null) {
              if (!seenReplayKeys.has(key)) {
                seenReplayKeys.add(key)
                newReplayKeysThisConnection += 1
              }
            }
          }
          // Suppress replayed messages already delivered over HTTP, on every
          // connection generation (re-mounts replay the same window again).
          if (withLoad) {
            const replayMessageId = (typeof event.params?._meta?.messageId === 'string' && event.params._meta.messageId !== '')
              ? event.params._meta.messageId
              : (typeof event.params?.update?.messageId === 'string' ? event.params.update.messageId : '')
            if (replayMessageId !== '' && httpHistoryMessageIds.has(replayMessageId)) return
          }
          emit({
            type: 'notification',
            sessionId: selectedSession,
            method: event.method,
            data: event.params,
          })
        }
      })
      const unsubscribeCloseThis = acp.subscribeClose(reason => {
        if (signal.aborted) {
          events.close()
          return
        }
        // A stale generation's close (we already reconnected) must not abort
        // the live connection or end the stream.
        if (currentAcp !== acp) return
        // During history replay the runtime closes the socket before the
        // session/load response resolves. Reconnect and re-issue session/load;
        // the projection layer deduplicates frames by messageId/toolCallId so
        // repeated replay only fills in gaps. When a reconnect yields no new
        // replay keys, the bounded recent-history window has been fully
        // delivered — mark the load complete instead of looping further.
        if (!loadCompleted && reconnectsUsed < MAX_REPLAY_RECONNECTS) {
          if (seenReplayKeys.size > 0 && newReplayKeysThisConnection === 0 && reconnectsUsed > 0) {
            loadCompleted = true
            reconnectsUsed = 0
            const loadedModel = currentLoadedModel
            emitHistoryLoaded(loadedModel)
            return
          }
          reconnectsUsed += 1
          emit({ type: 'reconnecting', sessionId: selectedSession, message: `History replay interrupted - reconnecting to continue loading (${reconnectsUsed}/${MAX_REPLAY_RECONNECTS})` })
          void (async () => {
            try {
              await establishAcp(true)
            } catch (reconnectError) {
              emit({
                type: 'error',
                sessionId: selectedSession,
                code: 'acp_connection_closed',
                message: reconnectError instanceof Error ? reconnectError.message : 'Remote session connection closed',
              })
              controller.abort(reason)
              events.close()
            }
          })()
          return
        }
        // After history loaded, reconnect and re-mount the session so prompts
        // keep working (the runtime binds sessions per connection).
        if (loadCompleted && reconnectsUsed < MAX_REPLAY_RECONNECTS) {
          reconnectsUsed += 1
          emit({ type: 'reconnecting', sessionId: selectedSession, message: 'Remote connection dropped - reconnecting' })
          void (async () => {
            try {
              await establishAcp(true)
              emit({ type: 'reconnected', sessionId: selectedSession })
            } catch (reconnectError) {
              emit({
                type: 'error',
                sessionId: selectedSession,
                code: 'acp_connection_closed',
                message: reconnectError instanceof Error ? reconnectError.message : 'Remote session connection closed',
              })
              controller.abort(reason)
              events.close()
            }
          })()
          return
        }
        emit({
          type: 'error',
          sessionId: selectedSession,
          code: 'acp_connection_closed',
          message: 'Remote session connection closed',
        })
        controller.abort(reason)
        events.close()
      })
      unsubscribe = () => { unsubscribeThis(); unsubscribe = () => {} }
      unsubscribeClose = () => { unsubscribeCloseThis(); unsubscribeClose = () => {} }
      if (signal.aborted) throw signal.reason ?? new Error('Remote session cancelled')

      const initialized = await acp.request('initialize', {
        protocolVersion: 1,
        clientInfo: ACP_CLIENT_INFO,
        clientCapabilities: {},
      }, { signal })
      if (initialized?.agentCapabilities?.loadSession !== true) {
        throw new Error('MonkeyAI runtime does not advertise ACP session history loading')
      }

      if (!withLoad) {
        emit({ type: 'reconnected', sessionId: selectedSession })
        return
      }
      emit({ type: 'ready', sessionId: selectedSession })
      if (httpHistoryComplete) {
        // History came over HTTP; prompts and model switches work on a plain
        // initialized connection. Skip session/load: its bounded replay
        // always dies mid-stream and would churn reconnects for nothing.
        loadCompleted = true
        return
      }
      try {
        const loadResult = await acp.request('session/load', {
          sessionId: selectedSession,
          cwd,
          mcpServers: [],
        }, { signal, timeoutMs: 600_000 })
        loadCompleted = true
        currentLoadedModel = typeof loadResult?._meta?.model === 'string' ? loadResult._meta.model : currentLoadedModel
        emitHistoryLoaded(currentLoadedModel)
      } catch (error) {
        if (signal?.aborted) throw error
        const message = error instanceof Error ? error.message : String(error)
        if (/not found/i.test(message)) {
          emit({
            type: 'session_missing',
            sessionId: selectedSession,
            code: 'session_not_found',
            message: 'This session no longer exists on the selected device (the runtime may have been reset). Create a new session instead.',
          })
          connection.sessionMissing = true
          return
        }
        // Connection closed during replay: the close handler drives reconnects.
        // With HTTP history already delivered, treat the drop as load-complete:
        // prompts and model switches work on any initialized connection.
        if (httpHistoryComplete) {
          loadCompleted = true
          return
        }
        // If reconnect budget is exhausted, surface the incomplete history;
        // otherwise stay quiet so the reconnect loop can continue.
        if (reconnectsUsed >= MAX_REPLAY_RECONNECTS) {
          emit({
            type: 'history_incomplete',
            sessionId: selectedSession,
            code: 'history_load_failed',
            message: 'History replay was repeatedly cut off by the remote runtime; showing only the messages received so far.',
          })
          loadCompleted = true
        }
      }
    }

    let grantRef
    try {
      grantRef = await this.getGrant(accountId)
      this.requireScope(grantRef, 'device:connect')
      this.requireScope(grantRef, 'session:read')
      if (signal.aborted) throw signal.reason ?? new Error('Remote session cancelled')

      const token = await this.refreshAccessToken(accountId, signal)
      const ticket = await this.requestConnectionTicket(accountId, grantRef, token, target, { signal })
      ticketValue = ticket.ticket
      if (signal.aborted) throw signal.reason ?? new Error('Remote session cancelled')

      // Load the full history over the runtime's HTTP read channel before the
      // ACP connection starts. The ACP session/load replay only streams a
      // small recent window and the socket is closed mid-replay; the HTTP
      // endpoint paginates the complete message log by cursor instead.
      try {
        const history = await fetchFullSessionHistory({
          httpBase: ticket.httpBase,
          ticket: ticketValue,
          sessionId: selectedSession,
          signal,
          onFrame: async frame => { await emit(frame) },
        })
        for (const id of history.messageIds) httpHistoryMessageIds.add(id)
        if (history.count > 0) {
          httpHistoryComplete = true
          httpConfigurationRevision = history.configurationRevision
          emitHistoryLoaded()
        }
      } catch (historyError) {
        if (signal?.aborted) throw historyError
        // Non-fatal: fall back to the bounded ACP replay below.
      }

      await establishAcp(true)
      if (connection.sessionMissing) return

      const uplink = this.ctx.invocation?.uplink()
      if (!uplink) throw new Error('Remote session command channel is unavailable')
      uplinkIterator = uplink[Symbol.asyncIterator]()

      commandPump = (async () => {
        while (!signal.aborted) {
          const next = await Promise.race([uplinkIterator.next(), aborted])
          if (next.done || signal.aborted) return
          const command = next.value
          try {
            const currentGrant = await this.getGrant(accountId)
            if (!currentGrant.token.scopes.includes('session:read')) {
              emit({ type: 'error', sessionId: selectedSession, code: 'read_permission_revoked', message: 'Session read permission is no longer available' })
              controller.abort(new Error('Session read permission was revoked'))
              currentAcp?.close(new Error('Session read permission was revoked'))
              events.close()
              return
            }
            if (!currentGrant.token.scopes.includes('session:control')) {
              const frame = command.type === 'prompt'
                ? { type: 'delivery', sessionId: selectedSession, data: { accepted: false, code: 'control_permission_required' } }
                : { type: 'response_error', sessionId: selectedSession, requestId: command.requestId, code: 'control_permission_required' }
              emit(frame)
              continue
            }

            if (!currentAcp) throw new Error('ACP connection is re-establishing')

            if (command.type === 'switch_model') {
              try {
                const result = await currentAcp.request('_monkeyai/session/model/set', {
                  sessionId: selectedSession,
                  model: command.model,
                  ...(httpConfigurationRevision === undefined ? {} : { _meta: { expectedRevision: httpConfigurationRevision } }),
                }, { signal, timeoutMs: 120_000 })
                const nextRevision = result?._meta?.configurationRevision
                if (Number.isSafeInteger(nextRevision)) httpConfigurationRevision = nextRevision
                const model = typeof result?.model === 'string' ? result.model : command.model
                currentLoadedModel = model
                emit({ type: 'model_switched', sessionId: selectedSession, data: { model } })
              } catch (switchError) {
                if (signal.aborted) return
                const detail = switchError instanceof Error ? switchError.message : String(switchError)
                const data = switchError?.data ? ` ${JSON.stringify(switchError.data).slice(0, 200)}` : ''
                emit({
                  type: 'model_switch_failed',
                  sessionId: selectedSession,
                  code: 'model_switch_rejected',
                  message: `${detail}${data}`,
                })
              }
              continue
            }

            if (command.type === 'prompt') {
              try {
                // session/prompt resolves only when the whole turn finishes;
                // long turns on big sessions can take many minutes. Streamed
                // session/update frames reach the panel while it runs.
                const result = await currentAcp.request('session/prompt', {
                  sessionId: selectedSession,
                  prompt: [{ type: 'text', text: command.text }],
                }, { signal, timeoutMs: 1_800_000 })
                emit({ type: 'delivery', sessionId: selectedSession, data: { accepted: true, result } })
              } catch (promptError) {
                if (signal.aborted) return
                emit({
                  type: 'delivery',
                  sessionId: selectedSession,
                  data: { accepted: false, code: 'remote_rejected' },
                  message: promptError instanceof Error ? promptError.message : 'Remote runtime rejected the instruction',
                })
              }
              continue
            }

            if (command.type === 'respond') {
              const key = requestKey(command.requestId)
              const pending = pendingRequests.get(key)
              if (!pending) {
                emit({ type: 'response_error', sessionId: selectedSession, requestId: command.requestId, code: 'request_expired' })
                continue
              }
              validateResponse(pending.method, pending.params, command.result)
              currentAcp.respond(command.requestId, command.result)
              pendingRequests.delete(key)
              emit({ type: 'response_sent', sessionId: selectedSession, requestId: command.requestId })
              continue
            }

            if (command.type === 'cancel') {
              currentAcp.notify('session/cancel', { sessionId: selectedSession })
              emit({ type: 'cancel_sent', sessionId: selectedSession })
              continue
            }

            emit({ type: 'error', sessionId: selectedSession, code: 'invalid_command', message: 'Remote command is unsupported' })
          } catch (error) {
            if (signal.aborted) return
            const requestId = command.type === 'respond' ? command.requestId : undefined
            const detail = error instanceof Error ? error.message : String(error)
            emit({
              type: command.type === 'respond' ? 'response_error' : 'delivery',
              sessionId: selectedSession,
              ...(requestId === undefined ? {} : { requestId }),
              data: command.type === 'prompt' ? { accepted: false } : undefined,
              code: 'command_rejected',
              message: error instanceof TypeError ? 'Remote response is invalid' : `Remote command was rejected: ${detail.slice(0, 300)}`,
            })
          }
        }
      })()
      commandPump.catch(() => {
        if (signal.aborted) return
        emit({ type: 'error', sessionId: selectedSession, code: 'command_channel_closed', message: 'Remote command channel closed' })
        controller.abort(new Error('Remote command channel closed'))
        currentAcp?.close(new Error('Remote command channel closed'))
        events.close()
      })

      while (true) {
        let next
        try {
          next = await events.next({ signal })
        } catch (error) {
          if (signal.aborted) break
          throw error
        }
        if (next.done) break
        yield next.value
      }
    } finally {
      controller.abort(new Error('Remote session stream closed'))
      unsubscribe()
      unsubscribeClose()
      events.close()
      currentAcp?.close(new Error('Remote session stream closed'))
      this.activeAcpConnections.delete(controller)
      if (abortListener) signal.removeEventListener('abort', abortListener)
      try {
        void Promise.resolve(uplinkIterator?.return?.()).catch(() => {})
      } catch {}
      await commandPump.catch(() => {})
    }
  }

  async dispose() {
    for (const requestId of [...this.pendingAuthorizations.keys()]) this.dropPending(requestId)
    for (const [controller, connection] of this.activeAcpConnections) {
      const reason = new Error('MonkeyAI remote service unloaded')
      controller.abort(reason)
      connection.events.close()
      connection.acp?.close(reason)
    }
    this.activeAcpConnections.clear()
    this.connectionTickets.clear()
  }

  async requestConnectionTicket(accountId, grant, token, target, { signal } = {}) {
    this.requireScope(grant, 'device:connect')
    this.requireScope(grant, 'session:read')
    const cacheKey = `${accountId}|${target}`
    const cached = this.connectionTickets.get(cacheKey)
    if (cached && cached.expiresAt > Date.now() + 60_000) {
      return { ticket: cached.ticket, httpBase: cached.httpBase, expiresIn: Math.round((cached.expiresAt - Date.now()) / 1000) }
    }
    const scopes = ['session:read']
    if (grant.token.scopes.includes('session:control')) scopes.push('session:control')
    const response = await requestJson(grant.serverOrigin,
      `/api/v1/endpoints/${encodeURIComponent(target)}/connections`, {
        method: 'POST',
        accessToken: token.accessToken,
        signal,
        body: {
          supported_protocols: { acp: [1], runtime_api: [1] },
          scopes,
        },
      })
    if (typeof response.ticket !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(response.ticket)
      || typeof response.http_base !== 'string') {
      throw new Error('MonkeyAI returned an invalid connection ticket')
    }
    const base = new URL(response.http_base)
    if (base.origin !== grant.serverOrigin || base.username || base.password || base.search || base.hash) {
      throw new Error('MonkeyAI returned a connection URL outside the configured server')
    }
    const expiresIn = Number(response.expires_in)
    if (!Number.isFinite(expiresIn) || expiresIn <= 0 || expiresIn > 86_400) {
      throw new Error('MonkeyAI returned an invalid connection ticket expiry')
    }
    this.connectionTickets.set(cacheKey, {
      ticket: response.ticket,
      httpBase: base.toString(),
      expiresAt: Date.now() + expiresIn * 1000,
    })
    return { ticket: response.ticket, httpBase: base.toString(), expiresIn }
  }

  async getGrant(accountId) {
    const key = grantKey(accountId)
    const record = await this.ctx.credentials.readRecord(key)
    const payload = parseStoredGrant(record)
    if (!payload) throw new Error('MonkeyAI account authorization is unavailable')
    return payload
  }

  async refreshAccessToken(accountId, signal) {
    const key = grantKey(accountId)
    const record = await this.ctx.credentials.modifyRecord(key, async current => {
      const payload = parseStoredGrant(current)
      if (!payload) throw new Error('MonkeyAI account authorization is unavailable')
      if (payload.token.expiresAt > Date.now() + MIN_ACCESS_TOKEN_TTL_MS) return undefined

      try {
        const response = await requestJson(payload.serverOrigin, '/oauth/token', {
          method: 'POST',
          form: createRefreshForm(payload.token.refreshToken),
          signal,
        })
        const token = normalizeTokenResponse(response, Date.now(), payload.token)
        return { kind: 'grant', payload: { ...payload, token } }
      } catch (error) {
        if (error instanceof MonkeyAIHttpError && (error.status === 400 || error.status === 401)) {
          // The refresh chain is broken (revoked or rotated elsewhere); keep the
          // credential store clean so the dead grant cannot be selected again.
          try { await this.ctx.credentials.deleteRecord(key) } catch {}
          throw new Error('MonkeyAI authorization has expired and cannot be refreshed. Please re-authorize this account from the panel.')
        }
        throw error
      }
    })
    const payload = parseStoredGrant(record)
    if (!payload || payload.token.expiresAt <= Date.now()) throw new Error('MonkeyAI access token is expired')
    return payload.token
  }

  requireScope(grant, scope) {
    if (!grant.token.scopes.includes(scope)) throw new Error(`MonkeyAI authorization is missing ${scope}`)
  }
}

function requestKey(id) {
  if (typeof id !== 'string' && typeof id !== 'number') throw new TypeError('ACP request ID is invalid')
  return `${typeof id}:${String(id)}`
}

const HISTORY_PAGE_MAX_BYTES = 64 * 1024 * 1024

async function readHistoryBodyText(response, maxBytes = HISTORY_PAGE_MAX_BYTES) {
  const contentLength = Number(response.headers?.get?.('content-length'))
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new TypeError('MonkeyAI history page exceeds the size limit')
  }
  if (!response.body) return ''
  const reader = response.body.getReader()
  const chunks = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => {})
      throw new TypeError('MonkeyAI history page exceeds the size limit')
    }
    chunks.push(value)
  }
  const joined = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    joined.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(joined)
}

async function readSessionHistoryPage({ httpBase, ticket, sessionId, cursor, direction, limit = 50, signal }) {
  const params = { sessionId, limit, ...(cursor ? { cursor, direction } : {}) }
  const response = await fetch(`${httpBase.endsWith('/') ? httpBase : `${httpBase}/`}read/session`, {
    method: 'POST',
    headers: { authorization: `Bearer ${ticket}`, 'content-type': 'application/json' },
    body: JSON.stringify({ method: '_monkeyai/session/messages', params }),
    signal,
  })
  const text = await readHistoryBodyText(response).catch(error => {
    if (response.ok) throw error
    return ''
  })
  if (!response.ok) {
    throw new Error(`MonkeyAI history read failed (${response.status}): ${text.slice(0, 200)}`)
  }
  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('MonkeyAI history read returned invalid JSON')
  }
  const result = data?.result
  if (!result || !Array.isArray(result.messages)) {
    throw new Error('MonkeyAI history read returned an invalid response')
  }
  return result
}

function historyMessageText(parts) {
  return (Array.isArray(parts) ? parts : [])
    .filter(part => part?.type === 'text' && typeof part.text === 'string')
    .map(part => part.text)
    .join('')
}

// Converts one history message snapshot into the same notification frame
// shape the ACP replay produces, so the shared projection layer renders both
// identically. Message ids match ACP replay messageIds (u-turn-N / a-turn-N).
function historyMessageToFrames(sessionId, message, toolCallsById) {
  const frames = []
  const meta = { messageId: message.id, replay: true }
  const emitUpdate = update => {
    frames.push({ type: 'notification', sessionId, method: 'session/update', data: { sessionId, _meta: meta, update } })
  }
  if (message.role === 'user') {
    const fileLinks = (Array.isArray(message.parts) ? message.parts : [])
      .filter(part => part?.type === 'file')
      .map(part => ({ type: 'resource_link', name: part.name, uri: part.uri }))
    const text = historyMessageText(message.parts)
    const content = fileLinks.length > 0
      ? [...(text === '' ? [] : [{ type: 'text', text }]), ...fileLinks]
      : (text === '' ? undefined : { type: 'text', text })
    if (content !== undefined) emitUpdate({ sessionUpdate: 'user_message_chunk', content })
    return frames
  }
  for (const part of Array.isArray(message.parts) ? message.parts : []) {
    if (part?.type === 'thought' && typeof part.text === 'string' && part.text !== '') {
      emitUpdate({ sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: part.text } })
    } else if (part?.type === 'text' && typeof part.text === 'string' && part.text !== '') {
      emitUpdate({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: part.text } })
    } else if (part?.type === 'error' && typeof part.reason === 'string' && part.reason !== '') {
      emitUpdate({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: `[error] ${part.reason}` } })
    } else if (part?.type === 'file' && typeof part.uri === 'string') {
      emitUpdate({ sessionUpdate: 'agent_message_chunk', content: { type: 'resource_link', name: part.name, uri: part.uri } })
    } else if (part?.type === 'tool_call' && typeof part.toolCallId === 'string') {
      const call = toolCallsById?.[part.toolCallId]
      if (!call || typeof call !== 'object') continue
      emitUpdate({
        sessionUpdate: 'tool_call',
        toolCallId: call.id ?? part.toolCallId,
        title: typeof call.title === 'string' && call.title !== '' ? call.title : call.name,
        kind: typeof call.kind === 'string' ? call.kind : 'other',
        status: typeof call.status === 'string' ? call.status : 'completed',
        rawOutput: typeof call.output === 'string' ? { output: call.output } : undefined,
      })
    }
  }
  return frames
}

// Walks the whole session history newest-to-oldest via olderCursor. Each page
// is ordered oldest-to-newest within itself and pages arrive newest-first, so
// the chronological order is the collected pages with their order reversed.
// Returns the set of message ids that were delivered.
async function fetchFullSessionHistory({ httpBase, ticket, sessionId, signal, onFrame, maxPages = 200 }) {
  const pages = []
  const seenIds = new Set()
  const toolCallsById = {}
  let cursor
  let configurationRevision
  for (let page = 0; page < maxPages; page++) {
    const timeout = AbortSignal.any([AbortSignal.timeout(30_000), ...(signal ? [signal] : [])])
    const result = await readSessionHistoryPage({ httpBase, ticket, sessionId, cursor, direction: 'older', signal: timeout })
    if (Number.isSafeInteger(result.session?.configurationRevision)) {
      configurationRevision = result.session.configurationRevision
    }
    const pageMessages = []
    for (const message of Array.isArray(result.messages) ? result.messages : []) {
      if (typeof message?.id !== 'string' || message.id === '' || seenIds.has(message.id)) continue
      seenIds.add(message.id)
      pageMessages.push(message)
    }
    pages.push(pageMessages)
    Object.assign(toolCallsById, result.toolCalls ?? {})
    cursor = typeof result.olderCursor === 'string' && result.olderCursor !== '' ? result.olderCursor : undefined
    if (!cursor || result.messages.length === 0) break
  }
  for (const pageMessages of pages.reverse()) {
    for (const message of pageMessages) {
      for (const frame of historyMessageToFrames(sessionId, message, toolCallsById)) await onFrame(frame)
    }
  }
  return { messageIds: [...seenIds], count: seenIds.size, configurationRevision }
}

function validateResponse(method, params, result) {
  if (!isObject(result)) throw new TypeError('ACP response must be a JSON object')
  if (method === 'session/request_permission') {
    if (result.outcome === 'cancelled') return
    if (result.outcome !== 'selected' || typeof result.optionId !== 'string') {
      throw new TypeError('Permission response must select an available option or cancel')
    }
    const options = Array.isArray(params?.options) ? params.options : []
    if (!options.some(option => option?.optionId === result.optionId)) {
      throw new TypeError('Permission response option was not offered by MonkeyAI')
    }
    return
  }
  if (method === 'elicitation/create') {
    if (!['accept', 'decline', 'cancel'].includes(result.action)) {
      throw new TypeError('Question response action is invalid')
    }
    if (result.action === 'accept' && params?.mode === 'form' && !isObject(result.content)) {
      throw new TypeError('Accepted form response must contain an object')
    }
    return
  }
  throw new TypeError('This ACP request type cannot be answered from the panel')
}
