const MESSAGE_UPDATES = Object.freeze({
  user_message_chunk: { role: 'user', label: '我', mode: 'append' },
  agent_message_chunk: { role: 'assistant', label: 'MonkeyAI', mode: 'append' },
  user_message: { role: 'user', label: '我', mode: 'replace' },
  agent_message: { role: 'assistant', label: 'MonkeyAI', mode: 'replace' },
})

const THOUGHT_UPDATES = Object.freeze({
  agent_thought_chunk: 'append',
  agent_thought: 'replace',
})

export const TOOL_STATUS_LABEL = Object.freeze({
  pending: '排队中', in_progress: '执行中', completed: '完成', failed: '失败', cancelled: '已取消',
})

function contentText(content) {
  const blocks = Array.isArray(content) ? content : content === undefined || content === null ? [] : [content]
  const parts = []
  for (const block of blocks) {
    if (typeof block === 'string') { parts.push(block); continue }
    if (!block || typeof block !== 'object') continue
    if (typeof block.text === 'string' && block.text !== '') { parts.push(block.text); continue }
    if (block.type === 'resource_link' && typeof block.uri === 'string') { parts.push(block.name ? `${block.name} (${block.uri})` : block.uri); continue }
    if (block.type === 'resource' && block.resource) {
      const r = block.resource
      if (typeof r.text === 'string' && r.text !== '') { parts.push(r.text); continue }
      if (typeof r.uri === 'string') { parts.push(r.uri); continue }
    }
  }
  return parts.join('')
}

