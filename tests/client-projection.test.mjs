import assert from 'node:assert/strict'
import test from 'node:test'

const { projectFrames } = await import('../src/shared/projection.mjs')

test('projection turns ACP chunks into readable message bubbles', () => {
  const frames = [
    { type: 'ready', sessionId: 's1' },
    { type: 'notification', method: 'session/update', data: { update: { sessionUpdate: 'user_message_chunk', messageId: 'm1', content: { type: 'text', text: 'List the files' } } } },
    { type: 'notification', method: 'session/update', data: { update: { sessionUpdate: 'agent_message_chunk', messageId: 'm2', content: [{ type: 'text', text: 'Sure, ' }, { type: 'text', text: 'checking now.' }] } } },
    { type: 'history_loaded', sessionId: 's1' },
  ]
  const entries = projectFrames(frames)
  assert.deepEqual(entries.map(e => e.kind), ['system', 'message', 'message', 'system'])
  assert.equal(entries[1].role, 'user')
  assert.equal(entries[1].text, 'List the files')
  assert.equal(entries[2].role, 'assistant')
  assert.equal(entries[2].text, 'Sure, checking now.')
})

test('projection merges chunks by messageId and replaces whole messages', () => {
  const frames = [
    { type: 'notification', method: 'session/update', data: { update: { sessionUpdate: 'agent_message_chunk', messageId: 'm9', content: { type: 'text', text: 'Hel' } } } },
    { type: 'notification', method: 'session/update', data: { update: { sessionUpdate: 'agent_message_chunk', messageId: 'm9', content: { type: 'text', text: 'lo world' } } } },
    { type: 'notification', method: 'session/update', data: { update: { sessionUpdate: 'agent_message', messageId: 'm9', content: { type: 'text', text: 'Hello world, finalized.' } } } },
  ]
  const entries = projectFrames(frames)
  assert.equal(entries.length, 1)
  assert.equal(entries[0].text, 'Hello world, finalized.')
})

test('projection renders tool calls with status and plan entries', () => {
  const frames = [
    { type: 'notification', method: 'session/update', data: { update: { sessionUpdate: 'tool_call', toolCallId: 't1', title: 'Run tests', status: 'in_progress', content: [{ type: 'text', text: 'npm test' }] } } },
    { type: 'notification', method: 'session/update', data: { update: { sessionUpdate: 'tool_call_update', toolCallId: 't1', status: 'completed', rawOutput: { output: [{ type: 'text', text: 'all green' }] } } } },
    { type: 'notification', method: 'session/update', data: { update: { sessionUpdate: 'plan_update', plan: { entries: [{ content: 'Step one', status: 'completed' }, { content: 'Step two', status: 'pending' }] } } } },
  ]
  const entries = projectFrames(frames)
  assert.equal(entries.length, 2)
  assert.equal(entries[0].kind, 'tool')
  assert.equal(entries[0].title, 'Run tests')
  assert.equal(entries[0].status, 'completed')
  assert.equal(entries[0].detail, 'all green')
  assert.equal(entries[1].kind, 'plan')
  assert.equal(entries[1].entries[1].content, 'Step two')
})

test('projection folds thinking into collapsible blocks, not message bubbles', () => {
  const frames = [
    { type: 'notification', method: 'session/update', data: { update: { sessionUpdate: 'agent_thought_chunk', messageId: 'th1', content: { type: 'text', text: 'Analyzing the request' } } } },
    { type: 'notification', method: 'session/update', data: { update: { sessionUpdate: 'agent_thought_chunk', messageId: 'th1', content: { type: 'text', text: ' step by step' } } } },
    { type: 'notification', method: 'session/update', data: { update: { sessionUpdate: 'agent_message_chunk', messageId: 'm2', content: { type: 'text', text: 'Answer' } } } },
    { type: 'notification', method: 'session/update', data: { update: { sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'More thinking one' } } } },
    { type: 'notification', method: 'session/update', data: { update: { sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: ' More thinking two' } } } },
  ]
  const entries = projectFrames(frames)
  assert.equal(entries.length, 3)
  assert.equal(entries[0].kind, 'thought')
  assert.equal(entries[0].text, 'Analyzing the request step by step')
  assert.equal(entries[1].kind, 'message')
  assert.equal(entries[1].text, 'Answer')
  assert.equal(entries[2].kind, 'thought')
  assert.equal(entries[2].text, 'More thinking one More thinking two')
})

