import { register } from 'node:module'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'

const stubUrl = pathToFileURL(resolve('tests/stubs/dsh-protocol-stub.mjs')).href

register('data:text/javascript,' + encodeURIComponent(
  `export function resolve(specifier, context, next) {
    if (specifier === '@deepseek-ai/dsh-typert-protocol' || specifier === '@deepseek-ai/dsh-credentials' || specifier === '@deepseek-ai/dsh-typert-protocol/remote-info' || specifier === 'zod') {
      return { url: ${JSON.stringify(stubUrl)}, shortCircuit: true }
    }
    return next(specifier, context)
  }`
), import.meta.url)

const { MonkeyAIRemoteService } = await import('../src/host/monkeyai-remote.js')

function createCredentialsStub(initialRecords = {}) {
  const records = new Map(Object.entries(initialRecords))
  return {
    async listRecords() { return [...records.keys()].map(key => ({ key })) },
    async readRecord(key) { return records.get(key) },
    async modifyRecord(key, modifier) {
      const current = records.get(key)
      const next = await modifier(current)
      if (next === undefined) return current
      records.set(key, next)
      return next
    },
    async deleteRecord(key) { records.delete(key) },
  }
}

const SERVER_ORIGIN = 'https://monkeyai.example'
const ACCOUNT_ID = 'srv-' + 'a'.repeat(24)
const VALID_TOKEN = {
  accessToken: 'access-token-1234567890',
  refreshToken: 'refresh-token',
  expiresAt: Date.now() + 60_000,
  scopes: ['device:connect', 'session:read'],
}
const MACHINE_ID = '00000000-0000-4000-8000-000000000001'

function grantRecord(serverOrigin = SERVER_ORIGIN, scopes = VALID_TOKEN.scopes) {
  return { kind: 'grant', payload: { version: 1, serverOrigin, token: { ...VALID_TOKEN, scopes } } }
}

function jsonResponse(obj) {
  const text = JSON.stringify(obj)
  const encoded = new TextEncoder().encode(text)
  let sent = false
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-length': String(encoded.byteLength) }),
    body: {
      getReader() {
        return {
          read: async () => {
            if (sent) return { done: true, value: undefined }
            sent = true
            return { done: false, value: encoded }
          },
        }
      },
    },
  }
}

test('listAccounts reads only valid grants and sorts by server origin', async () => {
  const validGrant = grantRecord('https://alpha.example')
  const credentials = createCredentialsStub({
    'dsh-monkeyai-sessions:srv-bbb': validGrant,
    'dsh-monkeyai-sessions:srv-ccc': { kind: 'grant', payload: { version: 2 } },
    'other-package:srv-aaa': validGrant,
  })
  const service = new MonkeyAIRemoteService({ credentials, invocation: undefined })
  const accounts = await service.listAccounts()
  assert.equal(accounts.length, 1)
  assert.equal(accounts[0].serverOrigin, 'https://alpha.example')
})

test('beginAuthorization stores pending request with PKCE URL', () => {
  const service = new MonkeyAIRemoteService({ credentials: createCredentialsStub(), invocation: undefined })
  const result = service.beginAuthorization({ serverAddress: SERVER_ORIGIN })
  assert.ok(result.requestId)
  assert.equal(result.serverOrigin, SERVER_ORIGIN)
  assert.ok(result.authorizationUrl.includes('/oauth/authorize'))
})

test('beginAuthorization rejects invalid server address', () => {
  const service = new MonkeyAIRemoteService({ credentials: createCredentialsStub(), invocation: undefined })
  assert.throws(() => service.beginAuthorization({ serverAddress: 'not-a-url' }), /valid HTTP/)
})

test('completeAuthorization rejects unknown request ID', async () => {
  const service = new MonkeyAIRemoteService({ credentials: createCredentialsStub(), invocation: undefined })
  await assert.rejects(
    service.completeAuthorization({ requestId: 'unknown', callbackUrl: 'monkeyai-desktop://oauth/callback?code=x&state=y' }),
    /unavailable or expired/,
  )
})

test('disconnect deletes credentials', async () => {
  const key = `dsh-monkeyai-sessions:${ACCOUNT_ID}`
  const credentials = createCredentialsStub({ [key]: grantRecord() })
  const service = new MonkeyAIRemoteService({ credentials, invocation: undefined })
  const result = await service.disconnect({ accountId: ACCOUNT_ID })
  assert.deepEqual(result, { disconnected: true })
  assert.equal(await credentials.readRecord(key), undefined)
})

