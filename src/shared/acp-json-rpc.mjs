export class AcpJsonRpcClient {
  #socket
  #nextId = 1
  #pending = new Map()
  #listeners = new Set()
  #closeListeners = new Set()
  #closed = false
  #closeReason
  #timeoutMs

  constructor(socket, { timeoutMs = 30_000 } = {}) {
    this.#socket = socket
    this.#timeoutMs = timeoutMs
    socket.addEventListener('message', event => this.#onMessage(event.data))
    socket.addEventListener('close', () => this.close(new Error('ACP connection closed')))
    socket.addEventListener('error', () => this.close(new Error('ACP connection failed')))
  }

  request(method, params = {}, { signal, timeoutMs = this.#timeoutMs } = {}) {
    if (this.#closed) return Promise.reject(new Error('ACP connection is closed'))
    if (typeof method !== 'string' || method === '') return Promise.reject(new TypeError('ACP method is required'))
    if (signal?.aborted) return Promise.reject(signal.reason ?? new Error('ACP request cancelled'))

    const id = this.#nextId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#settle(id, new Error(`ACP request timed out: ${method}`))
      }, timeoutMs)
      const onAbort = () => this.#settle(id, signal.reason ?? new Error('ACP request cancelled'))
      signal?.addEventListener('abort', onAbort, { once: true })
      this.#pending.set(id, { resolve, reject, timer, signal, onAbort, method })

      try {
        this.#send({ jsonrpc: '2.0', id, method, params })
      } catch (error) {
        this.#settle(id, error instanceof Error ? error : new Error('ACP request could not be sent'))
      }
    })
  }

  respond(id, result) {
    if (this.#closed) throw new Error('ACP connection is closed')
    this.#send({ jsonrpc: '2.0', id, result })
  }

  notify(method, params = {}) {
    if (this.#closed) throw new Error('ACP connection is closed')
    this.#send({ jsonrpc: '2.0', method, params })
  }

  subscribe(listener) {
    if (this.#closed) throw new Error('ACP connection is closed')
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  subscribeClose(listener) {
    if (this.#closed) {
      listener(this.#closeReason)
      return () => {}
    }
    this.#closeListeners.add(listener)
    return () => this.#closeListeners.delete(listener)
  }

  close(reason = new Error('ACP connection closed')) {
    if (this.#closed) return
    this.#closed = true
    this.#closeReason = reason
    for (const id of this.#pending.keys()) this.#settle(id, reason)
    this.#listeners.clear()
    for (const listener of this.#closeListeners) {
      try { listener(reason) } catch {}
    }
    this.#closeListeners.clear()
    try {
      this.#socket.close()
    } catch {
      // The socket may already be closed by the transport.
    }
  }

  #onMessage(data) {
    if (typeof data !== 'string' || data.length > 8 * 1024 * 1024) {
      this.close(new Error('ACP frame is not a bounded text message'))
      return
    }

    let message
    try {
      message = JSON.parse(data)
    } catch {
      this.close(new Error('ACP frame is invalid JSON'))
      return
    }
    if (message?.jsonrpc !== '2.0') {
      this.close(new Error('ACP frame has an unsupported JSON-RPC version'))
      return
    }

    if (Object.hasOwn(message, 'id') && typeof message.method === 'string') {
      if (!isJsonRpcId(message.id) || message.method === '') {
        this.close(new Error('ACP request has an invalid method or ID'))
        return
      }
      this.#publish({ kind: 'request', id: message.id, method: message.method, params: message.params ?? {} })
      return
    }
    if (Object.hasOwn(message, 'id')) {
      const pending = this.#pending.get(message.id)
      if (!pending) return
      const hasResult = Object.hasOwn(message, 'result')
      const hasError = Object.hasOwn(message, 'error')
      if (hasResult === hasError) {
        this.close(new Error('ACP response must contain exactly one result or error'))
        return
      }
      if (hasError) {
        const responseError = message.error
        if (!responseError || typeof responseError !== 'object' || !Number.isInteger(responseError.code)
          || typeof responseError.message !== 'string') {
          this.close(new Error('ACP response contains an invalid error'))
          return
        }
        const error = new Error(responseError.message)
        error.code = responseError.code
        if (responseError.data !== undefined) error.data = responseError.data
        this.#settle(message.id, error)
      } else {
        this.#settle(message.id, undefined, message.result)
      }
      return
    }
    if (typeof message.method === 'string') {
      if (message.method === '') {
        this.close(new Error('ACP notification has an invalid method'))
        return
      }
      this.#publish({ kind: 'notification', method: message.method, params: message.params ?? {} })
      return
    }
    this.close(new Error('ACP frame is neither a response nor a notification'))
  }

  #publish(event) {
    for (const listener of this.#listeners) {
      try {
        listener(event)
      } catch {
        // A UI observer cannot disrupt RPC correlation for the session.
      }
    }
  }

  #send(message) {
    const payload = JSON.stringify(message)
    if (Buffer.byteLength(payload) > 1_048_576) throw new Error('ACP outbound frame exceeds the size limit')
    this.#socket.send(payload)
  }

  #settle(id, error, value) {
    const pending = this.#pending.get(id)
    if (!pending) return
    this.#pending.delete(id)
    clearTimeout(pending.timer)
    pending.signal?.removeEventListener('abort', pending.onAbort)
    if (error) pending.reject(error)
    else pending.resolve(value)
  }
}

function isJsonRpcId(value) {
  return typeof value === 'string' || (typeof value === 'number' && Number.isSafeInteger(value))
}

export function acpWebSocketAddress(serverOrigin, machineId) {
  if (typeof machineId !== 'string' || machineId === '' || machineId.length > 256 || !/^[A-Za-z0-9._-]+$/.test(machineId)) {
    throw new TypeError('Machine ID is invalid')
  }
  const origin = new URL(serverOrigin)
  const protocol = origin.protocol === 'https:' ? 'wss:' : origin.protocol === 'http:' ? 'ws:' : ''
  if (!protocol) throw new TypeError('MonkeyAI server must use HTTP(S)')
  origin.protocol = protocol
  origin.pathname = `/api/v1/endpoints/${encodeURIComponent(machineId)}/proxy/acp`
  origin.search = ''
  origin.hash = ''
  return origin.toString()
}

export function acpSubprotocols(ticket) {
  if (typeof ticket !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(ticket)) throw new TypeError('Connection ticket is invalid')
  return ['monkeyai.v1', `monkeyai.token.${ticket}`]
}
export async function openAcpJsonRpc(serverOrigin, machineId, ticket, {
  signal,
  WebSocketCtor = globalThis.WebSocket,
  timeoutMs = 15_000,
} = {}) {
  if (typeof WebSocketCtor !== 'function') throw new Error('WebSocket is unavailable in the DSH Host runtime')
  if (signal?.aborted) throw signal.reason ?? new Error('ACP connection cancelled')

  const socket = new WebSocketCtor(acpWebSocketAddress(serverOrigin, machineId), acpSubprotocols(ticket))
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error('ACP connection timed out')), timeoutMs)
    const onAbort = () => finish(signal.reason ?? new Error('ACP connection cancelled'))
    const cleanup = () => {
      clearTimeout(timer)
      socket.removeEventListener('open', onOpen)
      socket.removeEventListener('error', onError)
      socket.removeEventListener('close', onClose)
      signal?.removeEventListener('abort', onAbort)
    }
    const finish = error => {
      cleanup()
      if (error) {
        try { socket.close() } catch {}
        reject(error)
      } else {
        resolve()
      }
    }
    const onOpen = () => finish()
    const onError = () => finish(new Error('ACP WebSocket handshake failed'))
    const onClose = () => finish(new Error('ACP WebSocket closed before opening'))
    socket.addEventListener('open', onOpen, { once: true })
    socket.addEventListener('error', onError, { once: true })
    socket.addEventListener('close', onClose, { once: true })
    signal?.addEventListener('abort', onAbort, { once: true })
  })
  return new AcpJsonRpcClient(socket)
}
