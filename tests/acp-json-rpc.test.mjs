import assert from 'node:assert/strict'
import test from 'node:test'
import { AcpJsonRpcClient, acpSubprotocols, acpWebSocketAddress } from '../src/shared/acp-json-rpc.mjs'

class FakeSocket extends EventTarget {
  sent = []
  closed = false

  send(value) { this.sent.push(JSON.parse(value)) }
  close() {
    this.closed = true
    this.dispatchEvent(new Event('close'))
  }
  receive(value) {
    const event = new Event('message')
    Object.defineProperty(event, 'data', { value: JSON.stringify(value) })
    this.dispatchEvent(event)
  }
}

test('ACP requests correlate JSON-RPC responses and notifications', async () => {
  const socket = new FakeSocket()
  const client = new AcpJsonRpcClient(socket)
  const events = []
  client.subscribe(event => events.push(event))

  const response = client.request('session/list', { page: 1 })
  assert.deepEqual(socket.sent[0], { jsonrpc: '2.0', id: 1, method: 'session/list', params: { page: 1 } })
  socket.receive({ jsonrpc: '2.0', method: 'session/update', params: { sessionId: 's-1' } })
  socket.receive({ jsonrpc: '2.0', id: 1, result: { sessions: [] } })

  assert.deepEqual(await response, { sessions: [] })
  assert.deepEqual(events, [{ kind: 'notification', method: 'session/update', params: { sessionId: 's-1' } }])
})

test('ACP server requests are surfaced and can be answered', () => {
  const socket = new FakeSocket()
  const client = new AcpJsonRpcClient(socket)
  const events = []
  client.subscribe(event => events.push(event))

  socket.receive({ jsonrpc: '2.0', id: 'permission-1', method: 'session/request_permission', params: { sessionId: 's-1' } })
  client.respond('permission-1', { outcome: 'selected', optionId: 'allow-once' })

  assert.deepEqual(events, [{
    kind: 'request',
    id: 'permission-1',
    method: 'session/request_permission',
    params: { sessionId: 's-1' },
  }])
  assert.deepEqual(socket.sent[0], {
    jsonrpc: '2.0',
    id: 'permission-1',
    result: { outcome: 'selected', optionId: 'allow-once' },
  })
})

test('ACP errors reject requests and close clears pending requests', async () => {
  const socket = new FakeSocket()
  const client = new AcpJsonRpcClient(socket)
  const response = client.request('session/load')
  socket.receive({ jsonrpc: '2.0', id: 1, error: { code: -32601, message: 'Method not found' } })
  await assert.rejects(response, /Method not found/)

  const pending = client.request('session/list')
  client.close(new Error('ended'))
  await assert.rejects(pending, /ended/)
  assert.equal(socket.closed, true)
})

test('ACP websocket address and subprotocols are restricted to the selected target', () => {
  assert.equal(
    acpWebSocketAddress('https://ai.example.test', '00112233-4455-6677-8899-aabbccddeeff'),
    'wss://ai.example.test/api/v1/endpoints/00112233-4455-6677-8899-aabbccddeeff/proxy/acp',
  )
  assert.equal(
    acpWebSocketAddress('http://ai.example.test', 'MacBook-Pro.local'),
    'ws://ai.example.test/api/v1/endpoints/MacBook-Pro.local/proxy/acp',
  )
  assert.throws(() => acpWebSocketAddress('https://ai.example.test', 'bad id'), /Machine ID/)
  assert.deepEqual(acpSubprotocols('abcdefghijklmnop_123456'), [
    'monkeyai.v1',
    'monkeyai.token.abcdefghijklmnop_123456',
  ])
  assert.throws(() => acpSubprotocols('short'), /invalid/)
})

test('ACP malformed responses close the connection and notify close listeners', async () => {
  const socket = new FakeSocket()
  const client = new AcpJsonRpcClient(socket)
  const closed = []
  client.subscribeClose(reason => closed.push(reason.message))

  const response = client.request('session/load')
  socket.receive({ jsonrpc: '2.0', id: 1 })
  await assert.rejects(response, /exactly one result or error/)
  assert.deepEqual(closed, ['ACP response must contain exactly one result or error'])
  assert.equal(socket.closed, true)
})

test('ACP outbound frames are bounded before sending', async () => {
  const socket = new FakeSocket()
  const client = new AcpJsonRpcClient(socket)
  await assert.rejects(client.request('session/prompt', { text: 'x'.repeat(1_048_576) }), /size limit/)
  assert.deepEqual(socket.sent, [])
})