test('listDevices rejects when device:connect scope is missing', async () => {
  const key = `dsh-monkeyai-sessions:${ACCOUNT_ID}`
  const credentials = createCredentialsStub({ [key]: grantRecord(SERVER_ORIGIN, ['session:read']) })
  const service = new MonkeyAIRemoteService({ credentials, invocation: undefined })
  await assert.rejects(service.listDevices({ accountId: ACCOUNT_ID }), /device:connect/)
})

test('listSessions rejects when session:read scope is missing', async () => {
  const key = `dsh-monkeyai-sessions:${ACCOUNT_ID}`
  const credentials = createCredentialsStub({ [key]: grantRecord(SERVER_ORIGIN, ['device:connect']) })
  const service = new MonkeyAIRemoteService({ credentials, invocation: undefined })
  await assert.rejects(
    service.listSessions({ accountId: ACCOUNT_ID, machineId: MACHINE_ID }),
    /session:read/,
  )
})

test('followSession rejects without device:connect', async () => {
  const key = `dsh-monkeyai-sessions:${ACCOUNT_ID}`
  const credentials = createCredentialsStub({ [key]: grantRecord(SERVER_ORIGIN, ['session:read']) })
  const service = new MonkeyAIRemoteService({ credentials, invocation: undefined })
  const controller = new AbortController()
  const stream = service.followSession(
    { accountId: ACCOUNT_ID, machineId: MACHINE_ID, sessionId: 's1', cwd: '/work' },
    controller.signal,
  )
  await assert.rejects(async () => { for await (const _ of stream) {} }, /device:connect/)
  controller.abort()
})

test('dispose clears all state', async () => {
  const service = new MonkeyAIRemoteService({ credentials: createCredentialsStub(), invocation: undefined })
  await service.dispose()
  assert.equal(service.activeAcpConnections.size, 0)
  assert.equal(service.pendingAuthorizations.size, 0)
})

test('loopback authorization captures the browser callback and completes automatically', async () => {
  const key = `dsh-monkeyai-sessions:${ACCOUNT_ID}`
  const credentials = createCredentialsStub()
  const service = new MonkeyAIRemoteService({ credentials, invocation: undefined })
  const realFetch = globalThis.fetch
  const tokenRequests = []
  globalThis.fetch = async (url, init) => {
    const target = String(url)
    if (target.endsWith('/oauth/token')) {
      tokenRequests.push(Object.fromEntries(new URLSearchParams(init.body)))
      return jsonResponse({ access_token: 'access-token-1234567890', refresh_token: 'refresh-token', token_type: 'Bearer', expires_in: 3600, scope: 'device:connect session:read session:control' })
    }
    return { ok: false, status: 404, headers: new Headers(), body: { getReader: () => ({ read: async () => ({ done: true }) }) } }
  }
  try {
    const start = await service.beginAuthorization({ serverAddress: SERVER_ORIGIN, callbackMode: 'loopback' })
    assert.match(start.authorizationUrl, /redirect_uri=http%3A%2F%2F127\.0\.0\.1%3A\d+%2Foauth%2Fcallback/)
    const redirect = new URL(start.authorizationUrl).searchParams.get('redirect_uri')
    const port = new URL(redirect).port

    assert.equal((await service.authorizationStatus({ requestId: start.requestId })).status, 'pending')

    const pendingAuth = [...service.pendingAuthorizations.values()][0]
    const callbackUrl = `http://127.0.0.1:${port}/oauth/callback?code=auth-code-123&state=${encodeURIComponent(pendingAuth.auth.state)}`

    const response = await realFetch(callbackUrl)
    assert.equal(response.status, 200)
    assert.match(await response.text(), /Return to the DSH panel/)

    const status = await service.authorizationStatus({ requestId: start.requestId })
    assert.equal(status.status, 'completed')
    assert.equal(status.account.serverOrigin, SERVER_ORIGIN)
    const stored = await credentials.readRecord(`dsh-monkeyai-sessions:${status.account.accountId}`)
    assert.equal(stored?.payload?.token?.accessToken, 'access-token-1234567890')

    assert.equal(tokenRequests.length, 1)
    assert.equal(tokenRequests[0].redirect_uri, redirect)
    assert.equal(tokenRequests[0].code, 'auth-code-123')
    assert.ok(tokenRequests[0].code_verifier)
  } finally {
    globalThis.fetch = realFetch
    await service.dispose()
  }
  assert.equal(service.pendingAuthorizations.size, 0)
})
