import React from 'react'
import { TYPERT_REMOTE } from '../remote.js'
import { projectFrames, TOOL_STATUS_LABEL, SESSION_STATUS_LABEL } from '../shared/projection.mjs'

const PANEL_ID = 'monkeyai-sessions'
const MANUAL_DEVICES_KEY = 'monkeyai-sessions/manual-devices'
const RECENT_LIMIT = 200
const { createElement: h, useEffect, useMemo, useRef, useState } = React

const t = {
  text: '#1f2328',
  text2: '#59636e',
  text3: '#8b949e',
  border: '#e4e7ec',
  border2: '#d0d7de',
  surface: '#ffffff',
  surfaceAlt: '#f6f8fa',
  accent: '#3568e8',
  accentDark: '#2b5bd7',
  accentSoft: '#eef3fe',
  danger: '#c2372c',
  dangerBg: '#fef3f2',
  dangerBorder: '#f1c4c0',
  success: '#1e7b45',
  successBg: '#e9f5ee',
  radius: 8,
  radiusLg: 10,
}

const style = {
  page: { display: 'grid', gap: 14, width: '100%', maxWidth: 1320, minWidth: 0, margin: '0 auto', padding: '18px 20px 24px', color: t.text, background: '#f7f8fb', height: '100%', minHeight: 0, overflowY: 'auto', boxSizing: 'border-box', alignContent: 'start', fontSize: 13, lineHeight: 1.5 },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingBottom: 2 },
  title: { margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: '-0.025em', color: '#182230' },
  eyebrow: { margin: 0, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', color: t.text3, textTransform: 'uppercase' },
  subtitle: { margin: 0, fontSize: 12, color: t.text3 },
  sectionTitle: { margin: 0, fontSize: 12, fontWeight: 650, color: t.text2, textTransform: 'uppercase', letterSpacing: '0.04em' },
  card: { display: 'grid', gap: 10, padding: 14, border: `1px solid ${t.border}`, borderRadius: 12, background: t.surface, boxShadow: '0 2px 8px rgba(16,24,40,0.035)' },
  toolbarCard: { display: 'grid', gap: 10, padding: '13px 15px', border: `1px solid ${t.border}`, borderRadius: 12, background: t.surface, boxShadow: '0 2px 8px rgba(16,24,40,0.035)' },
  workspace: { display: 'grid', gridTemplateColumns: 'minmax(248px, 292px) minmax(0, 1fr)', gap: 12, minWidth: 0, alignItems: 'stretch' },
  sessionSidebar: { display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr) auto', gap: 10, minWidth: 0, padding: 12, border: `1px solid ${t.border}`, borderRadius: 12, background: t.surface, boxShadow: '0 2px 8px rgba(16,24,40,0.035)' },
  sessionList: { display: 'grid', gridTemplateColumns: '1fr', alignContent: 'start', gap: 6, minHeight: 0, overflowY: 'auto', padding: '1px 3px 2px 1px' },
  thread: { display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr) auto', gap: 10, minWidth: 0, height: 'min(70vh, 720px)', minHeight: 440, overflow: 'hidden', padding: 12 },
  emptyThread: { display: 'grid', placeContent: 'center', justifyItems: 'center', gap: 9, minWidth: 0, padding: 28, border: `1px dashed ${t.border2}`, borderRadius: 12, background: 'linear-gradient(145deg, #ffffff 0%, #f8faff 100%)', textAlign: 'center' },
  row: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  label: { display: 'grid', gap: 4, flex: 1, minWidth: 180, fontSize: 12, fontWeight: 600, color: t.text2 },
  input: { width: '100%', boxSizing: 'border-box', padding: '7px 10px', borderRadius: t.radius, border: `1px solid ${t.border2}`, background: t.surface, color: t.text, outline: 'none', fontSize: 13, transition: 'border-color .15s, box-shadow .15s' },
  button: { padding: '6px 12px', borderRadius: t.radius, border: `1px solid ${t.border2}`, background: t.surface, color: t.text, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, transition: 'background .15s, border-color .15s' },
  primaryButton: { padding: '8px 14px', borderRadius: t.radius, border: `1px solid ${t.accentDark}`, background: t.accent, color: '#ffffff', cursor: 'pointer', fontSize: 13, fontWeight: 600, transition: 'background .15s' },
  dangerButton: { padding: '6px 12px', borderRadius: t.radius, border: `1px solid ${t.dangerBorder}`, background: t.surface, color: t.danger, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, transition: 'background .15s' },
  stopButton: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, padding: 0, borderRadius: t.radius, border: `1px solid ${t.dangerBorder}`, background: t.dangerBg, color: t.danger, cursor: 'pointer', flexShrink: 0, transition: 'background .15s' },
  stopIcon: { width: 11, height: 11, borderRadius: 2.5, background: 'currentColor', flexShrink: 0 },
  sendButton: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, padding: 0, borderRadius: t.radius, border: `1px solid ${t.accentDark}`, background: t.accent, color: '#ffffff', cursor: 'pointer', flexShrink: 0, transition: 'background .15s' },
  statusBadge: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 999, fontSize: 11.5, fontWeight: 600, background: t.surfaceAlt, border: `1px solid ${t.border}`, color: t.text2, whiteSpace: 'nowrap', maxWidth: 340, overflow: 'hidden', textOverflow: 'ellipsis' },
  dot: { width: 7, height: 7, borderRadius: '50%', flexShrink: 0 },
  error: { display: 'flex', gap: 8, alignItems: 'flex-start', color: t.danger, margin: 0, fontSize: 12.5, background: t.dangerBg, border: `1px solid ${t.dangerBorder}`, borderRadius: t.radius, padding: '8px 10px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
  sessions: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 8 },
  session: { display: 'grid', gap: 4, textAlign: 'left', padding: '10px 12px', borderRadius: t.radius, border: `1px solid ${t.border}`, background: t.surface, color: t.text, cursor: 'pointer', transition: 'border-color .15s, background .15s' },
  selected: { border: `1px solid ${t.accent}`, background: t.accentSoft, boxShadow: `0 0 0 1px ${t.accent} inset` },
  sessionTitle: { fontSize: 13, fontWeight: 650, lineHeight: 1.35, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  sessionMeta: { fontSize: 11.5, color: t.text3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  chip: { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 999, border: `1px solid ${t.border}`, background: t.surfaceAlt, fontSize: 11.5 },
  events: { display: 'flex', flexDirection: 'column', gap: 10, height: 'auto', minHeight: 0, overflowY: 'auto', padding: '6px 8px 8px 4px', overscrollBehavior: 'contain' },
  event: { padding: '8px 11px', borderRadius: t.radius, background: t.surfaceAlt, border: `1px solid ${t.border}`, overflowWrap: 'anywhere', color: t.text },
  bubbleWrap: { display: 'flex', gap: 8, alignItems: 'flex-start', width: '100%' },
  bubbleWrapUser: { display: 'flex', gap: 8, alignItems: 'flex-start', justifyContent: 'flex-end', width: '100%' },
  avatar: { width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#ffffff', flexShrink: 0, marginTop: 2 },
  bubble: { maxWidth: '88%', minWidth: 0, flex: '0 1 auto', width: 'fit-content', borderRadius: 12, padding: '9px 13px', background: t.surface, border: `1px solid ${t.border}`, boxShadow: '0 1px 2px rgba(16,24,40,0.04)', lineHeight: 1.6, fontSize: 13 },
  bubbleUser: { maxWidth: '88%', minWidth: 0, flex: '0 1 auto', width: 'fit-content', borderRadius: 12, padding: '9px 13px', background: '#315fe8', color: '#ffffff', boxShadow: '0 2px 5px rgba(49,95,232,0.18)', lineHeight: 1.6, fontSize: 13 },
  thought: { maxWidth: '88%', borderRadius: t.radiusLg, padding: '7px 11px', background: '#faf7fd', border: `1px solid #e8ddf5`, lineHeight: 1.5, fontSize: 12.5, color: '#5b4a72' },
  thoughtSummary: { cursor: 'pointer', color: '#6b4fa0', fontWeight: 650, fontSize: 10.5, letterSpacing: '0.05em', textTransform: 'uppercase', userSelect: 'none' },
  approval: { padding: '11px 13px', borderRadius: t.radiusLg, border: `1px solid #f0d98c`, background: '#fffbeb', display: 'grid', gap: 8 },
  composer: { display: 'flex', gap: 8, alignItems: 'flex-end' },
  textarea: { width: '100%', minHeight: 56, maxHeight: 200, boxSizing: 'border-box', padding: '8px 11px', borderRadius: t.radius, border: `1px solid ${t.border2}`, background: t.surface, color: t.text, resize: 'vertical', outline: 'none', fontSize: 13, lineHeight: 1.5, transition: 'border-color .15s, box-shadow .15s' },
  details: { fontSize: 12, color: t.text2 },
  summary: { cursor: 'pointer', userSelect: 'none', fontSize: 12, color: t.text2 },
}

const PANEL_CSS = `
.mai-panel input:focus, .mai-panel textarea:focus, .mai-panel select:focus { border-color: #3568e8 !important; box-shadow: 0 0 0 2px rgba(53,104,232,0.14) !important; }
.mai-panel button:not(:disabled):hover { filter: brightness(0.97); }
.mai-panel button:not(:disabled):active { transform: translateY(1px); }
.mai-panel button:disabled { opacity: 0.5; cursor: not-allowed; }
.mai-panel details > summary { list-style: none; }
.mai-panel details > summary::-webkit-details-marker { display: none; }
.mai-panel details > summary::before { content: '▸'; display: inline-block; margin-right: 5px; color: #8b949e; transition: transform .15s; }
.mai-panel details[open] > summary::before { transform: rotate(90deg); }
.mai-panel [data-events]::-webkit-scrollbar { width: 8px; }
.mai-panel [data-events]::-webkit-scrollbar-thumb { background: #d5dbe4; border-radius: 8px; }
.mai-panel [data-events]::-webkit-scrollbar-thumb:hover { background: #b8c2cf; }
.mai-panel .mai-card-hover { transition: border-color .15s, background .15s; }
.mai-panel .mai-card-hover:not(:disabled):hover { border-color: #b9cdf3 !important; background: #f7faff !important; }
.mai-panel .mai-toolbar { position: relative; overflow: hidden; }
.mai-panel .mai-toolbar::before { content: ''; position: absolute; inset: 0 0 auto; height: 3px; background: linear-gradient(90deg, #3568e8 0%, #8baaf4 46%, #e7edfc 100%); }
.mai-panel .mai-workspace { display: grid; grid-template-columns: minmax(248px, 292px) minmax(0, 1fr); gap: 12px; min-width: 0; align-items: stretch; }
.mai-panel .mai-session-sidebar { min-height: min(70vh, 720px); }
.mai-panel .mai-session-list { scrollbar-gutter: stable; }
.mai-panel .mai-session-card { position: relative; }
.mai-panel .mai-session-card[aria-current='true']::before { content: ''; position: absolute; left: 0; top: 9px; bottom: 9px; width: 3px; border-radius: 0 3px 3px 0; background: #3568e8; }
.mai-panel .mai-thread { height: min(70vh, 720px); min-height: 440px; }
.mai-panel .mai-thread-events { height: auto !important; min-height: 0 !important; }
.mai-panel .mai-empty-thread { min-height: min(70vh, 720px); }
.mai-panel .mai-empty-mark { display: grid; place-items: center; width: 54px; height: 54px; border-radius: 17px; background: #edf2ff; color: #315fe8; box-shadow: inset 0 0 0 1px #dce6ff; }
.mai-panel .mai-session-meta { overflow-wrap: anywhere; }
@media (max-width: 900px) {
  .mai-panel .mai-workspace { grid-template-columns: minmax(0, 1fr); }
  .mai-panel .mai-session-sidebar { min-height: 0; grid-template-rows: auto minmax(0, auto) auto; }
  .mai-panel .mai-session-list { grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); max-height: 235px; }
  .mai-panel .mai-thread { height: 68vh; min-height: 390px; }
  .mai-panel .mai-empty-thread { min-height: 330px; }
}
@media (max-width: 560px) {
  .mai-panel .mai-page-title { font-size: 16px !important; }
  .mai-panel .mai-toolbar-controls { align-items: stretch; }
  .mai-panel .mai-toolbar-controls select { flex-basis: 100% !important; }
  .mai-panel .mai-session-list { grid-template-columns: 1fr !important; max-height: 210px; }
  .mai-panel .mai-thread { height: 68vh; min-height: 360px; padding: 10px; }
  .mai-panel .mai-thread-header { gap: 6px !important; }
  .mai-panel .mai-thread-header strong { min-width: 100px; }
  .mai-panel .mai-thread-header select { flex-basis: 100% !important; }
  .mai-panel .mai-events { gap: 7px; }
}
@keyframes mai-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
.mai-panel .mai-pulse { animation: mai-pulse 1.2s ease-in-out infinite; }
.mai-panel .mai-md > div:first-child > :first-child { margin-top: 0; }
.mai-panel .mai-md > div:last-child > :last-child { margin-bottom: 0; }
.mai-panel .mai-md pre::-webkit-scrollbar { height: 6px; }
.mai-panel .mai-md pre::-webkit-scrollbar-thumb { background: #d5dbe4; border-radius: 6px; }
`

function errorText(error) {
  return typeof error?.message === 'string' ? error.message : typeof error === 'string' ? error : '远程操作失败'
}

function withTimeout(promise, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}超时，请重试`)), timeoutMs)
    Promise.resolve(promise).then(
      value => { clearTimeout(timer); resolve(value) },
      error => { clearTimeout(timer); reject(error) },
    )
  })
}

function isRemoteStreamCarrierError(error) {
  return /api gateway: remote stream websocket (?:failed|closed)/i.test(errorText(error))
}

// Lightweight inline markdown: fenced code blocks, `code`, **bold**,
// headings and bullet lists. Everything else renders as plain text so
// remote content can never inject markup.
function renderMarkdown(text) {
  if (typeof text !== 'string' || text === '') return null
  const blocks = []
  const lines = text.split('\n')
  let paragraph = []
  let codeLines = null
  let codeLang = ''
  const flushParagraph = () => {
    if (paragraph.length === 0) return
    blocks.push({ type: 'p', lines: paragraph })
    paragraph = []
  }
  for (const line of lines) {
    const fence = line.match(/^\s*```(\w*)\s*$/)
    if (fence) {
      if (codeLines === null) {
        flushParagraph()
        codeLines = []
        codeLang = fence[1] || ''
      } else {
        blocks.push({ type: 'code', lang: codeLang, text: codeLines.join('\n') })
        codeLines = null
      }
      continue
    }
    if (codeLines !== null) { codeLines.push(line); continue }
    if (line.trim() === '') { flushParagraph(); continue }
    paragraph.push(line)
  }
  if (codeLines !== null) blocks.push({ type: 'code', lang: codeLang, text: codeLines.join('\n') })
  flushParagraph()

  const renderInline = (line, keyBase) => {
    const parts = []
    const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g
    let last = 0
    let match
    let i = 0
    while ((match = pattern.exec(line)) !== null) {
      if (match.index > last) parts.push(line.slice(last, match.index))
      const token = match[0]
      if (token.startsWith('**')) {
        parts.push(h('strong', { key: `${keyBase}-b${i}` }, token.slice(2, -2)))
      } else {
        parts.push(h('code', { key: `${keyBase}-c${i}`, style: mdStyle.inlineCode }, token.slice(1, -1)))
      }
      last = match.index + token.length
      i += 1
    }
    if (last < line.length) parts.push(line.slice(last))
    return parts
  }

  return blocks.map((block, index) => {
    if (block.type === 'code') {
      return h('pre', { key: `md-${index}`, style: mdStyle.codeBlock },
        block.lang ? h('div', { style: mdStyle.codeLang }, block.lang) : null,
        h('code', null, block.text))
    }
    const rendered = []
    let listItems = null
    const flushList = () => {
      if (!listItems) return
      rendered.push(h('ul', { key: `md-${index}-ul${rendered.length}`, style: mdStyle.list },
        listItems.map((item, i) => h('li', { key: i, style: { margin: '2px 0' } }, renderInline(item, `md-${index}-li${i}`)))))
      listItems = null
    }
    block.lines.forEach((line, li) => {
      const heading = line.match(/^(#{1,4})\s+(.*)$/)
      const bullet = line.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)$/)
      if (heading) {
        flushList()
        const level = heading[1].length
        rendered.push(h('div', { key: `md-${index}-h${li}`, style: { ...mdStyle.heading, fontSize: level <= 2 ? 14 : 13 } }, renderInline(heading[2], `md-${index}-h${li}`)))
      } else if (bullet) {
        if (!listItems) listItems = []
        listItems.push(bullet[1])
      } else {
        flushList()
        rendered.push(h('p', { key: `md-${index}-p${li}`, style: mdStyle.paragraph }, renderInline(line, `md-${index}-p${li}`)))
      }
    })
    flushList()
    return h('div', { key: `md-${index}` }, rendered)
  })
}