test('projection marks unknown frames and system states without raw dumps', () => {
  const frames = [
    { type: 'history_incomplete', sessionId: 's' },
    { type: 'error', code: 'acp_connection_closed', message: 'connection lost' },
    { type: 'notification', method: 'session/update', data: { update: { sessionUpdate: 'config_option_update', options: [] } } },
    { type: 'notification', method: 'session/update', data: { update: { sessionUpdate: 'custom_unknown_update', payload: 1 } } },
  ]
  const entries = projectFrames(frames)
  assert.equal(entries[0].kind, 'system')
  assert.equal(entries[1].kind, 'raw')
  assert.equal(entries[1].label, 'acp_connection_closed')
  // config_option_update is internal noise and must be hidden
  assert.equal(entries.length, 3)
  assert.equal(entries[2].kind, 'raw')
  assert.equal(entries[2].label, 'custom_unknown_update')
})

test('projection reads messageId from notification _meta for MonkeyAI runtime and deduplicates across replays', () => {
  const chunk = (mid, text) => ({
    type: 'notification', method: 'session/update',
    data: { _meta: { messageId: mid, replay: true }, sessionId: 's', update: { sessionUpdate: 'user_message_chunk', content: { type: 'text', text } } },
  })
  // Simulate two replay passes (reconnect) with the same messageId producing
  // duplicate chunks. The projection must merge them into a single entry.
  const frames = [
    chunk('u-turn-1', 'Hello '),
    chunk('u-turn-1', 'Hello '), // duplicate from second replay
    chunk('u-turn-1', 'world'),
  ]
  const entries = projectFrames(frames)
  assert.equal(entries.length, 1)
  assert.equal(entries[0].kind, 'message')
  assert.equal(entries[0].role, 'user')
  assert.equal(entries[0].text, 'Hello world')
})

test('projection renders session state transitions as system lines, not raw dumps', () => {
  const frames = [
    { type: 'notification', method: '_monkeyai/session/state', data: { sessionId: 's', eventSeq: 1, state: { status: 'running' } } },
    { type: 'notification', method: '_monkeyai/session/state', data: { sessionId: 's', eventSeq: 2, state: { status: 'idle' }, finish: true } },
    { type: 'notification', method: '_monkeyai/session/state', data: { sessionId: 's', eventSeq: 3, state: { status: 'error' } } },
    { type: 'notification', method: '_monkeyai/session/state', data: { sessionId: 's', eventSeq: 4, state: { status: 'interrupted' } } },
    { type: 'notification', method: '_monkeyai/session/state', data: { sessionId: 's', eventSeq: 5, state: { title: 'rename only' } } },
    { type: 'notification', method: '_monkeyai/session/history_changed', data: { sessionId: 's', eventSeq: 6 } },
  ]
  const entries = projectFrames(frames)
  assert.deepEqual(entries.map(e => e.label), ['会话状态：进行中', '会话状态：空闲', '会话状态：出错', '会话状态：已中断'])
  assert.ok(entries.every(e => e.kind === 'system'))
})

test('projection reads toolCallId from update _meta.parentToolCallId', () => {
  const frames = [
    { type: 'notification', method: 'session/update', data: { _meta: { messageId: 'a1' }, update: { sessionUpdate: 'tool_call', _meta: { parentToolCallId: 'call_abc' }, title: 'Search', status: 'in_progress', content: [{ type: 'text', text: 'grep foo' }] } } },
    { type: 'notification', method: 'session/update', data: { _meta: { messageId: 'a1' }, update: { sessionUpdate: 'tool_call_update', _meta: { parentToolCallId: 'call_abc' }, status: 'completed', rawOutput: { output: [{ type: 'text', text: 'no matches' }] } } } },
  ]
  const entries = projectFrames(frames)
  assert.equal(entries.length, 1)
  assert.equal(entries[0].kind, 'tool')
  assert.equal(entries[0].title, 'Search')
  assert.equal(entries[0].status, 'completed')
  assert.equal(entries[0].detail, 'no matches')
})
