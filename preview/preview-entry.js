import { createRoot } from 'react-dom/client'
import { AsyncQueue } from '../src/shared/async-queue.mjs'
import { apply } from '../src/client/index.js'

const DEMO_ORIGIN = 'https://demo.monkeyai.example'
const DEMO_ACCOUNT = {
  accountId: 'srv-demo000000000000000000000',
  serverOrigin: DEMO_ORIGIN,
  scopes: ['device:connect', 'session:read', 'session:control'],
  expiresAt: Date.now() + 3_600_000,
}

const DEMO_DEVICES = [
  { machineId: '00000000-0000-4000-8000-0000000000a1', displayName: 'MacBook Pro (demo)', platform: 'macos', arch: 'arm64', status: 'online', stale: false },
  { machineId: '00000000-0000-4000-8000-0000000000b2', displayName: 'Office workstation (demo)', platform: 'linux', arch: 'x86_64', status: 'offline', stale: true },
]

const DEMO_SUMMARY = [
  { id: 'session-alpha', machineId: '00000000-0000-4000-8000-0000000000a1', title: 'Refactor pipeline runner', sessionType: 'conversation', startedAt: '2026-11-05T08:00:00Z', lastActiveAt: '2026-11-05T09:12:00Z', deviceStatus: 'online', stale: false },
  { id: 'session-beta', machineId: '00000000-0000-4000-8000-0000000000a1', title: 'Migrate datasets to JuiceFS', sessionType: 'conversation', startedAt: '2026-11-04T14:00:00Z', lastActiveAt: '2026-11-04T15:30:00Z', deviceStatus: 'offline', stale: true },
]

const DEMO_RUNTIME = [
  { id: 'session-alpha', title: 'Refactor pipeline runner', cwd: '/workspace/pipeline-runner' },
  { id: 'session-gamma', title: 'Benchmark inference serving', cwd: '/workspace/serving-bench' },
]

const DEMO_ACCOUNTS = [DEMO_ACCOUNT]

const DEMO_MODELS = [
  { id: 'monkeyai-chat-latest', displayName: 'MonkeyAI Chat', model: 'monkeyai-chat-latest', kind: 'chat', contextWindowTokens: 200_000, supportsVision: true },
  { id: 'monkeyai-reasoning-pro', displayName: 'MonkeyAI Reasoning Pro', model: 'monkeyai-reasoning-pro', kind: 'reasoning', contextWindowTokens: 128_000 },
  { id: 'monkeyai-coder-fast', displayName: 'MonkeyAI Coder Fast', model: 'monkeyai-coder-fast', kind: 'coding', contextWindowTokens: 256_000 },
]

function notification(sessionId, speaker, text) {
  return {
    type: 'notification',
    sessionId,
    method: 'session/update',
    data: { update: { sessionUpdate: `${speaker}_message_chunk`, messageId: `msg-${Math.random().toString(36).slice(2, 8)}`, content: { type: 'text', text } } },
  }
}

class DemoStream {
  constructor(sessionId, title) {
    this.queue = new AsyncQueue()
    this.sessionId = sessionId
    this.title = title
    this.closed = false
    this.model = DEMO_MODELS[0].id
    setTimeout(() => this.queue.push({ type: 'ready', sessionId }), 150)
    setTimeout(() => this.queue.push({ type: 'history_loaded', sessionId, model: this.model }), 400)
    setTimeout(() => this.queue.push(notification(sessionId, 'user', `Summarize the incident from last night's deploy.`)), 650)
    setTimeout(() => this.queue.push(notification(sessionId, 'agent', `Checked the deploy log: rollout 14:32 introduced a config regression; I reverted and verified smoke tests. Drafting a postmortem next.`)), 900)
    setTimeout(() => this.queue.push({
      type: 'notification', sessionId,
      method: 'session/update',
      data: { update: { sessionUpdate: 'tool_call', toolCallId: 'tool-demo-1', title: 'Read deploy/incident-1104.md', status: 'completed', rawOutput: { output: 'Rolled out 14:32, reverted 15:07 after smoke-test failure.' } } },
    }), 1100)
    setTimeout(() => {
      if (this.closed) return
      this.queue.push({
        type: 'request',
        sessionId,
        requestId: 'perm-demo-1',
        method: 'session/request_permission',
        data: {
          sessionId,
          options: [
            { optionId: 'allow-once', name: 'Allow once', kind: 'allow_once' },
            { optionId: 'allow-always', name: 'Always allow postmortem writes', kind: 'allow_always' },
            { optionId: 'reject-once', name: 'Reject' },
          ],
        },
      })
    }, 1300)
  }