const mdStyle = {
  paragraph: { margin: '3px 0', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
  heading: { fontWeight: 700, margin: '8px 0 3px', lineHeight: 1.4 },
  list: { margin: '3px 0', paddingLeft: 20 },
  inlineCode: { background: 'rgba(127,127,127,0.13)', borderRadius: 4, padding: '1px 5px', fontSize: '0.92em', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' },
  codeBlock: { background: '#f6f8fa', border: '1px solid #e4e7ec', borderRadius: 8, padding: '9px 11px', margin: '6px 0', overflowX: 'auto', fontSize: 12, lineHeight: 1.5, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', whiteSpace: 'pre', color: '#1f2328' },
  codeLang: { fontSize: 10.5, fontWeight: 700, color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 },
}

async function unwrap(promise) {
  const result = await promise
  if (result && typeof result === 'object' && 'ok' in result) {
    if (!result.ok) throw result.error
    return result.value
  }
  return result
}

function StatusDot({ live }) {
  return h('span', { style: { ...style.dot, background: live ? '#2da44e' : '#afb8c1', boxShadow: live ? '0 0 0 3px rgba(45,164,78,0.15)' : 'none' } })
}

function StatusBadge({ status, live }) {
  return h('span', { style: style.statusBadge, title: status }, h(StatusDot, { live }), status)
}

function Field({ labelText, children }) {
  return h('label', { style: style.label }, labelText, children)
}

function ApprovalCard({ request, hasControl, onRespond, answerText, setAnswerText, onAnswer }) {
  const isPermission = request.method === 'session/request_permission'
  const options = Array.isArray(request.data?.options) ? request.data.options : []
  const questionText = typeof request.data?.message === 'string' ? request.data.message : typeof request.data?.prompt === 'string' ? request.data.prompt : ''
  const disabled = !hasControl
  return h('div', { style: style.approval, role: 'alert' },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
      h('span', { style: { fontSize: 12.5, fontWeight: 650 } }, isPermission ? '请求授权' : 'MonkeyAI 需要你的输入'),
      h('span', { style: { fontSize: 11, color: t.text3 } }, '回复需要 session:control 权限')),
    questionText !== '' ? h('div', { style: { fontSize: 12.5, color: t.text2, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } }, questionText) : null,
    options.length > 0
      ? h('div', { style: style.row },
        options.map(option => h('button', {
          type: 'button', style: option.kind === 'allow_once' || option.kind === 'allow_always' ? style.primaryButton : style.button,
          key: option.optionId, disabled, onClick: () => onRespond(request, { outcome: 'selected', optionId: option.optionId }),
        }, option.name || option.optionId)),
        h('button', { type: 'button', style: style.button, disabled, onClick: () => onRespond(request, { outcome: 'cancelled' }) }, '拒绝'))
      : null,
    options.length === 0 && !isPermission
      ? h(React.Fragment, null,
        h('textarea', {
          style: { ...style.textarea, minHeight: 44 },
          placeholder: disabled ? '只读模式：回复需要 session:control 权限' : '输入你的回答',
          value: answerText, disabled,
          onChange: event => setAnswerText(event.target.value),
        }),
        h('div', { style: style.row },
          h('button', { type: 'button', style: style.primaryButton, disabled: disabled || answerText.trim() === '', onClick: () => onAnswer(request) }, '回复'),
          h('button', { type: 'button', style: style.button, disabled, onClick: () => onRespond(request, { action: 'decline' }) }, '拒绝')))
      : null,
    options.length === 0 && isPermission
      ? h('div', { style: style.row },
        h('button', { type: 'button', style: style.button, disabled, onClick: () => onRespond(request, { outcome: 'cancelled' }) }, '拒绝'))
      : null,
    h('details', { style: style.details },
      h('summary', { style: style.summary }, '请求详情'),
      h('pre', { style: { margin: '6px 0 0', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 11.5 } }, JSON.stringify(request.data, null, 2))),
  )
}

function RemoteSessionPage({ api }) {
  const [serverAddress, setServerAddress] = useState('')
  const [callbackUrl, setCallbackUrl] = useState('')
  const [authorizationRequestId, setAuthorizationRequestId] = useState('')
  const [authorizationUrl, setAuthorizationUrl] = useState('')
  const [authorizationMode, setAuthorizationMode] = useState('')
  const [accounts, setAccounts] = useState([])
  const [accountId, setAccountId] = useState('')
  const [devices, setDevices] = useState([])
  const [machineId, setMachineId] = useState('')
  const [summarySessions, setSummarySessions] = useState([])
  const [runtimeSessions, setRuntimeSessions] = useState([])
  const [sessionId, setSessionId] = useState('')
  const [frames, setFrames] = useState([])
  const [pendingRequests, setPendingRequests] = useState([])
  const [prompt, setPrompt] = useState('')
  const [answerText, setAnswerText] = useState('')
  const [status, setStatus] = useState('未连接')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [lastDelivery, setLastDelivery] = useState(undefined)
  const [manualDevices, setManualDevices] = useState([])
  const [manualDeviceId, setManualDeviceId] = useState('')
  const [manualDeviceName, setManualDeviceName] = useState('')
  const [newSessionCwd, setNewSessionCwd] = useState('/root')
  const [newSessionBusy, setNewSessionBusy] = useState(false)
  const [models, setModels] = useState([])
  const [selectedModel, setSelectedModel] = useState('')
  const [currentModel, setCurrentModel] = useState('')
  const [switchingModel, setSwitchingModel] = useState(false)
  const [copied, setCopied] = useState(false)
  const [addingServer, setAddingServer] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [visibleCount, setVisibleCount] = useState(RECENT_LIMIT)
  const [turnActive, setTurnActive] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [sessionStatus, setSessionStatus] = useState('')
  const [signInEmail, setSignInEmail] = useState('')
  const [signInPassword, setSignInPassword] = useState('')
  const streamRef = useRef(null)
  const historyLoadedRef = useRef(false)
  const lastDraftRef = useRef('')
  const authWindowRef = useRef(null)
  const eventsRef = useRef(null)
  const prevScrollHeightRef = useRef(null)
  const streamGenerationRef = useRef(0)
  const title = useMemo(() => {
    const runtime = runtimeSessions.find(item => item.id === sessionId)
    const summary = summarySessions.find(item => item.id === sessionId)
    return runtime?.title || summary?.title || sessionId
  }, [runtimeSessions, summarySessions, sessionId])
  const displayEntries = useMemo(() => projectFrames(frames), [frames])

  useEffect(() => {
    let active = true
    void unwrap(api.listAccounts()).then(result => {
      if (!active) return
      setAccounts(result)
      if (result.length > 0) {
        setAccountId(current => current || result[0].accountId)
        setServerAddress(current => current || result[0].serverOrigin)
      }
    }).catch(reason => {
      if (active) setError(errorText(reason))
    })
    return () => {
      active = false
      streamGenerationRef.current += 1
      streamRef.current?.dispose()
      streamRef.current = null
    }
  }, [api])

  useEffect(() => {
    if (!accountId) { setModels([]); return }
    let active = true
    void unwrap(api.listModels({ accountId })).then(result => {
      if (!active) return
      const list = Array.isArray(result?.models) ? result.models : []
      setModels(list)
      setSelectedModel(current => current || (list.length > 0 ? list[0].id : ''))
    }).catch(() => {
      if (active) setModels([])
    })
    return () => { active = false }
  }, [api, accountId])

  useEffect(() => {
    const el = eventsRef.current
    if (!el) return
    if (prevScrollHeightRef.current !== null) {
      el.scrollTop = el.scrollHeight - prevScrollHeightRef.current
      prevScrollHeightRef.current = null
    } else if (!historyLoading) {
      el.scrollTop = el.scrollHeight
    }
  }, [displayEntries.length, historyLoading, sessionId, visibleCount])

  async function signIn() {
    if (loading || !serverAddress || !signInEmail.trim() || signInPassword === '') return
    setError('')
    setLoading(true)
    setStatus('正在登录 MonkeyAI')
    try {
      const account = await unwrap(api.signIn({
        serverAddress,
        email: signInEmail.trim(),
        password: signInPassword,
      }))
      setSignInPassword('')
      adoptAccount(account)
    } catch (reason) {
      setError(errorText(reason))
      setStatus('登录失败')
    } finally {
      setLoading(false)
    }
  }

  async function beginAuthorization(mode) {
    setError('')
    setLoading(true)
    try {
      const result = await unwrap(api.beginAuthorization({ serverAddress, callbackMode: mode }))
      setAuthorizationRequestId(result.requestId)
      setAuthorizationUrl(result.authorizationUrl)
      setAuthorizationMode(mode)
      setCopied(false)
      if (mode === 'loopback') {
        setStatus('等待批准')
      } else {
        setStatus('批准授权后，粘贴回调 URL')
      }
      // Keep the opener so the loopback page can post the callback back.
      // Without it the browser cannot return the code automatically.
      authWindowRef.current = window.open(result.authorizationUrl, '_blank')
    } catch (reason) {
      setError(errorText(reason))
    } finally {
      setLoading(false)
    }
  }

  // The Host's loopback listener is unreachable when the browser runs on a
  // different machine than DSH. Its callback page posts the URL here instead,
  // and the Host performs the token exchange through completeAuthorization.
  useEffect(() => {
    if (!authorizationRequestId || authorizationMode !== 'loopback') return undefined
    const onMessage = event => {
      const data = event.data
      if (!data || data.source !== 'monkeyai-dsh-oauth' || typeof data.callbackUrl !== 'string') return
      const expected = new URL(authorizationUrl, window.location.href)
      let callback
      try { callback = new URL(data.callbackUrl) } catch { return }
      if (!['127.0.0.1', 'localhost', '[::1]'].includes(callback.hostname)) return
      if (callback.pathname !== '/oauth/callback') return
      if (callback.searchParams.get('state') !== expected.searchParams.get('state')) return
      void unwrap(api.completeAuthorization({ requestId: authorizationRequestId, callbackUrl: data.callbackUrl }))
        .then(account => {
          adoptAccount(account)
          setAuthorizationRequestId('')
          setAuthorizationUrl('')
          setAuthorizationMode('')
          setCallbackUrl('')
          authWindowRef.current?.close?.()
          authWindowRef.current = null
        })
        .catch(reason => setError(errorText(reason)))
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [api, authorizationRequestId, authorizationMode, authorizationUrl])

  useEffect(() => {
    if (!authorizationRequestId || authorizationMode !== 'loopback') return undefined
    const timer = setInterval(() => {
      void unwrap(api.authorizationStatus({ requestId: authorizationRequestId })).then(result => {
        if (!result || result.status === 'pending') return
        if (result.status === 'completed' && result.account) {
          setAccounts(current => [result.account, ...current.filter(item => item.accountId !== result.account.accountId)])
          setAccountId(result.account.accountId)
          setServerAddress(result.account.serverOrigin)
          setStatus('MonkeyAI 账号已连接')
        } else if (result.status === 'failed') {
          setError(result.error || '自动授权失败，请改为粘贴回调 URL。')
          setStatus('自动授权失败')
        } else {
          setStatus('授权请求已过期')
        }
        setAuthorizationRequestId('')
        setAuthorizationUrl('')
        setAuthorizationMode('')
      }).catch(() => {})
    }, 2000)
    return () => clearInterval(timer)
  }, [api, authorizationRequestId, authorizationMode])

  function adoptAccount(account) {
    setAccounts(current => [account, ...current.filter(item => item.accountId !== account.accountId)])
    setAccountId(account.accountId)
    setServerAddress(account.serverOrigin)
    setStatus('MonkeyAI 账号已连接')
    setAddingServer(false)
  }

  async function completeAuthorization() {
    setError('')
    setLoading(true)
    try {
      const result = await unwrap(api.completeAuthorization({ requestId: authorizationRequestId, callbackUrl }))
      adoptAccount(result)
      setAuthorizationRequestId('')
      setCallbackUrl('')
      setAuthorizationUrl('')
      setAuthorizationMode('')
    } catch (reason) {
      setError(errorText(reason))
    } finally {
      setLoading(false)
    }
  }

  async function copyAuthorizationUrl() {
    try {
      await navigator.clipboard.writeText(authorizationUrl)
      setCopied(true)
      setStatus('授权链接已复制')
    } catch {
      setStatus('复制失败，请手动选中链接文本')
    }
  }

  async function loadDevices() {
    if (!accountId) return
    setError('')
    setLoading(true)
    try {
      streamGenerationRef.current += 1
      const result = await unwrap(api.listDevices({ accountId, page: 1 }))
      setDevices(result.items)
      const first = result.items.length > 0 ? result.items[0].machineId : ''
      setMachineId(first)
      setSummarySessions([])
      setRuntimeSessions([])
      setSessionId('')
      streamRef.current?.dispose()
      streamRef.current = null
      setStatus(result.items.length > 0 ? `${result.items.length} device(s) found` : '暂无已注册设备')
      if (first) await loadSessions(first)
    } catch (reason) {
      setError(errorText(reason))
    } finally {
      setLoading(false)
    }
  }

  async function loadSessions(targetMachineId) {
    const mid = targetMachineId || machineId
    if (!accountId || !mid) return
    setError('')
    setLoading(true)
    setSessionId('')
    streamGenerationRef.current += 1
    streamRef.current?.dispose()
    streamRef.current = null
    setFrames([])
    setPendingRequests([])
    try {
      const results = await Promise.allSettled([
        withTimeout(Promise.resolve().then(() => unwrap(api.listSessions({ accountId, machineId: mid, page: 1, pageSize: 50 }))), 50_000, '会话摘要读取'),
        withTimeout(Promise.resolve().then(() => unwrap(api.listRuntimeSessions({ accountId, machineId: mid }))), 50_000, 'ACP 会话列表读取'),
      ])
      const errors = []
      if (results[0].status === 'fulfilled') setSummarySessions(results[0].value.items)
      else errors.push(`会话摘要索引：${errorText(results[0].reason)}`)
      if (results[1].status === 'fulfilled') setRuntimeSessions(results[1].value.sessions)
      else errors.push(`ACP 会话列表：${errorText(results[1].reason)}`)
      setStatus(errors.length === 0 ? '会话已刷新' : '部分会话来源不可用')
      setError(errors.join('\n'))
    } catch (reason) {
      setStatus('会话刷新失败')
      setError(errorText(reason))
    } finally {
      setLoading(false)
    }
  }

  async function openSession(session) {
    const generation = ++streamGenerationRef.current
    streamRef.current?.dispose()
    streamRef.current = null
    historyLoadedRef.current = false
    setSessionId(session.id)
    setFrames([])
    setPendingRequests([])
    setLastDelivery(undefined)
    setTurnActive(false)
    setStopping(false)
    setSessionStatus('')
    setError('')
    setAnswerText('')
    setCurrentModel('')
    setVisibleCount(RECENT_LIMIT)
    setHistoryLoading(true)
    setStatus('正在连接远程会话')
    let retries = 0
    while (streamGenerationRef.current === generation) {
      let stream
      try {
        stream = api.followSession({ accountId, machineId, sessionId: session.id, cwd: session.cwd })
        if (streamGenerationRef.current !== generation) {
          stream.dispose()
          return
        }
        streamRef.current = stream
        setStatus(retries > 0 ? '远程会话已重新连接' : '远程会话已连接')
        for await (const frame of stream) {
          setFrames(current => [...current, frame])
          if (frame.type === 'ready' && !historyLoadedRef.current) setStatus('正在回放会话历史')
          if (frame.type === 'reconnecting') setStatus(frame.message || '正在重连远程 runtime')
          if (frame.type === 'history_loaded') {
            historyLoadedRef.current = true
            setStatus('历史已加载')
            setHistoryLoading(false)
            setSessionStatus(current => current || 'idle')
            if (frame.model) setCurrentModel(frame.model)
          }
          if (frame.type === 'history_incomplete') {
            setStatus('历史不完整：' + (frame.message || '回放被中断'))
            setHistoryLoading(false)
          }
          if (frame.type === 'model_switched') {
            if (frame.data?.model) setCurrentModel(frame.data.model)
            setSwitchingModel(false)
            setStatus('模型已切换')
          }
          if (frame.type === 'model_switch_failed') {
            setSwitchingModel(false)
            setError(frame.message || '模型切换失败')
            setStatus('模型切换失败')
          }
          if (frame.type === 'session_missing') {
            setError(frame.message || '该会话在所选设备上已不存在。')
            setStatus('设备上找不到该会话')
            setHistoryLoading(false)
          }
          if (frame.type === 'request') {
            setPendingRequests(current => [...current.filter(item => item.requestId !== frame.requestId), frame])
          }
          if (frame.type === 'notification' && frame.method === '_monkeyai/session/state') {
            const status = frame.data?.state?.status
            if (typeof status === 'string' && SESSION_STATUS_LABEL[status]) {
              setSessionStatus(status)
              setTurnActive(status === 'running')
              if (status !== 'running') setStopping(false)
            }
          }
          if (frame.type === 'delivery') {
            const accepted = Boolean(frame.data?.accepted)
            setLastDelivery({ accepted, code: frame.data?.code, frame: frame.type })
            setTurnActive(false)
            setStopping(false)
            if (accepted) {
              const cancelled = frame.data?.result?.stopReason === 'cancelled'
              setStatus(cancelled ? '回合已停止' : '回合已完成')
            } else {
              setPrompt(current => current === '' ? (lastDraftRef.current || '') : current)
              setStatus('MonkeyAI 未接受该指令，草稿已保留')
              if (frame.message) setError(frame.message)
            }
          }
          if (frame.type === 'cancel_sent') {
            setStopping(false)
            setStatus('已请求停止，等待 runtime 取消')
          }
          if (frame.type === 'response_sent') {
            setPendingRequests(current => current.filter(item => item.requestId !== frame.requestId))
          }
          if (frame.type === 'response_error') {
            setError(`远程回复被拒绝：${frame.code || '未知'}`)
          }
          if (frame.type === 'error') setError(frame.message || frame.code || '远程会话错误')
        }
        if (streamGenerationRef.current !== generation || streamRef.current !== stream) return
        streamRef.current = null
        setStatus('远程会话已断开')
        setHistoryLoading(false)
        setTurnActive(false)
        setStopping(false)
        return
      } catch (reason) {
        if (streamGenerationRef.current !== generation || (stream && streamRef.current !== stream)) return
        if (isRemoteStreamCarrierError(reason)) {
          retries += 1
          try { stream?.dispose() } catch {}
          streamRef.current = null
          setError('')
          setTurnActive(false)
          setStopping(false)
          setStatus('远程连接中断，正在重连')
          const delay = Math.min(1000 * (2 ** Math.min(retries - 1, 5)), 30_000)
          await new Promise(resolve => setTimeout(resolve, delay))
          continue
        }
        streamRef.current = null
        setStatus('远程会话不可用')
        setError(errorText(reason))
        setHistoryLoading(false)
        setTurnActive(false)
        setStopping(false)
        return
      }
    }
  }

  function sendPrompt() {
    const stream = streamRef.current
    const text = prompt.trim()
    if (!stream || !text || !hasControl) return
    try {
      stream.send({ type: 'prompt', text })
      lastDraftRef.current = text
      setLastDelivery({ accepted: false, frame: 'pending' })
      setPrompt('')
      setTurnActive(true)
      setStopping(false)
      setStatus('指令已发送，MonkeyAI 正在处理')
    } catch (reason) {
      setError(errorText(reason))
    }
  }

  function stopTurn() {
    const stream = streamRef.current
    if (!stream || !turnActive || stopping) return
    try {
      stream.send({ type: 'cancel' })
      setStopping(true)
      setStatus('停止中…')
    } catch (reason) {
      setError(errorText(reason))
    }
  }

  function respond(request, result) {
    if (!hasControl) {
      setError('回复 MonkeyAI 需要 session:control 权限')
      return
    }
    try {
      streamRef.current?.send({ type: 'respond', requestId: request.requestId, result })
    } catch (reason) {
      setError(errorText(reason))
    }
  }

  function answerQuestion(request) {
    const text = answerText.trim()
    if (text === '') return
    respond(request, { action: 'accept', content: { text } })
  }

  async function disconnectAccount() {
    if (!accountId) return
    streamRef.current?.dispose()
    streamRef.current = null
    try {
      await unwrap(api.disconnect({ accountId }))
      setAccounts(current => current.filter(item => item.accountId !== accountId))
      setAccountId('')
      setDevices([])
      setSummarySessions([])
      setRuntimeSessions([])
      setSessionId('')
      setAuthorizationRequestId('')
      setCallbackUrl('')
      setAuthorizationUrl('')
      setAuthorizationMode('')
      setStatus('未连接')
      setAddingServer(false)
    } catch (reason) {
      setError(errorText(reason))
    }
  }

  useEffect(() => {
    setManualDevices(loadManualDevices())
  }, [])

  useEffect(() => {
    setDevices([])
    setMachineId('')
    setSummarySessions([])
    setRuntimeSessions([])
    setSessionId('')
    setFrames([])
    setPendingRequests([])
    setLastDelivery(undefined)
    setTurnActive(false)
    setStopping(false)
    streamRef.current?.dispose()
    streamRef.current = null
  }, [accountId])

  function loadManualDevices() {
    try {
      const raw = window.localStorage.getItem(MANUAL_DEVICES_KEY)
      const parsed = raw ? JSON.parse(raw) : []
      return Array.isArray(parsed) ? parsed.filter(item => item && typeof item.machineId === 'string' && item.machineId !== '') : []
    } catch {
      return []
    }
  }

  function saveManualDevices(items) {
    try {
      window.localStorage.setItem(MANUAL_DEVICES_KEY, JSON.stringify(items.slice(0, 32)))
    } catch {}
    setManualDevices(items)
  }

  function addManualDevice() {
    const machineId = manualDeviceId.trim()
    if (!machineId) return
    const entry = { machineId, displayName: manualDeviceName.trim() || machineId, manual: true, status: 'manual' }
    const existing = loadManualDevices().filter(item => item.machineId !== machineId)
    saveManualDevices([entry, ...existing])
    setManualDeviceId('')
    setManualDeviceName('')
    if (accountId) {
      setDevices(current => [entry, ...current.filter(item => item.machineId !== machineId)])
      setMachineId(current => current || machineId)
    }
    setStatus(`已添加设备 ${entry.displayName}`)
  }

  function removeManualDevice(machineId) {
    saveManualDevices(loadManualDevices().filter(item => item.machineId !== machineId))
    setDevices(current => current.filter(item => item.machineId !== machineId))
    setMachineId(current => (current === machineId ? '' : current))
  }

  async function createRemoteSession() {
    if (!machineId || !newSessionCwd.trim() || newSessionBusy) return
    setError('')
    setNewSessionBusy(true)
    try {
      const created = await unwrap(api.createSession({ accountId, machineId, cwd: newSessionCwd.trim(), ...(selectedModel ? { model: selectedModel } : {}) }))
      if (created.model) setCurrentModel(created.model)
      setRuntimeSessions(current => {
        if (current.some(item => item.id === created.sessionId)) return current
        return [{ id: created.sessionId, title: created.title || '新建远程会话', cwd: created.cwd }, ...current]
      })
      setSummarySessions(current => current.filter(item => item.id !== created.sessionId))
      setStatus('会话已创建')
      await openSession({ id: created.sessionId, title: created.title || '新建远程会话', cwd: created.cwd })
    } catch (reason) {
      setError(errorText(reason))
      setStatus('无法创建远程会话')
    } finally {
      setNewSessionBusy(false)
    }
  }

  async function switchSessionModel(modelId) {
    if (!accountId || !machineId || !sessionId || switchingModel) return
    const stream = streamRef.current
    if (!stream) return
    setError('')
    setSwitchingModel(true)
    try {
      // Switch on the live session connection: a separate connection cannot
      // see the mounted session and the runtime rejects the switch.
      stream.send({ type: 'switch_model', model: modelId })
      setStatus('正在切换模型…')
    } catch (reason) {
      setError(errorText(reason))
      setStatus('模型切换失败')
      setSwitchingModel(false)
    }
  }

  useEffect(() => {
    setSummarySessions([])
    setRuntimeSessions([])
    setSessionId('')
    setFrames([])
    setPendingRequests([])
    setLastDelivery(undefined)
    setTurnActive(false)
    setStopping(false)
    streamRef.current?.dispose()
    streamRef.current = null
  }, [machineId])

  const currentAccount = accounts.find(item => item.accountId === accountId)
  const hasControl = Boolean(currentAccount?.scopes?.includes('session:control'))
  const hasRead = Boolean(currentAccount?.scopes?.includes('session:read'))
  const allDevices = useMemo(() => {
    const seen = new Set()
    const merged = []
    for (const device of [...manualDevices, ...devices]) {
      if (seen.has(device.machineId)) continue
      seen.add(device.machineId)
      merged.push(device)
    }
    return merged
  }, [manualDevices, devices])
  const sessionOptions = runtimeSessions.length > 0
    ? runtimeSessions.map(item => ({
        id: item.id,
        title: item.title,
        cwd: item.cwd,
        stale: false,
        deviceStatus: '',
        source: 'runtime',
      }))
    : summarySessions.map(item => ({
        id: item.id,
        title: item.title,
        cwd: '',
        stale: item.stale,
        deviceStatus: item.deviceStatus,
        source: 'summary',
      }))

  const isLive = /connected|accepted|created|loaded/i.test(status) && !/disconnected|failed|unavailable|expired|missing|rejected/i.test(status)
  const authorizing = authorizationRequestId !== ''
  const showConnectCard = !currentAccount || authorizing || addingServer

  return h('main', { style: style.page, className: 'mai-panel' },
    h('style', { dangerouslySetInnerHTML: { __html: PANEL_CSS } }),
    h('header', { style: style.header },
      h('div', { style: { display: 'grid', gap: 1 } },
        h('p', { style: style.eyebrow }, '远程工作区'),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
          h(MonkeyIcon, { size: 22 }),
          h('h1', { style: style.title, className: 'mai-page-title' }, 'MonkeyAI 会话'))),
      h(StatusBadge, { status, live: isLive })),
    error ? h('div', { role: 'alert', style: style.error },
      h('span', { style: { flex: 1 } }, error),
      h('button', {
        type: 'button', 'aria-label': '关闭错误提示', onClick: () => setError(''),
        style: { border: 0, background: 'transparent', cursor: 'pointer', color: t.danger, fontWeight: 700, padding: '0 2px', fontSize: 13 },
      }, '×')) : null,
    showConnectCard ? h('section', { style: style.card },
      addingServer && !authorizing ? h('div', { style: style.row },
        h('h2', { style: { ...style.sectionTitle, flex: 1 } }, '添加 MonkeyAI 服务器'),
        h('button', { type: 'button', style: style.button, onClick: () => { setAddingServer(false); setServerAddress(currentAccount?.serverOrigin || ''); setStatus('MonkeyAI 账号已连接') } }, '取消')) : null,
      authorizing ? h(React.Fragment, null,
        h('div', { style: style.row },
          h('h2', { style: { ...style.sectionTitle, flex: 1 } }, addingServer ? '正在授权新服务器' : '等待授权'),
          addingServer ? h('button', { type: 'button', style: style.button, onClick: () => { setAuthorizationRequestId(''); setAuthorizationUrl(''); setAuthorizationMode(''); setCallbackUrl(''); setAddingServer(false); setStatus('MonkeyAI 账号已连接') } }, '取消') : null),
        h('ol', { style: { margin: 0, paddingLeft: 18, display: 'grid', gap: 6, fontSize: 12.5, color: t.text2 } },
          h('li', null, '打开授权页并在 MonkeyAI 中批准访问。',
            h('span', { style: style.row, title: authorizationUrl },
              h('a', { href: authorizationUrl, target: '_blank', rel: 'noopener noreferrer', style: { color: t.accent, fontWeight: 600, fontSize: 12 } }, '打开授权页'),
              h('button', { type: 'button', style: style.button, onClick: copyAuthorizationUrl }, copied ? '已复制' : '复制链接'))),
          authorizationMode === 'loopback'
            ? h('li', null, '在浏览器中批准后面板会自动完成。若浏览器无法回传到 DSH，请复制回调 URL 粘贴到下方。')
            : h('li', null, '批准后浏览器会显示 monkeyai-desktop:// 回调，复制地址栏完整 URL 粘贴到下方。')),
        h('details', { style: style.details },
          h('summary', { style: style.summary }, '没有自动完成？手动粘贴回调'),
          h('div', { style: { ...style.row, paddingTop: 8 } },
            h('input', {
              type: 'url',
              value: callbackUrl,
              placeholder: authorizationMode === 'loopback'
                ? 'http://127.0.0.1:PORT/oauth/callback?code=...&state=...'
                : 'monkeyai-desktop://oauth/callback?code=...&state=...',
              style: { ...style.input, flex: '1 1 260px' },
              onChange: event => setCallbackUrl(event.target.value),
            }),
            h('button', { type: 'button', style: style.primaryButton, disabled: loading || !callbackUrl, onClick: completeAuthorization }, '完成授权'))))
      : h(React.Fragment, null,
        h('h2', { style: style.sectionTitle }, '连接 MonkeyAI'),
        h('form', {
          style: { display: 'grid', gap: 10 },
          onSubmit: event => { event.preventDefault(); signIn() },
        },
          h(Field, { labelText: 'MonkeyAI 服务器地址' },
            h('input', {
              type: 'url',
              value: serverAddress,
              placeholder: 'https://monkeyai.example.com',
              style: style.input,
              autoComplete: 'url',
              onChange: event => setServerAddress(event.target.value),
            })),
          h(Field, { labelText: '账号邮箱' },
            h('input', {
              type: 'email',
              value: signInEmail,
              placeholder: 'you@example.com',
              style: style.input,
              autoComplete: 'username',
              onChange: event => setSignInEmail(event.target.value),
            })),
          h(Field, { labelText: '密码' },
            h('input', {
              type: 'password',
              value: signInPassword,
              placeholder: 'MonkeyAI 账号密码',
              style: style.input,
              autoComplete: 'current-password',
              onChange: event => setSignInPassword(event.target.value),
            })),
          h('button', {
            type: 'submit', style: style.primaryButton,
            disabled: loading || !serverAddress || !signInEmail.trim() || signInPassword === '',
          }, loading ? '登录中…' : '登录'),
          h('p', { style: { margin: 0, fontSize: 11.5, color: t.text3 } },
            '登录在 DSH Host 上完成，手机同样可用。密码仅用于本次授权，不会被存储。')),
        h('details', { style: style.details },
          h('summary', { style: style.summary }, '改用浏览器授权'),
          h('div', { style: { display: 'grid', gap: 8, paddingTop: 8 } },
            h('button', { type: 'button', style: style.button, disabled: loading || !serverAddress, onClick: () => beginAuthorization('loopback') }, '在浏览器中授权'),
            h('button', { type: 'button', style: style.button, disabled: loading || !serverAddress, onClick: () => beginAuthorization('scheme') }, '授权（粘贴回调）'),
            h('p', { style: { margin: 0, fontSize: 12, color: t.text3 } }, '浏览器授权需要回调能访问到本机 Host。手机上请改用上方账号登录。'))),
        accounts.length > 0 ? h('p', { style: { margin: 0, fontSize: 12, color: t.text3 } }, '已连接的账号会出现在设备列表上方的账号选择器中。') : null))
      : null,
    currentAccount ? h('section', { style: style.toolbarCard, className: 'mai-toolbar' },
      h('div', { style: style.row, className: 'mai-toolbar-heading' },
        h('div', { style: { display: 'grid', gap: 1, flex: 1, minWidth: 0 } },
          h('h2', { style: style.sectionTitle }, '远程会话'),
          h('p', { style: style.subtitle }, '选择设备，继续处理 MonkeyAI 会话')),
        h('span', { style: style.chip }, currentAccount.scopes.filter(s => s !== 'device:connect').join(' · '))),
      h('div', { style: style.row, className: 'mai-toolbar-controls' },
        h('select', { style: { ...style.input, flex: '1 1 200px' }, value: accountId, onChange: event => setAccountId(event.target.value), 'aria-label': '已授权账号' },
          accounts.map(account => h('option', { key: account.accountId, value: account.accountId }, account.serverOrigin))),
        h('button', { type: 'button', style: { ...style.button, flex: '0 0 auto', padding: '6px 10px', fontWeight: 700 }, disabled: loading || addingServer, onClick: () => { setAddingServer(true); setServerAddress(''); setAuthorizationRequestId(''); setAuthorizationUrl(''); setAuthorizationMode(''); setCallbackUrl(''); setStatus('请输入 MonkeyAI 服务器地址') }, title: '授权另一个 MonkeyAI 服务器' }, '+ 添加服务器'),
        h('select', { style: { ...style.input, flex: '1 1 220px' }, value: machineId, onChange: event => {
          const next = event.target.value
          setMachineId(next)
          if (next) void loadSessions(next)
        }, 'aria-label': '远程设备' },
          h('option', { value: '' }, '选择设备'),
          allDevices.map(device => h('option', { key: device.machineId, value: device.machineId }, `${device.displayName}${device.status === 'online' ? '' : ` · ${device.status === 'offline' ? '离线' : device.status}`}${device.stale ? ' · 已过期' : ''}`))),
        h('button', { type: 'button', style: style.button, disabled: loading, onClick: machineId ? () => loadSessions() : loadDevices, title: machineId ? '刷新会话' : '刷新设备' }, '刷新'),
        h('button', { type: 'button', style: style.dangerButton, disabled: !accountId, onClick: disconnectAccount, title: '撤销该账号授权' }, '断开连接')),
      !hasRead ? h('p', { style: { margin: 0, fontSize: 12, color: t.text3 } }, '列出和读取远程会话需要 session:read 权限。') : null,
      manualDevices.length > 0
        ? h('div', { style: style.row },
          manualDevices.map(device => h('span', { key: device.machineId, style: style.chip },
            device.displayName,
            h('button', {
              type: 'button', style: { border: 0, background: 'transparent', cursor: 'pointer', padding: 0, color: t.danger, fontWeight: 700, fontSize: 12 },
              'aria-label': `移除 ${device.displayName}`,
              onClick: () => removeManualDevice(device.machineId),
            }, '×'))))
        : null,
      h('details', { style: style.details },
        h('summary', { style: style.summary }, '找不到设备？按 machine ID 添加'),
        h('div', { style: { display: 'grid', gap: 8, paddingTop: 8 } },
          h('div', { style: style.row },
            h('input', {
              style: { ...style.input, flex: '2 1 200px' },
              value: manualDeviceId,
              placeholder: 'Machine ID，例如 6f1c2a34-... 或 headless-host-01',
              onChange: event => setManualDeviceId(event.target.value),
            }),
            h('input', {
              style: { ...style.input, flex: '1 1 140px' },
              value: manualDeviceName,
              placeholder: '显示名称（可选）',
              onChange: event => setManualDeviceName(event.target.value),
            }),
            h('button', { type: 'button', style: style.button, disabled: !manualDeviceId.trim(), onClick: addManualDevice }, '添加')))),
      h('details', { style: style.details },
        h('summary', { style: style.summary }, '新建远程会话'),
        h('div', { style: { display: 'grid', gap: 8, paddingTop: 8 } },
          h('div', { style: style.row },
            h('input', {
              style: { ...style.input, flex: '2 1 200px' },
              value: newSessionCwd,
              placeholder: '工作目录，例如 /root',
              onChange: event => setNewSessionCwd(event.target.value),
            }),
            h('select', {
              style: { ...style.input, flex: '1 1 160px' },
              value: selectedModel,
              disabled: models.length === 0,
              onChange: event => setSelectedModel(event.target.value),
              'aria-label': '新会话使用的模型',
            }, models.map(m => h('option', { key: m.id, value: m.id }, m.displayName))),
            h('button', {
              type: 'button', style: style.primaryButton, flex: '0 0 auto',
              disabled: loading || !machineId || !newSessionCwd.trim() || newSessionBusy,
              onClick: createRemoteSession,
            }, newSessionBusy ? '创建中…' : '创建')))))
      : null,
    currentAccount ? h('div', { className: 'mai-workspace' },
      h('aside', { style: style.sessionSidebar, className: 'mai-session-sidebar' },
        h('div', { style: { ...style.row, justifyContent: 'space-between' } },
          h('h2', { style: style.sectionTitle }, '会话列表'),
          h('span', { style: style.chip }, String(sessionOptions.length))),
        sessionOptions.length > 0
          ? h('div', { style: style.sessions, className: 'mai-session-list' }, sessionOptions.map(session => {
              const flag = session.stale ? '已过期' : session.deviceStatus && session.deviceStatus !== 'online' ? (session.deviceStatus === 'offline' ? '离线' : session.deviceStatus) : ''
              return h('button', {
                style: { ...style.session, ...(session.id === sessionId ? style.selected : {}) },
                className: 'mai-card-hover mai-session-card',
                'aria-current': session.id === sessionId ? 'true' : undefined,
                key: session.id,
                type: 'button',
                disabled: !session.cwd,
                onClick: () => openSession(session),
                title: session.cwd ? `打开 ${session.cwd}` : 'ACP 会话列表未提供工作目录',
              },
                h('span', { style: style.sessionTitle }, session.title || session.id),
                h('span', { style: style.sessionMeta, className: 'mai-session-meta' }, session.cwd || '加载历史需要 runtime 提供工作目录'),
                flag !== '' ? h('span', { style: { fontSize: 10.5, fontWeight: 650, color: session.stale ? t.text3 : '#8a6d1d', textTransform: 'uppercase', letterSpacing: '0.04em' } }, flag) : null)
            }))
          : h('div', { style: { display: 'grid', alignContent: 'center', justifyItems: 'center', gap: 7, padding: '22px 12px', textAlign: 'center' } },
              h('span', { style: { ...style.avatar, width: 34, height: 34, background: t.surfaceAlt, color: t.text3, fontSize: 17 } }, '·'),
              h('span', { style: { fontSize: 12, fontWeight: 600, color: t.text2 } }, machineId ? '这里还没有会话' : '请选择远程设备'),
              h('span', { style: { fontSize: 11, color: t.text3 } }, machineId ? '刷新会话或创建一个新会话' : '会话列表会显示在这里')),
        h('div', { style: { borderTop: `1px solid ${t.border}`, paddingTop: 8 } },
          h('p', { style: { margin: 0, fontSize: 10.5, color: t.text3 } }, machineId ? '会话来自所选设备的 runtime' : '连接设备后查看会话'))),
      sessionId ? h('section', { style: { ...style.card, ...style.thread }, className: 'mai-thread' },
      h('div', { style: style.row, className: 'mai-thread-header' },
        h('button', {
          type: 'button', style: { ...style.button, flexShrink: 0 }, title: '关闭会话并返回列表',
          onClick: () => { streamGenerationRef.current += 1; streamRef.current?.dispose(); streamRef.current = null; setSessionId(''); setTurnActive(false); setStopping(false); setSessionStatus(''); setStatus('远程会话已关闭') },
        }, '←'),
        h('strong', { style: { flex: 1, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, title }, title),
        sessionStatus ? h('span', {
          style: {
            ...style.statusBadge,
            background: sessionStatus === 'running' ? t.accentSoft : sessionStatus === 'error' ? t.dangerBg : t.surfaceAlt,
            borderColor: sessionStatus === 'running' ? t.accent : sessionStatus === 'error' ? t.dangerBorder : t.border,
            color: sessionStatus === 'running' ? t.accent : sessionStatus === 'error' ? t.danger : t.text2,
          },
          title: '会话状态',
          'aria-label': `会话状态：${SESSION_STATUS_LABEL[sessionStatus]}`,
        },
          sessionStatus === 'running' ? h('span', { className: 'mai-pulse', style: { ...style.dot, background: t.accent } }) : null,
          SESSION_STATUS_LABEL[sessionStatus]) : null,
        h('select', {
          style: { ...style.input, flex: '0 1 190px', minWidth: 130 },
          value: currentModel,
          disabled: !hasControl || switchingModel || models.length === 0,
          title: '切换该会话的模型',
          onChange: event => {
            const next = event.target.value
            if (next && next !== currentModel) switchSessionModel(next)
          },
        },
          currentModel && !models.some(m => m.id === currentModel)
            ? h('option', { value: currentModel }, currentModel.slice(0, 24))
            : null,
          models.map(m => h('option', { key: m.id, value: m.id }, `${m.displayName} (${Math.round(m.contextWindowTokens / 1000)}k)`)))),
      h('div', { style: style.events, className: 'mai-thread-events mai-events', 'aria-live': 'polite', 'data-events': '', ref: eventsRef,
          onScroll: event => {
            const el = event.currentTarget
            if (el.scrollTop < 60 && visibleCount < displayEntries.length) {
              prevScrollHeightRef.current = el.scrollHeight
              setVisibleCount(count => Math.min(count + 100, displayEntries.length))
            }
          } },
        historyLoading
          ? h('div', { style: { fontSize: 12.5, color: t.text3, textAlign: 'center', padding: '32px 12px' } },
              displayEntries.length > 0 ? `正在加载会话历史…（已加载 ${displayEntries.length} 条）` : '正在加载会话历史…')
          : h(React.Fragment, null,
              displayEntries.length > visibleCount
                ? h('div', { style: { fontSize: 11, color: t.text3, textAlign: 'center', padding: '6px 0' } }, `还有 ${displayEntries.length - visibleCount} 条更早的消息 — 向上滚动加载`)
                : null,
              displayEntries.slice(-visibleCount).map(entry => {
        if (entry.kind === 'thought') {
          return h('div', { style: { display: 'flex', gap: 8, alignItems: 'flex-start', justifyContent: 'flex-start' }, key: entry.key },
            h('div', { style: { ...style.avatar, background: '#8a5fd0' } }, '···'),
            h('details', { style: style.thought },
              h('summary', { style: style.thoughtSummary }, '思考过程'),
              h('p', { style: { margin: '6px 0 0', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: '#5b4a72', fontStyle: 'italic' } }, entry.text || '')))
        }
        if (entry.kind === 'message') {
          const isUser = entry.role === 'user'
          const isThought = entry.role === 'thought'
          const avatarColor = isUser ? '#5a6472' : isThought ? '#8a5fd0' : t.accent
          const bubbleStyle = isUser ? style.bubbleUser : isThought ? style.thought : style.bubble
          return h('div', { style: isUser ? style.bubbleWrapUser : style.bubbleWrap, key: entry.key },
            !isUser ? h('div', { style: { ...style.avatar, background: avatarColor, padding: isUser ? 0 : 3 } }, isThought ? '···' : h(MonkeyIcon, { size: 18 })) : null,
            h('div', { style: bubbleStyle },
              h('div', { style: { fontSize: 10.5, fontWeight: 700, letterSpacing: '0.04em', marginBottom: 3, opacity: 0.7, textTransform: 'uppercase', color: isUser ? 'rgba(255,255,255,0.85)' : t.text3 } }, entry.label),
              isUser
                ? h('p', { style: { margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } }, entry.text || '')
                : h('div', { className: 'mai-md' }, renderMarkdown(entry.text || ''))),
            isUser ? h('div', { style: { ...style.avatar, background: avatarColor } }, '我') : null)
        }
        if (entry.kind === 'tool') {
          const statusLabel = entry.status ? (TOOL_STATUS_LABEL[entry.status] ?? entry.status) : 'running'
          const running = entry.status !== 'completed' && entry.status !== 'failed' && entry.status !== 'cancelled'
          const statusColor = entry.status === 'completed' ? '#2f7d54' : entry.status === 'failed' ? t.danger : '#8a6d1d'
          const statusBg = entry.status === 'completed' ? '#e9f5ee' : entry.status === 'failed' ? t.dangerBg : '#fdf6e3'
          return h('details', { style: { ...style.event, padding: '6px 11px', background: t.surface }, key: entry.key },
            h('summary', { style: { ...style.row, cursor: 'pointer', userSelect: 'none', listStyle: 'none' } },
              h('span', { style: { fontSize: 10, fontWeight: 700, color: t.text3, textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 } }, '工具'),
              h('span', { style: { fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 } }, entry.title || '执行中'),
              running ? h('span', { className: 'mai-pulse', style: { ...style.dot, width: 6, height: 6, background: '#d4a72c' } }) : null,
              h('span', { style: { fontSize: 10.5, padding: '1px 8px', borderRadius: 999, background: statusBg, color: statusColor, fontWeight: 650, flexShrink: 0 } }, statusLabel)),
            entry.detail ? h('pre', { style: { margin: '6px 0 0', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 11.5, maxHeight: 320, overflowY: 'auto', background: t.surfaceAlt, borderRadius: 6, padding: '8px 10px' } }, entry.detail) : null)
        }
        if (entry.kind === 'plan') {
          return h('article', { style: style.event, key: entry.key },
            h('div', { style: { fontSize: 10.5, fontWeight: 700, color: t.text3, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.04em' } }, '计划'),
            ...entry.entries.map((item, index) => h('div', { style: { display: 'flex', gap: 6, fontSize: 12.5, margin: '2px 0' }, key: index },
              h('span', { style: { opacity: 0.55 } }, index + 1 + '.'),
              h('span', { style: { textDecoration: item.status === 'completed' ? 'line-through' : 'none', opacity: item.status === 'completed' ? 0.55 : 1 } },
                typeof item.content === 'string' ? item.content : JSON.stringify(item.content ?? item)))))
        }
        if (entry.kind === 'system') {
          return h('div', { style: { fontSize: 11.5, color: t.text3, textAlign: 'center', padding: '2px 0' }, key: entry.key }, entry.label)
        }
        return h('article', { style: style.event, key: entry.key },
          h('div', { style: { opacity: 0.6, fontSize: 11, marginBottom: 4 } }, entry.label),
          h('details', null,
            h('summary', { style: style.summary }, '查看详情'),
            h('pre', { style: { margin: '5px 0 0', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 11.5 } }, JSON.stringify(entry.data ?? {}, null, 2))))
          })
        )
      ),
      ...pendingRequests.map(request => h(ApprovalCard, {
        key: `${typeof request.requestId}:${request.requestId}`,
        request, hasControl, onRespond: respond, answerText, setAnswerText, onAnswer: answerQuestion,
      })),
      h('form', { style: style.composer, onSubmit: event => { event.preventDefault(); sendPrompt() } },
        h('textarea', {
          style: style.textarea,
          value: prompt,
          onChange: event => setPrompt(event.target.value),
          onKeyDown: event => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              sendPrompt()
            }
          },
          placeholder: hasControl ? '向远程会话下发指令（回车发送，Shift+回车换行）' : '只读模式：下发指令需要 session:control 权限',
          disabled: !hasControl,
        }),
        turnActive
          ? h('button', {
              type: 'button', style: style.stopButton, disabled: !hasControl || stopping,
              onClick: stopTurn, title: stopping ? '停止中…' : '停止当前回合',
              'aria-label': '停止当前回合',
            },
              h('span', { style: style.stopIcon }))
          : h('button', {
              type: 'submit', style: style.sendButton,
              disabled: !streamRef.current || !hasControl || prompt.trim() === '',
              title: '发送（回车）', 'aria-label': '发送指令',
            },
              h('svg', { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true', style: { display: 'block' } },
                h('path', { d: 'M8 12.5V3.5M8 3.5L4 7.5M8 3.5L12 7.5', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' })))),
      lastDelivery || turnActive ? h('div', { style: { fontSize: 11.5, color: turnActive ? t.accent : lastDelivery?.accepted ? t.success : lastDelivery?.frame === 'pending' ? t.text3 : t.danger, textAlign: 'right', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 } },
        turnActive ? h('span', { className: 'mai-pulse', style: { ...style.dot, background: t.accent } }) : null,
        turnActive ? (stopping ? '正在停止当前回合…' : 'MonkeyAI 正在处理…') : lastDelivery?.accepted ? '回合已结束' : lastDelivery?.frame === 'pending' ? '等待投递' : '投递被拒绝') : null)
      : h('section', { style: style.emptyThread, className: 'mai-empty-thread' },
          h('div', { className: 'mai-empty-mark' }, h(MonkeyIcon, { size: 26 })),
          h('p', { style: style.eyebrow }, '远程会话'),
          h('h2', { style: { margin: 0, fontSize: 18, fontWeight: 650, color: '#182230' } }, '选择一个会话'),
          h('p', { style: { ...style.subtitle, maxWidth: 300 } }, sessionOptions.length > 0 ? '从左侧选择会话，在此继续对话。' : machineId ? '当前设备还没有会话。可在上方新建或刷新。' : '先选择一个远程设备。'))
    ) : null)
}

function MonkeyIcon({ size = 18 }) {
  return h('svg', {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    'aria-hidden': 'true', style: { display: 'block', flexShrink: 0 },
  },
    h('circle', { cx: 7, cy: 9.5, r: 3.2, fill: '#8b5e3c' }),
    h('circle', { cx: 17, cy: 9.5, r: 3.2, fill: '#8b5e3c' }),
    h('circle', { cx: 7, cy: 9.5, r: 1.6, fill: '#e8c9a8' }),
    h('circle', { cx: 17, cy: 9.5, r: 1.6, fill: '#e8c9a8' }),
    h('circle', { cx: 12, cy: 12, r: 7.5, fill: '#a06b42' }),
    h('path', { d: 'M6.8 12.2c0-2.6 2.3-4.4 5.2-4.4s5.2 1.8 5.2 4.4c0 3.2-2.3 5.6-5.2 5.6s-5.2-2.4-5.2-5.6z', fill: '#f3ddc4' }),
    h('circle', { cx: 9.7, cy: 11.6, r: 1.05, fill: '#3d2b1c' }),
    h('circle', { cx: 14.3, cy: 11.6, r: 1.05, fill: '#3d2b1c' }),
    h('path', { d: 'M9.8 14.9c.6.7 1.4 1 2.2 1s1.6-.3 2.2-1', stroke: '#3d2b1c', strokeWidth: 1.1, strokeLinecap: 'round', fill: 'none' }))
}

export const inject = ['slots', 'remote', 'layout']

export async function apply(ctx) {
  const transport = ctx.plugin(async owner => {
    const disposeRemote = await owner.remote.$mount(TYPERT_REMOTE)
    await owner.inject(['remote.monkeyaiSessions'], scope => {
      const api = scope.remote.monkeyaiSessions
      const page = props => h(RemoteSessionPage, { ...props, api })
      const icon = () => h('button', {
        type: 'button',
        style: { width: '100%', height: '100%', padding: 0, border: 0, background: 'transparent', color: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
        onClick: () => owner.layout.selectPanel(PANEL_ID),
        'aria-label': 'MonkeyAI 会话',
        title: 'MonkeyAI 会话',
      }, h(MonkeyIcon, { size: 18 }))
      owner.slots.inject('main', () => owner.slots.register({
        name: 'main', key: PANEL_ID, inject: () => ({ api }),
      }, page))
      owner.slots.inject('sidebar.panellist', () => owner.slots.register({
        name: 'sidebar.panellist', id: PANEL_ID, order: 45, label: () => 'MonkeyAI',
      }, icon))
    })
    return async () => disposeRemote()
  })
  await transport
  return async () => transport.dispose()
}
