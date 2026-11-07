import assert from 'node:assert/strict'
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import test from 'node:test'
import { AsyncQueue } from '../src/shared/async-queue.mjs'

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

const SERVER_ORIGIN = 'https://monkeyai.example'
const MACHINE_ID = '00000000-0000-4000-8000-000000000001'
const ACCOUNT_ID = 'srv-' + 'a'.repeat(24)

class FakeWebSocket extends EventTarget {
  static instances = []
  static onClientMessage = null
  static readSessionRequests = []

  constructor(url, protocols) {
    super()
    this.url = url
    this.protocols = protocols
    this.sent = []
    this.closed = false
    FakeWebSocket.instances.push(this)
    queueMicrotask(() => this.dispatchEvent(new Event('open')))
  }

  send(data) {
    if (this.closed) throw new Error('socket closed')
    const message = JSON.parse(data)
    this.sent.push(message)
    FakeWebSocket.onClientMessage?.(this, message)
  }

  close() {
    if (this.closed) return
    this.closed = true
    queueMicrotask(() => this.dispatchEvent(new Event('close')))
  }

  serverSend(message) {
    const event = new Event('message')
    Object.defineProperty(event, 'data', { value: JSON.stringify(message) })
    this.dispatchEvent(event)
  }
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

function createGrant() {
  return {
    kind: 'grant',
    payload: {
      version: 1,
      serverOrigin: SERVER_ORIGIN,
      token: {
        accessToken: 'access-token-1234567890',
        refreshToken: 'refresh-token',
        expiresAt: Date.now() + 600_000,
        scopes: ['device:connect', 'session:read', 'session:control'],
      },
    },
  }
}

function createService({ grant = createGrant(), uplinkQueue = new AsyncQueue() } = {}) {
  const record = { [`dsh-monkeyai-sessions:${ACCOUNT_ID}`]: grant }
  const credentials = {
    async listRecords() { return Object.keys(record).map(key => ({ key })) },
    async readRecord(key) { return record[key] },
    async modifyRecord(key, modifier) {
      const next = await modifier(record[key])
      if (next === undefined) return record[key]
      record[key] = next
      return next
    },
    async deleteRecord(key) { delete record[key] },
  }
  const service = new MonkeyAIRemoteService({
    credentials,
    invocation: { uplink: () => uplinkQueue },
  })
  return service
}

function installAcpAgent() {
  FakeWebSocket.instances = []
  FakeWebSocket.readSessionRequests = []
  FakeWebSocket.onClientMessage = (socket, message) => {
    if (message.method === 'initialize') {
      socket.serverSend({ jsonrpc: '2.0', id: message.id, result: {
        protocolVersion: 1,
        agentCapabilities: { loadSession: true },
      } })
      return
    }
    if (message.method === 'session/load') {
      socket.serverSend({ jsonrpc: '2.0', id: message.id, result: null })
      socket.serverSend({ jsonrpc: '2.0', method: 'session/update', params: {
        sessionId: 'history-session',
        update: { sessionUpdate: 'user_message_chunk', messageId: 'm1', content: { type: 'text', text: 'hello from history' } },
      } })
      return
    }
    if (message.method === 'session/prompt') {
      socket.serverSend({ jsonrpc: '2.0', id: message.id, result: {} })
      socket.serverSend({ jsonrpc: '2.0', method: 'session/update', params: {
        sessionId: 'history-session',
        update: { sessionUpdate: 'agent_message_chunk', messageId: 'm2', content: { type: 'text', text: 'working on it' } },
      } })
    }
  }
  return async (url, init) => {
    const target = String(url)
    if (target.endsWith('/read/session')) {
      const body = JSON.parse(init.body)
      FakeWebSocket.readSessionRequests.push(body)
      // Two pages: the first (cursor-less) returns the newest page with an
      // olderCursor; the second walks back to the oldest page.
      if (body.params?.cursor === 'cursor-page-1') {
        return jsonResponse({
          result: {
            session: { id: 'history-session' },
            messages: [
              { id: 'm0', role: 'user', parts: [{ type: 'text', text: 'older question from http history' }] },
              { id: 'm1', role: 'assistant', parts: [{ type: 'tool_call', toolCallId: 'tool-http-1' }, { type: 'text', text: 'hello from history' }] },
            ],
            toolCalls: {
              'tool-http-1': { id: 'tool-http-1', name: 'Read', title: 'Read file', kind: 'read', status: 'completed', output: 'file body' },
            },
          },
        })
      }
      return jsonResponse({
        result: {
          eventSeq: 10,
          session: { id: 'history-session' },
          messages: [
            { id: 'n1', role: 'user', parts: [{ type: 'text', text: 'newer question from http history' }] },
            { id: 'n2', role: 'assistant', parts: [{ type: 'text', text: 'newer answer from http history' }] },
          ],
          olderCursor: 'cursor-page-1',
        },
      })
    }
    assert.equal(init.method, 'POST')
    assert.ok(target.includes(`/api/v1/endpoints/${MACHINE_ID}/connections`))
    return jsonResponse({ ticket: 'ticket-abc123def456', http_base: SERVER_ORIGIN + '/', expires_in: 900 })
  }
}

async function collect(stream, frames, signal) {
  try {
    for await (const frame of stream) frames.push(frame)
  } catch (error) {
    frames.push({ type: 'stream_failed', message: String(error?.message ?? error) })
  }
}

async function waitFor(predicate, label) {
  for (let i = 0; i < 200; i += 1) {
    if (predicate()) return
    await new Promise(setTimeout => setTimeout(10))
  }
  throw new Error(`Timed out waiting for ${label}`)
}

test('followSession streams history and live notifications for the selected session', async () => {
  const fetchMock = installAcpAgent()
  const originalFetch = globalThis.fetch
  const originalWebSocket = globalThis.WebSocket
  globalThis.fetch = fetchMock
  globalThis.WebSocket = FakeWebSocket
  try {
    const uplink = new AsyncQueue()
    const service = createService({ uplinkQueue: uplink })
    const controller = new AbortController()
    const frames = []
    const stream = service.followSession(
      { accountId: ACCOUNT_ID, machineId: MACHINE_ID, sessionId: 'history-session', cwd: '/work' },
      controller.signal,
    )
    const consuming = collect(stream, frames, controller.signal)

    await waitFor(() => frames.some(frame => frame.type === 'history_loaded'), 'history_loaded')
    await waitFor(() => frames.some(frame => frame.type === 'notification'
      && frame.data?.update?.content?.text === 'hello from history'), 'history notification')

    // Full history arrives over the HTTP read channel before the ACP replay;
    // the replayed m1 chunk is suppressed as a duplicate of the HTTP snapshot.
    assert.equal(FakeWebSocket.readSessionRequests.length, 2)
    assert.equal(FakeWebSocket.readSessionRequests[0].method, '_monkeyai/session/messages')
    assert.equal(FakeWebSocket.readSessionRequests[1].params.cursor, 'cursor-page-1')
    assert.ok(frames.some(frame => frame.type === 'notification'
      && frame.data?.update?.content?.text === 'older question from http history'))
    assert.ok(frames.some(frame => frame.type === 'notification'
      && frame.data?.update?.sessionUpdate === 'tool_call'
      && frame.data?.update?.toolCallId === 'tool-http-1'
      && frame.data?.update?.title === 'Read file'
      && frame.data?.update?.rawOutput?.output === 'file body'))
    // Pages arrive newest-first; the delivered order is chronological.
    const indexOfOlder = frames.findIndex(frame => frame.type === 'notification'
      && frame.data?.update?.content?.text === 'older question from http history')
    const indexOfNewer = frames.findIndex(frame => frame.type === 'notification'
      && frame.data?.update?.content?.text === 'newer question from http history')
    assert.ok(indexOfOlder >= 0 && indexOfNewer > indexOfOlder)
    assert.equal(frames.filter(frame => frame.type === 'notification'
      && frame.data?.update?.content?.text === 'hello from history').length, 1)
    assert.equal(frames.filter(frame => frame.type === 'history_loaded').length, 1)

    uplink.push({ type: 'prompt', text: 'run the task' })
    await waitFor(() => frames.some(frame => frame.type === 'delivery' && frame.data?.accepted), 'delivery accepted')
    await waitFor(() => frames.some(frame => frame.type === 'notification'
      && frame.data?.update?.content?.text === 'working on it'), 'live notification')

    const socket = FakeWebSocket.instances[0]
    assert.deepEqual(socket.protocols, ['monkeyai.v1', 'monkeyai.token.ticket-abc123def456'])
    assert.ok(socket.sent.some(message => message.method === 'session/prompt'
      && message.params.prompt[0].text === 'run the task'))

    controller.abort(new Error('client cancelled'))
    await consuming
    assert.equal(socket.closed, true)
    assert.equal(service.activeAcpConnections.size, 0)
  } finally {
    globalThis.fetch = originalFetch
    globalThis.WebSocket = originalWebSocket
    FakeWebSocket.onClientMessage = null
  }
})

test('followSession reconnects after a post-load drop, then ends when the budget is exhausted', async () => {
  const fetchMock = installAcpAgent()
  const originalFetch = globalThis.fetch
  const originalWebSocket = globalThis.WebSocket
  globalThis.fetch = fetchMock
  globalThis.WebSocket = FakeWebSocket
  try {
    const service = createService()
    const controller = new AbortController()
    const frames = []
    const stream = service.followSession(
      { accountId: ACCOUNT_ID, machineId: MACHINE_ID, sessionId: 'history-session', cwd: '/work' },
      controller.signal,
    )
    const consuming = collect(stream, frames, controller.signal)
    await waitFor(() => frames.some(frame => frame.type === 'history_loaded'), 'history_loaded')

    // First post-load drop reconnects without replaying history.
    FakeWebSocket.instances.at(-1).close()
    await waitFor(() => frames.some(frame => frame.type === 'reconnected'), 'reconnected frame')
    assert.ok(frames.some(frame => frame.type === 'reconnecting'))
    assert.equal(frames.filter(frame => frame.type === 'history_loaded').length, 1)

    // Exhaust the remaining reconnect budget. Each drop triggers another reconnect
    // until the limit is reached, after which an error frame ends the stream.
    for (;;) {
      const before = frames.filter(frame => frame.type === 'reconnecting').length
      FakeWebSocket.instances.at(-1).close()
      try { await waitFor(() => frames.filter(frame => frame.type === 'reconnecting').length > before, 'next reconnecting') }
      catch { break }
      if (frames.some(frame => frame.type === 'error' && frame.code === 'acp_connection_closed')) break
    }
    await consuming
    assert.ok(frames.some(frame => frame.type === 'error' && frame.code === 'acp_connection_closed'))
    assert.ok(frames.filter(frame => frame.type === 'reconnecting').length > 1)
    assert.equal(service.activeAcpConnections.size, 0)
  } finally {
    globalThis.fetch = originalFetch
    globalThis.WebSocket = FakeWebSocket
    FakeWebSocket.onClientMessage = null
  }
})

test('followSession reconnects and re-issues session/load when the socket drops before load resolves', async () => {
  const baseMock = installAcpAgent()
  // Force the HTTP history channel to fail so the ACP replay path is exercised.
  const fetchMock = async (url, init) => {
    if (String(url).endsWith('/read/session')) {
      return { ok: false, status: 503, headers: new Headers(), body: undefined }
    }
    return baseMock(url, init)
  }
  const originalFetch = globalThis.fetch
  const originalWebSocket = globalThis.WebSocket
  globalThis.fetch = fetchMock
  globalThis.WebSocket = FakeWebSocket
  // Override the load handler so the first socket never resolves session/load,
  // forcing a mid-replay drop to keep loadCompleted false.
  const originalLoadHandler = FakeWebSocket.onClientMessage
  let firstLoadSeen = false
  FakeWebSocket.onClientMessage = (socket, message) => {
    if (message.method === 'session/load' && !firstLoadSeen) {
      firstLoadSeen = true
      // Drop the socket instead of responding, mimicking the runtime closing
      // mid-replay before session/load resolves.
      socket.close()
      return
    }
    originalLoadHandler?.(socket, message)
  }
  try {
    const service = createService()
    const controller = new AbortController()
    const frames = []
    const stream = service.followSession(
      { accountId: ACCOUNT_ID, machineId: MACHINE_ID, sessionId: 'history-session', cwd: '/work' },
      controller.signal,
    )
    const consuming = collect(stream, frames, controller.signal)
    await waitFor(() => frames.some(frame => frame.type === 'reconnecting'), 'reconnecting after mid-replay drop')
    await waitFor(() => {
      const reconnectedSocket = FakeWebSocket.instances.at(-1)
      return reconnectedSocket.sent.some(message => message.method === 'session/load')
    }, 'session/load re-issued on reconnect')

    controller.abort()
    await consuming
    assert.equal(service.activeAcpConnections.size, 0)
  } finally {
    globalThis.fetch = originalFetch
    globalThis.WebSocket = originalWebSocket
    FakeWebSocket.onClientMessage = null
  }
})

test('followSession ends when read permission is revoked mid-stream', async () => {
  const fetchMock = installAcpAgent()
  const originalFetch = globalThis.fetch
  const originalWebSocket = globalThis.WebSocket
  globalThis.fetch = fetchMock
  globalThis.WebSocket = FakeWebSocket
  try {
    const uplink = new AsyncQueue()
    const grant = createGrant()
    const service = createService({ uplinkQueue: uplink, grant })
    const controller = new AbortController()
    const frames = []
    const stream = service.followSession(
      { accountId: ACCOUNT_ID, machineId: MACHINE_ID, sessionId: 'history-session', cwd: '/work' },
      controller.signal,
    )
    const consuming = collect(stream, frames, controller.signal)
    await waitFor(() => frames.some(frame => frame.type === 'history_loaded'), 'history_loaded')

    grant.payload.token.scopes = ['device:connect']
    uplink.push({ type: 'prompt', text: 'should be refused' })
    await consuming
    assert.ok(frames.some(frame => frame.type === 'error' && frame.code === 'read_permission_revoked'))
    assert.equal(FakeWebSocket.instances[0].closed, true)
    assert.equal(service.activeAcpConnections.size, 0)
  } finally {
    globalThis.fetch = originalFetch
    globalThis.WebSocket = originalWebSocket
    FakeWebSocket.onClientMessage = null
  }
})

test('followSession rejects prompts when session:control is missing without closing the stream', async () => {
  const fetchMock = installAcpAgent()
  const originalFetch = globalThis.fetch
  const originalWebSocket = globalThis.WebSocket
  globalThis.fetch = fetchMock
  globalThis.WebSocket = FakeWebSocket
  try {
    const uplink = new AsyncQueue()
    const grant = createGrant()
    grant.payload.token.scopes = ['device:connect', 'session:read']
    const service = createService({ uplinkQueue: uplink, grant })
    const controller = new AbortController()
    const frames = []
    const stream = service.followSession(
      { accountId: ACCOUNT_ID, machineId: MACHINE_ID, sessionId: 'history-session', cwd: '/work' },
      controller.signal,
    )
    const consuming = collect(stream, frames, controller.signal)
    await waitFor(() => frames.some(frame => frame.type === 'history_loaded'), 'history_loaded')

    uplink.push({ type: 'prompt', text: 'read-only attempt' })
    await waitFor(() => frames.some(frame => frame.type === 'delivery' && frame.data?.accepted === false), 'rejected delivery')
    const socket = FakeWebSocket.instances[0]
    assert.ok(socket.sent.every(message => message.method !== 'session/prompt'))

    await waitFor(() => frames.some(frame => frame.type === 'notification'
      && frame.data?.update?.content?.text === 'hello from history'), 'history still visible')
    controller.abort()
    await consuming
    assert.equal(socket.closed, true)
  } finally {
    globalThis.fetch = originalFetch
    globalThis.WebSocket = originalWebSocket
    FakeWebSocket.onClientMessage = null
  }
})