function projectFrames(frames) {
  const entries = []
  const byKey = new Map()
  const seenChunkTexts = new Map() // messageId -> Set of chunk texts
  let seenReady = false
  let seenHistoryLoaded = false
  let seenReconnecting = false
  for (const frame of frames) {
    const update = frame?.data?.update
    if (frame.type === 'notification' && update && typeof update === 'object') {
      const kind = update.sessionUpdate
      // MonkeyAI runtime carries messageId in the notification _meta, not in
      // the update body. Fall back to update.messageId for spec-compliant agents.
      const messageId = (typeof frame.data?._meta?.messageId === 'string' && frame.data._meta.messageId !== '')
        ? frame.data._meta.messageId
        : (typeof update.messageId === 'string' ? update.messageId : '')
      const toolCallId = (typeof update._meta?.parentToolCallId === 'string' && update._meta.parentToolCallId !== '')
        ? update._meta.parentToolCallId
        : (typeof update.toolCallId === 'string' ? update.toolCallId : '')
      const meta = MESSAGE_UPDATES[kind]
      if (THOUGHT_UPDATES[kind]) {
        const text = contentText(update.content)
        const key = messageId !== '' ? `thought:${messageId}` : `thought:auto:${entries.length}`
        let entry = byKey.get(key)
        const lastEntry = entries[entries.length - 1]
        if (!entry || (lastEntry !== entry && messageId === '')) {
          // No messageId: fold consecutive thinking chunks into one collapsible block.
          if (lastEntry && lastEntry.kind === 'thought' && lastEntry.openEnded) {
            entry = lastEntry
          } else {
            entry = { kind: 'thought', text: '', openEnded: true, key }
            byKey.set(key, entry)
            entries.push(entry)
          }
        }
        if (THOUGHT_UPDATES[kind] === 'replace') entry.text = text
        else if (text !== '') {
          // Replay re-sends the same chunks; skip ones already folded in.
          const seen = seenChunkTexts.get(key) ?? new Set()
          if (!seen.has(text)) {
            seen.add(text)
            seenChunkTexts.set(key, seen)
            entry.text = entry.text === '' ? text : `${entry.text}${text}`
          }
        }
        if (messageId !== '') entry.openEnded = false
        continue
      }
      if (meta) {
        const text = contentText(update.content)
        const key = messageId !== '' ? `msg:${messageId}` : `msg:auto:${entries.length}`
        let entry = byKey.get(key)
        if (!entry || entry.kind !== 'message') {
          entry = { kind: 'message', role: meta.role, label: meta.label, text: '', key }
          byKey.set(key, entry)
          entries.push(entry)
        }
        entry.label = meta.label
        entry.role = meta.role
        if (meta.mode === 'replace') entry.text = text
        else if (text !== '') {
          // Replay re-sends the same chunks; skip ones already folded in.
          const seen = seenChunkTexts.get(key) ?? new Set()
          if (!seen.has(text)) {
            seen.add(text)
            seenChunkTexts.set(key, seen)
            entry.text = entry.text === '' ? text : `${entry.text}${text}`
          }
        }
        continue
      }
      if (kind === 'tool_call' || kind === 'tool_call_update') {
        const key = `tool:${toolCallId ?? entries.length}`
        let entry = byKey.get(key)
        if (!entry || entry.kind !== 'tool') {
          entry = { kind: 'tool', title: '', status: undefined, detail: '', key }
          byKey.set(key, entry)
          entries.push(entry)
        }
        if (typeof update.title === 'string' && update.title !== '') entry.title = update.title
        if (update.status) entry.status = update.status
        const outputText = contentText(update.rawOutput?.output ?? update.content)
        if (outputText !== '') entry.detail = outputText
        continue
      }
      if (kind === 'plan_update' && update.plan && Array.isArray(update.plan.entries)) {
        entries.push({ kind: 'plan', entries: update.plan.entries, key: `plan:${entries.length}` })
        continue
      }
      if (kind === 'usage_update' || kind === 'current_mode_update' || kind === 'config_option_update' || kind === 'session_info_update') continue
      entries.push({ kind: 'raw', label: kind || 'session/update', data: update, key: `raw:${entries.length}` })
      continue
    }
    if (frame.type === 'ready') { if (!seenReady) { seenReady = true; entries.push({ kind: 'system', label: '已连接到远程 runtime', key: `sys-ready:${entries.length}` }) } continue }
    if (frame.type === 'history_loaded') { if (!seenHistoryLoaded) { seenHistoryLoaded = true; entries.push({ kind: 'system', label: '历史已加载', key: `sys-hist:${entries.length}` }) } continue }
    if (frame.type === 'history_incomplete') { entries.push({ kind: 'system', label: '历史不完整，部分更早的消息可能缺失', key: `sys-inc:${entries.length}` }); continue }
    if (frame.type === 'reconnecting') { if (!seenReconnecting) { seenReconnecting = true; entries.push({ kind: 'system', label: frame.message || '正在重连远程 runtime', key: `sys-reconn:${entries.length}` }) } continue }
    if (frame.type === 'reconnected') { continue }
    if (frame.type === 'delivery') {
      const accepted = Boolean(frame.data?.accepted)
      if (accepted) continue // turn completion is shown in the composer status line
      entries.push({ kind: 'system', label: 'MonkeyAI 未接受该指令', key: `sys-del:${entries.length}` })
      continue
    }
    if (frame.type === 'cancel_sent') { entries.push({ kind: 'system', label: '已请求停止', key: `sys-cancel:${entries.length}` }); continue }
    if (frame.type === 'request') { continue } // rendered as an approval card from pendingRequests
    if (frame.type === 'model_switched') { entries.push({ kind: 'system', label: `已切换模型：${frame.data?.model ?? '所选模型'}`, key: `sys-model:${entries.length}` }); continue }
    if (frame.type === 'model_switch_failed') { continue } // surfaced via the error banner
    if (frame.type === 'notification' && typeof frame.method === 'string' && frame.method.startsWith('_monkeyai/')) { continue } // internal runtime state notifications
    if (frame.type === 'error') { entries.push({ kind: 'raw', label: frame.code || 'error', data: { message: frame.message || frame.code }, key: `sys-err:${entries.length}` }); continue }
    entries.push({ kind: 'raw', label: frame.method || frame.type, data: frame.data, key: `raw:${frame.type}:${entries.length}` })
  }
  return entries
}

export { projectFrames }
