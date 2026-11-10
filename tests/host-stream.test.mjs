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
  static modelSetRequests = []
  static configurationRevision = 7
  static initializeParams = []
  static historyReadCount = 0

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
  FakeWebSocket.modelSetRequests = []
  FakeWebSocket.configurationRevision = 7
  FakeWebSocket.initializeParams = []
  FakeWebSocket.historyReadCount = 0
  FakeWebSocket.onClientMessage = (socket, message) => {
    if (message.method === 'initialize') {
      FakeWebSocket.initializeParams.push(message.params)
      socket.serverSend({ jsonrpc: '2.0', id: message.id, result: {
        protocolVersion: 1,
        agentCapabilities: { loadSession: true },
      } })
      return
    }
    if (message.method === 'session/load') {
      socket.loadedSession = true
      socket.serverSend({ jsonrpc: '2.0', id: message.id, result: null })
      socket.serverSend({ jsonrpc: '2.0', method: 'session/update', params: {
        _meta: { messageId: 'm1', replay: true },
        sessionId: 'history-session',
        update: { sessionUpdate: 'user_message_chunk', messageId: 'm1', content: { type: 'text', text: 'hello from history' } },
      } })
      return
    }
    if (message.method === '_monkeyai/session/model/set') {
      FakeWebSocket.modelSetRequests.push(message.params)
      const expected = message.params?._meta?.expectedRevision
      // The runtime rejects a stale revision and reports the current one.
      if (expected !== FakeWebSocket.configurationRevision) {
        socket.serverSend({ jsonrpc: '2.0', id: message.id, error: {
          code: -32602, message: 'Invalid params',
          data: { reason: 'configuration_conflict', configurationRevision: FakeWebSocket.configurationRevision },
        } })
        return
      }
      FakeWebSocket.configurationRevision += 1
      socket.serverSend({ jsonrpc: '2.0', id: message.id, result: {
        model: message.params.model,
        _meta: { configurationRevision: FakeWebSocket.configurationRevision },
      } })
      return
    }
    if (message.method === 'session/prompt') {
      socket.serverSend({ jsonrpc: '2.0', id: message.id, result: {} })
      const promptText = message.params?.prompt?.[0]?.text ?? ''
      const isExternal = promptText === 'external client prompt'
      const update = { jsonrpc: '2.0', method: 'session/update', params: {
        sessionId: 'history-session',
        _meta: { messageId: isExternal ? 'm-external' : 'm2' },
        update: { sessionUpdate: 'agent_message_chunk', messageId: isExternal ? 'm-external' : 'm2', content: { type: 'text', text: isExternal ? 'reply from external client' : 'working on it' } },
      } }
      socket.serverSend(update)
      // A prompt from another client is broadcast to connections which loaded
      // this session, matching the runtime's live ACP subscription behavior.
      for (const subscriber of FakeWebSocket.instances) {
        if (subscriber !== socket && subscriber.loadedSession && !subscriber.closed) subscriber.serverSend(update)
      }
    }
  }
  return async (url, init) => {
    const target = String(url)
    if (target.endsWith('/read/session')) {
      const body = JSON.parse(init.body)
      if (body.method === '_monkeyai/session/state/get') {
        // Some runtime builds (e.g. the 193 server) omit state.status from the
        // state snapshot; the panel must fall back to the history channel.
        return jsonResponse({
          result: {
            sessionId: 'history-session',
            eventSeq: 12,
            state: { files: [], tasks: [], plan: [], resourceIds: [], resourcePreferences: {} },
          },
        })
      }
      FakeWebSocket.readSessionRequests.push(body)
      FakeWebSocket.historyReadCount += 1
      // Reads 1-3 are the model probe and the two full-history pages; reads
      // 4+ are the post-mount catch-up and later refreshes.
      if (FakeWebSocket.historyReadCount > 3) {
        const refreshedMessage = FakeWebSocket.historyReadCount === 4
          ? { id: 'm-catchup', role: 'assistant', parts: [{ type: 'text', text: 'turn from history catch-up' }] }
          : { id: 'm-refresh', role: 'assistant', parts: [{ type: 'text', text: 'complete large reply from history refresh' }] }
        return jsonResponse({
          result: {
            eventSeq: 11,
            // Mimic the 193 runtime: the session carries its turn status here.
            session: { id: 'history-session', configurationRevision: FakeWebSocket.configurationRevision, status: 'running', model: 'model-current' },
            messages: [
              { id: 'n2', role: 'assistant', parts: [{ type: 'text', text: 'newer answer from http history' }] },
              refreshedMessage,
            ],
            toolCalls: {},
          },
        })
      }
      // Two pages: the first (cursor-less) returns the newest page with an
      // olderCursor; the second walks back to the oldest page.
      if (body.params?.cursor === 'cursor-page-1') {
        return jsonResponse({
          result: {
            session: { id: 'history-session', configurationRevision: FakeWebSocket.configurationRevision, model: 'model-current' },
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
          session: { id: 'history-session', configurationRevision: FakeWebSocket.configurationRevision, model: 'model-current' },
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
    // The HTTP history is yielded before ACP mount so the panel can render it
    // while session/load is still initializing.
    await waitFor(() => FakeWebSocket.instances[0]?.sent.some(message => message.method === 'session/load'), 'session/load request')
    const initCapabilities = FakeWebSocket.initializeParams[0]?.clientCapabilities?._meta
    assert.equal(initCapabilities?.historyHTTP, true)
    assert.equal(initCapabilities?.historyRefresh, true)
    assert.ok(FakeWebSocket.instances[0].sent.some(message => message.method === 'session/load'))
    await waitFor(() => frames.some(frame => frame.type === 'notification'
      && frame.data?.update?.content?.text === 'hello from history'), 'history notification')
    await waitFor(() => frames.some(frame => frame.data?._meta?.messageId === 'm-catchup'), 'post-mount history catch-up')
    await waitFor(() => frames.some(frame => frame.type === 'notification'
      && frame.method === '_monkeyai/session/state'
      && frame.data?.state?.status === 'running'), 'initial session state seed')

    // Full history arrives over the HTTP read channel before the ACP replay;
    // the replayed m1 chunk is suppressed as a duplicate of the HTTP snapshot.
    // Reads in order: (1) limit:1 model probe, (2-3) full-history pages,
    // (4) post-mount catch-up, (5) limit:1 status probe seeded from
    // session.status (the state/get snapshot carries no status on this
    // runtime).
    assert.equal(FakeWebSocket.readSessionRequests.length, 5)
    assert.equal(FakeWebSocket.readSessionRequests[0].method, '_monkeyai/session/messages')
    assert.equal(FakeWebSocket.readSessionRequests[2].params.cursor, 'cursor-page-1')
    assert.equal(FakeWebSocket.readSessionRequests[4].params.limit, 1)
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
    assert.ok(frames.some(frame => frame.type === 'notification'
      && frame.data?._meta?.messageId === 'm-catchup'
      && frame.data?.update?.sessionUpdate === 'agent_message'
      && frame.data?.update?.content?.text === 'turn from history catch-up'))
    assert.equal(frames.filter(frame => frame.type === 'notification'
      && frame.data?.update?.content?.text === 'hello from history').length, 1)
    assert.equal(frames.filter(frame => frame.type === 'history_loaded').length, 1)
    // The model picker must preselect the session's current model: the
    // history channel's session object is the only source that carries it,
    // and the value must ride inside `data` (top-level extras are stripped).
    const historyLoadedFrame = frames.find(frame => frame.type === 'history_loaded')
    assert.equal(historyLoadedFrame.data?.model, 'model-current')
    // The model also syncs early via a dedicated notification, before the
    // full history walk completes.
    assert.equal(frames[0]?.type, 'notification')
    assert.equal(frames[0]?.method, '_monkeyai/session/model')
    assert.equal(frames[0]?.data?.model, 'model-current')
    assert.ok(frames.some(frame => frame.type === 'notification'
      && frame.method === '_monkeyai/session/model'
      && frame.data?.model === 'model-current'), 'early model notification')

    // If the panel opens mid-turn, the HTTP snapshot may already contain a
    // partial message. Non-replay chunks with that same message id must still
    // pass through and append the remainder.
    FakeWebSocket.instances[0].serverSend({ jsonrpc: '2.0', method: 'session/update', params: {
      sessionId: 'history-session',
      _meta: { messageId: 'm1', replay: false },
      update: { sessionUpdate: 'agent_message_chunk', messageId: 'm1', content: { type: 'text', text: ' live continuation' } },
    } })
    await waitFor(() => frames.some(frame => frame.type === 'notification'
      && frame.data?.update?.content?.text === ' live continuation'), 'live continuation of snapshot message')

    uplink.push({ type: 'prompt', text: 'run the task' })
    await waitFor(() => frames.some(frame => frame.type === 'delivery' && frame.data?.accepted), 'delivery accepted')
    await waitFor(() => frames.some(frame => frame.type === 'notification'
      && frame.data?.update?.content?.text === 'working on it'), 'live notification')

    // A second MonkeyAI client sends into the same session. Its turn must be
    // broadcast over the already loaded DSH subscription without a refresh.
    const external = new FakeWebSocket('ws://external-client', ['monkeyai.v1'])
    external.send(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: 1, clientInfo: { name: 'external', version: '0' }, clientCapabilities: {} } }))
    external.send(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'session/prompt', params: {
      sessionId: 'history-session', prompt: [{ type: 'text', text: 'external client prompt' }],
    } }))
    await waitFor(() => frames.some(frame => frame.type === 'notification'
      && frame.data?.update?.content?.text === 'reply from external client'), 'external live notification')

    // The runtime broadcasts turn state to every subscribed client; the panel
    // must surface it so a remote-initiated turn shows as 进行中.
    FakeWebSocket.instances[0].serverSend({ jsonrpc: '2.0', method: '_monkeyai/session/state', params: {
      sessionId: 'history-session', eventSeq: 13, state: { status: 'running' },
    } })
    await waitFor(() => frames.some(frame => frame.type === 'notification'
      && frame.method === '_monkeyai/session/state'
      && frame.data?.state?.status === 'running'
      && frame.data?.eventSeq === 13), 'remote turn running state')
    FakeWebSocket.instances[0].serverSend({ jsonrpc: '2.0', method: '_monkeyai/session/state', params: {
      sessionId: 'history-session', eventSeq: 14, state: { status: 'idle' }, finish: true,
    } })
    await waitFor(() => frames.some(frame => frame.type === 'notification'
      && frame.method === '_monkeyai/session/state'
      && frame.data?.state?.status === 'idle'), 'remote turn idle state')

    // Oversized replies are represented by a history_changed notification;
    // refresh the HTTP cursor window and replace any partial message snapshot.
    FakeWebSocket.instances[0].serverSend({ jsonrpc: '2.0', method: '_monkeyai/session/history_changed', params: {
      sessionId: 'history-session', eventSeq: 11, messageId: 'm-refresh',
    } })
    await waitFor(() => frames.some(frame => frame.type === 'notification'
      && frame.data?._meta?.messageId === 'm-refresh'
      && frame.data?.update?.sessionUpdate === 'agent_message'
      && frame.data?.update?.content?.text === 'complete large reply from history refresh'), 'HTTP history delta')

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
    await waitFor(() => FakeWebSocket.instances.some(socket => socket.loadedSession), 'mounted ACP session')

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

test('followSession retries a model switch when another client advanced the configuration revision', async () => {
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
      && frame.method === '_monkeyai/session/state'), 'ACP setup complete')

    // Another client edits the session after the panel read its revision.
    FakeWebSocket.configurationRevision += 3

    uplink.push({ type: 'switch_model', model: 'model-b' })
    await waitFor(() => frames.some(frame => frame.type === 'model_switched'), 'model_switched')

    const switched = frames.find(frame => frame.type === 'model_switched')
    assert.equal(switched.data.model, 'model-b')
    assert.ok(!frames.some(frame => frame.type === 'model_switch_failed'))
    // First attempt used the stale revision, the retry used the reported one.
    assert.equal(FakeWebSocket.modelSetRequests.length, 2)
    assert.notEqual(
      FakeWebSocket.modelSetRequests[0]._meta.expectedRevision,
      FakeWebSocket.modelSetRequests[1]._meta.expectedRevision,
    )

    // A second switch reuses the revision learned from the previous result.
    uplink.push({ type: 'switch_model', model: 'model-c' })
    await waitFor(() => frames.filter(frame => frame.type === 'model_switched').length === 2, 'second model_switched')
    assert.equal(FakeWebSocket.modelSetRequests.length, 3)

    controller.abort(new Error('client cancelled'))
    await consuming
  } finally {
    globalThis.fetch = originalFetch
    globalThis.WebSocket = originalWebSocket
    FakeWebSocket.onClientMessage = null
  }
})