  [Symbol.asyncIterator]() {
    return this.queue[Symbol.asyncIterator]()
  }

  send(command) {
    if (this.closed) throw new Error('Demo stream is closed')
    if (command.type === 'prompt') {
      this.queue.push({ type: 'delivery', sessionId: this.sessionId, data: { accepted: true, result: {} } })
      setTimeout(() => {
        if (this.closed) return
        this.queue.push(notification(this.sessionId, 'user', command.text))
      }, 200)
      setTimeout(() => {
        if (this.closed) return
        this.queue.push(notification(this.sessionId, 'agent', `Working on "${command.text}". I will stream progress here and ask before writing anything.`))
      }, 900)
      return
    }
    if (command.type === 'respond') {
      this.queue.push({ type: 'response_sent', sessionId: this.sessionId, requestId: command.requestId })
      const choice = command.result?.optionId === 'allow-once' ? 'Allowed once'
        : command.result?.optionId === 'allow-always' ? 'Always allowed'
          : 'Rejected'
      setTimeout(() => {
        if (this.closed) return
        this.queue.push(notification(this.sessionId, 'agent', `Permission decision received: ${choice}. Continuing the postmortem draft.`))
      }, 500)
      return
    }
    if (command.type === 'cancel') {
      this.queue.push(notification(this.sessionId, 'agent', 'Remote task cancelled from the DSH panel.'))
    }
  }

  dispose() {
    this.closed = true
    this.queue.close()
  }
}

const demoApi = {
  async listAccounts() {
    return DEMO_ACCOUNTS
  },
  async listModels() {
    return { models: DEMO_MODELS }
  },
  async authorizationStatus() {
    return { status: 'pending' }
  },
  async beginAuthorization({ serverAddress }) {
    return {
      requestId: 'demo-request-1',
      serverOrigin: serverAddress || DEMO_ORIGIN,
      authorizationUrl: `${DEMO_ORIGIN}/oauth/authorize?response_type=code&client_id=monkeyai-desktop&demo=1`,
      redirectUri: 'monkeyai-desktop://oauth/callback',
      expiresAt: Date.now() + 600_000,
    }
  },
  async signIn() {
    return DEMO_ACCOUNT
  },
  async completeAuthorization() {
    return DEMO_ACCOUNT
  },
  async disconnect() {
    return { disconnected: true }
  },
  async listDevices({ machineId: _ignored, page }) {
    void _ignored
    void page
    return { items: DEMO_DEVICES, total: DEMO_DEVICES.length }
  },
  async listSessions() {
    return { items: DEMO_SUMMARY, page: 1, pageSize: 50, total: DEMO_SUMMARY.length, serverTime: new Date().toISOString() }
  },
  async listRuntimeSessions() {
    return { sessions: DEMO_RUNTIME }
  },
  async createSession({ cwd, model }) {
    void model
    const sessionId = `session-new-${Date.now().toString(36)}`
    const created = { sessionId, title: 'New remote session', cwd: cwd || '/root', model: DEMO_MODELS[0].id }
    DEMO_RUNTIME.unshift({ id: created.sessionId, title: created.title, cwd: created.cwd })
    return created
  },
  async switchModel({ model }) {
    return { switched: true, model }
  },
  followSession({ sessionId }) {
    const runtime = DEMO_RUNTIME.find(item => item.id === sessionId)
    return new DemoStream(sessionId, runtime?.title ?? sessionId)
  },
}

const root = createRoot(document.getElementById('root'))
let mainEntry
let disposed = false

const owner = {
  layout: { selectPanel() {} },
  remote: {
    async $mount() {
      return async () => {}
    },
  },
  async inject(_dependencies, callback) {
    callback({ remote: { monkeyaiSessions: demoApi } })
  },
  slots: {
    inject(name, register) {
      const entry = register()
      if (name === 'main') mainEntry = entry
    },
    register(config, component) {
      return { config, component }
    },
  },
}

async function main() {
  const disposer = await apply({
    plugin(factory) {
      const cleanup = factory(owner)
      return {
        then(resolve) { resolve() },
        async dispose() {
          disposed = true
          await cleanup?.()
        },
      }
    },
  })

  if (mainEntry && !disposed) {
    root.render(mainEntry.component({}))
  }
  window.__previewDispose = async () => {
    root.unmount()
    await disposer?.()
  }
}

void main()
