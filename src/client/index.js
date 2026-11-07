import React from 'react'
import { TYPERT_REMOTE } from '../remote.js'
import { projectFrames, TOOL_STATUS_LABEL } from '../shared/projection.mjs'

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
  page: { display: 'grid', gap: 12, maxWidth: 1080, margin: '0 auto', padding: '16px 18px 24px', color: t.text, height: '100%', minHeight: 0, overflowY: 'auto', boxSizing: 'border-box', alignContent: 'start', fontSize: 13, lineHeight: 1.5 },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingBottom: 2 },
  title: { margin: 0, fontSize: 15, fontWeight: 650, letterSpacing: '-0.01em', color: t.text },
  subtitle: { margin: 0, fontSize: 12, color: t.text3 },
  sectionTitle: { margin: 0, fontSize: 12, fontWeight: 650, color: t.text2, textTransform: 'uppercase', letterSpacing: '0.04em' },
  card: { display: 'grid', gap: 10, padding: 14, border: `1px solid ${t.border}`, borderRadius: t.radiusLg, background: t.surface },
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
  events: { display: 'flex', flexDirection: 'column', gap: 8, height: '56vh', minHeight: 200, overflowY: 'auto', padding: '4px 6px 4px 2px' },
  event: { padding: '8px 11px', borderRadius: t.radius, background: t.surfaceAlt, border: `1px solid ${t.border}`, overflowWrap: 'anywhere', color: t.text },
  bubbleWrap: { display: 'flex', gap: 8, alignItems: 'flex-start', width: '100%' },
  bubbleWrapUser: { display: 'flex', gap: 8, alignItems: 'flex-start', justifyContent: 'flex-end', width: '100%' },
  avatar: { width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#ffffff', flexShrink: 0, marginTop: 2 },
  bubble: { maxWidth: '88%', minWidth: 0, flex: '0 1 auto', width: 'fit-content', borderRadius: t.radiusLg, padding: '8px 13px', background: t.surfaceAlt, border: `1px solid ${t.border}`, lineHeight: 1.55, fontSize: 13 },
  bubbleUser: { maxWidth: '88%', minWidth: 0, flex: '0 1 auto', width: 'fit-content', borderRadius: t.radiusLg, padding: '8px 13px', background: t.accent, color: '#ffffff', lineHeight: 1.55, fontSize: 13 },
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
@keyframes mai-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
.mai-panel .mai-pulse { animation: mai-pulse 1.2s ease-in-out infinite; }
.mai-panel .mai-md > div:first-child > :first-child { margin-top: 0; }
.mai-panel .mai-md > div:last-child > :last-child { margin-bottom: 0; }
.mai-panel .mai-md pre::-webkit-scrollbar { height: 6px; }
.mai-panel .mai-md pre::-webkit-scrollbar-thumb { background: #d5dbe4; border-radius: 6px; }
`

function errorText(error) {
  return typeof error?.message === 'string' ? error.message : typeof error === 'string' ? error : 'Remote operation failed'
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
      h('span', { style: { fontSize: 12.5, fontWeight: 650 } }, isPermission ? 'Permission requested' : 'MonkeyAI asks for input'),
      h('span', { style: { fontSize: 11, color: t.text3 } }, 'responding requires session:control')),
    questionText !== '' ? h('div', { style: { fontSize: 12.5, color: t.text2, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } }, questionText) : null,
    options.length > 0
      ? h('div', { style: style.row },
        options.map(option => h('button', {
          type: 'button', style: option.kind === 'allow_once' || option.kind === 'allow_always' ? style.primaryButton : style.button,
          key: option.optionId, disabled, onClick: () => onRespond(request, { outcome: 'selected', optionId: option.optionId }),
        }, option.name || option.optionId)),
        h('button', { type: 'button', style: style.button, disabled, onClick: () => onRespond(request, { outcome: 'cancelled' }) }, 'Decline'))
      : null,
    options.length === 0 && !isPermission
      ? h(React.Fragment, null,
        h('textarea', {
          style: { ...style.textarea, minHeight: 44 },
          placeholder: disabled ? 'Read-only: session:control is required to answer' : 'Type your answer',
          value: answerText, disabled,
          onChange: event => setAnswerText(event.target.value),
        }),
        h('div', { style: style.row },
          h('button', { type: 'button', style: style.primaryButton, disabled: disabled || answerText.trim() === '', onClick: () => onAnswer(request) }, 'Reply'),
          h('button', { type: 'button', style: style.button, disabled, onClick: () => onRespond(request, { action: 'decline' }) }, 'Decline')))
      : null,
    options.length === 0 && isPermission
      ? h('div', { style: style.row },
        h('button', { type: 'button', style: style.button, disabled, onClick: () => onRespond(request, { outcome: 'cancelled' }) }, 'Decline'))
      : null,
    h('details', { style: style.details },
      h('summary', { style: style.summary }, 'Request details'),
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
  const [status, setStatus] = useState('Disconnected')
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
  const streamRef = useRef(null)
  const historyLoadedRef = useRef(false)
  const lastDraftRef = useRef('')
  const authWindowRef = useRef(null)
  const eventsRef = useRef(null)
  const prevScrollHeightRef = useRef(null)
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
        setStatus('Waiting for approval')
      } else {
        setStatus('Approve access, then paste the callback URL')
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
          setStatus('MonkeyAI account connected')
        } else if (result.status === 'failed') {
          setError(result.error || 'Automatic authorization failed; paste the callback URL instead.')
          setStatus('Automatic authorization failed')
        } else {
          setStatus('Authorization request expired')
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
    setStatus('MonkeyAI account connected')
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
      setStatus('Authorization link copied')
    } catch {
      setStatus('Copy failed - select the link text manually')
    }
  }

  async function loadDevices() {
    if (!accountId) return
    setError('')
    setLoading(true)
    try {
      const result = await unwrap(api.listDevices({ accountId, page: 1 }))
      setDevices(result.items)
      const first = result.items.length > 0 ? result.items[0].machineId : ''
      setMachineId(first)
      setSummarySessions([])
      setRuntimeSessions([])
      setSessionId('')
      streamRef.current?.dispose()
      streamRef.current = null
      setStatus(result.items.length > 0 ? `${result.items.length} device(s) found` : 'No devices registered')
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
    streamRef.current?.dispose()
    streamRef.current = null
    setFrames([])
    setPendingRequests([])
    const results = await Promise.allSettled([
      unwrap(api.listSessions({ accountId, machineId: mid, page: 1, pageSize: 50 })),
      unwrap(api.listRuntimeSessions({ accountId, machineId: mid })),
    ])
    const errors = []
    if (results[0].status === 'fulfilled') setSummarySessions(results[0].value.items)
    else errors.push(`Summary index: ${errorText(results[0].reason)}`)
    if (results[1].status === 'fulfilled') setRuntimeSessions(results[1].value.sessions)
    else errors.push(`ACP session list: ${errorText(results[1].reason)}`)
    setStatus(errors.length === 0 ? 'Sessions refreshed' : 'Some session sources are unavailable')
    setError(errors.join('\n'))
    setLoading(false)
  }

  async function openSession(session) {
    streamRef.current?.dispose()
    streamRef.current = null
    historyLoadedRef.current = false
    setSessionId(session.id)
    setFrames([])
    setPendingRequests([])
    setLastDelivery(undefined)
    setTurnActive(false)
    setStopping(false)
    setError('')
    setAnswerText('')
    setCurrentModel('')
    setVisibleCount(RECENT_LIMIT)
    setHistoryLoading(true)
    setStatus('Connecting to remote session')
    try {
      const stream = api.followSession({ accountId, machineId, sessionId: session.id, cwd: session.cwd })
      streamRef.current = stream
      setStatus('Remote session connected')
      for await (const frame of stream) {
        setFrames(current => [...current, frame])
        if (frame.type === 'ready' && !historyLoadedRef.current) setStatus('Replaying session history')
        if (frame.type === 'reconnecting') setStatus(frame.message || 'Reconnecting to remote runtime')
        if (frame.type === 'history_loaded') {
          historyLoadedRef.current = true
          setStatus('History loaded')
          setHistoryLoading(false)
          if (frame.model) setCurrentModel(frame.model)
        }
        if (frame.type === 'history_incomplete') {
          setStatus('History incomplete: ' + (frame.message || 'replay was cut off'))
          setHistoryLoading(false)
        }
        if (frame.type === 'model_switched') {
          if (frame.data?.model) setCurrentModel(frame.data.model)
          setSwitchingModel(false)
          setStatus('Model switched')
        }
        if (frame.type === 'model_switch_failed') {
          setSwitchingModel(false)
          setError(frame.message || 'Model switch was rejected')
          setStatus('Model switch failed')
        }
        if (frame.type === 'session_missing') {
          setError(frame.message || 'This session no longer exists on the selected device.')
          setStatus('Session not found on device')
          setHistoryLoading(false)
        }
        if (frame.type === 'request') {
          setPendingRequests(current => [...current.filter(item => item.requestId !== frame.requestId), frame])
        }
        if (frame.type === 'delivery') {
          const accepted = Boolean(frame.data?.accepted)
          setLastDelivery({ accepted, code: frame.data?.code, frame: frame.type })
          setTurnActive(false)
          setStopping(false)
          if (accepted) {
            const cancelled = frame.data?.result?.stopReason === 'cancelled'
            setStatus(cancelled ? 'Turn stopped' : 'Turn completed')
          } else {
            setPrompt(current => current === '' ? (lastDraftRef.current || '') : current)
            setStatus('MonkeyAI did not accept the instruction; draft preserved')
            if (frame.message) setError(frame.message)
          }
        }
        if (frame.type === 'cancel_sent') {
          setStopping(false)
          setStatus('Stop requested - waiting for the runtime to cancel')
        }
        if (frame.type === 'response_sent') {
          setPendingRequests(current => current.filter(item => item.requestId !== frame.requestId))
        }
        if (frame.type === 'response_error') {
          setError(`Remote response was rejected: ${frame.code || 'unknown'}`)
        }
        if (frame.type === 'error') setError(frame.message || frame.code || 'Remote session error')
      }
      setStatus('Remote session disconnected')
      setHistoryLoading(false)
      setTurnActive(false)
      setStopping(false)
    } catch (reason) {
      setStatus('Remote session unavailable')
      setError(errorText(reason))
      setHistoryLoading(false)
      setTurnActive(false)
      setStopping(false)
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
      setStatus('Instruction sent - MonkeyAI is working')
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
      setStatus('Stopping…')
    } catch (reason) {
      setError(errorText(reason))
    }
  }

  function respond(request, result) {
    if (!hasControl) {
      setError('MonkeyAI response requires session:control permission')
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
      setStatus('Disconnected')
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
    setStatus(`Added device ${entry.displayName}`)
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
        return [{ id: created.sessionId, title: created.title || 'New remote session', cwd: created.cwd }, ...current]
      })
      setSummarySessions(current => current.filter(item => item.id !== created.sessionId))
      setStatus('Session created')
      await openSession({ id: created.sessionId, title: created.title || 'New remote session', cwd: created.cwd })
    } catch (reason) {
      setError(errorText(reason))
      setStatus('Could not create a remote session')
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
      setStatus('Switching model…')
    } catch (reason) {
      setError(errorText(reason))
      setStatus('Model switch failed')
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
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
        h(MonkeyIcon, { size: 22 }),
        h('h1', { style: style.title }, 'MonkeyAI Sessions')),
      h(StatusBadge, { status, live: isLive })),
    error ? h('div', { role: 'alert', style: style.error },
      h('span', { style: { flex: 1 } }, error),
      h('button', {
        type: 'button', 'aria-label': 'Dismiss error', onClick: () => setError(''),
        style: { border: 0, background: 'transparent', cursor: 'pointer', color: t.danger, fontWeight: 700, padding: '0 2px', fontSize: 13 },
      }, '×')) : null,
    showConnectCard ? h('section', { style: style.card },
      addingServer && !authorizing ? h('div', { style: style.row },
        h('h2', { style: { ...style.sectionTitle, flex: 1 } }, 'Add MonkeyAI server'),
        h('button', { type: 'button', style: style.button, onClick: () => { setAddingServer(false); setServerAddress(currentAccount?.serverOrigin || ''); setStatus('MonkeyAI account connected') } }, 'Cancel')) : null,
      authorizing ? h(React.Fragment, null,
        h('div', { style: style.row },
          h('h2', { style: { ...style.sectionTitle, flex: 1 } }, addingServer ? 'Authorizing a new server' : 'Waiting for authorization'),
          addingServer ? h('button', { type: 'button', style: style.button, onClick: () => { setAuthorizationRequestId(''); setAuthorizationUrl(''); setAuthorizationMode(''); setCallbackUrl(''); setAddingServer(false); setStatus('MonkeyAI account connected') } }, 'Cancel') : null),
        h('ol', { style: { margin: 0, paddingLeft: 18, display: 'grid', gap: 6, fontSize: 12.5, color: t.text2 } },
          h('li', null, 'Open the authorization page and approve access in MonkeyAI.',
            h('span', { style: style.row, title: authorizationUrl },
              h('a', { href: authorizationUrl, target: '_blank', rel: 'noopener noreferrer', style: { color: t.accent, fontWeight: 600, fontSize: 12 } }, 'Open page'),
              h('button', { type: 'button', style: style.button, onClick: copyAuthorizationUrl }, copied ? 'Copied' : 'Copy link'))),
          authorizationMode === 'loopback'
            ? h('li', null, 'Approve in the browser - this panel completes automatically. If the browser cannot return to DSH, copy the callback URL below.')
            : h('li', null, 'After approving, the browser shows the monkeyai-desktop:// callback - copy its full address-bar URL and paste it below.')),
        h('details', { style: style.details },
          h('summary', { style: style.summary }, 'Automatic completion did not finish? Paste the callback'),
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
            h('button', { type: 'button', style: style.primaryButton, disabled: loading || !callbackUrl, onClick: completeAuthorization }, 'Complete authorization'))))
      : h(React.Fragment, null,
        h('h2', { style: style.sectionTitle }, 'Connect MonkeyAI'),
        h(Field, { labelText: 'MonkeyAI server origin' },
          h('input', {
            type: 'url',
            value: serverAddress,
            placeholder: 'https://monkeyai.example.com',
            style: style.input,
            onChange: event => setServerAddress(event.target.value),
          })),
        h('div', { style: { display: 'grid', gap: 8 } },
          h('button', { type: 'button', style: style.primaryButton, disabled: loading || !serverAddress, onClick: () => beginAuthorization('loopback') }, 'Connect MonkeyAI'),
          h('details', { style: style.details },
            h('summary', { style: style.summary }, 'Automatic callback rejected? Use paste mode'),
            h('div', { style: { display: 'grid', gap: 8, paddingTop: 8 } },
              h('button', { type: 'button', style: style.button, disabled: loading || !serverAddress, onClick: () => beginAuthorization('scheme') }, 'Authorize (paste callback)'),
              h('p', { style: { margin: 0, fontSize: 12, color: t.text3 } }, 'After approving, copy the monkeyai-desktop:// callback URL from the browser address bar and paste it here.')))),
        accounts.length > 0 ? h('p', { style: { margin: 0, fontSize: 12, color: t.text3 } }, 'Connected accounts appear in the account selector above the device list.') : null))
      : null,
    currentAccount ? h('section', { style: style.card },
      h('div', { style: style.row },
        h('h2', { style: { ...style.sectionTitle, flex: 1 } }, 'Remote sessions'),
        h('span', { style: { fontSize: 11, color: t.text3 } }, currentAccount.scopes.filter(s => s !== 'device:connect').join(' · '))),
      h('div', { style: style.row },
        h('select', { style: { ...style.input, flex: '1 1 200px' }, value: accountId, onChange: event => setAccountId(event.target.value), 'aria-label': 'Authorized account' },
          accounts.map(account => h('option', { key: account.accountId, value: account.accountId }, account.serverOrigin))),
        h('button', { type: 'button', style: { ...style.button, flex: '0 0 auto', padding: '6px 10px', fontWeight: 700 }, disabled: loading || addingServer, onClick: () => { setAddingServer(true); setServerAddress(''); setAuthorizationRequestId(''); setAuthorizationUrl(''); setAuthorizationMode(''); setCallbackUrl(''); setStatus('Enter a MonkeyAI server origin') }, title: 'Authorize an additional MonkeyAI server' }, '+ Add server'),
        h('select', { style: { ...style.input, flex: '1 1 220px' }, value: machineId, onChange: event => {
          const next = event.target.value
          setMachineId(next)
          if (next) void loadSessions(next)
        }, 'aria-label': 'Remote device' },
          h('option', { value: '' }, 'Select a device'),
          allDevices.map(device => h('option', { key: device.machineId, value: device.machineId }, `${device.displayName}${device.status === 'online' ? '' : ` · ${device.status}`}${device.stale ? ' · stale' : ''}`))),
        h('button', { type: 'button', style: style.button, disabled: loading, onClick: machineId ? () => loadSessions() : loadDevices, title: machineId ? 'Refresh sessions' : 'Refresh devices' }, 'Refresh'),
        h('button', { type: 'button', style: style.dangerButton, disabled: !accountId, onClick: disconnectAccount, title: 'Revoke this account authorization' }, 'Disconnect')),
      !hasRead ? h('p', { style: { margin: 0, fontSize: 12, color: t.text3 } }, 'session:read is required to list and read remote sessions.') : null,
      manualDevices.length > 0
        ? h('div', { style: style.row },
          manualDevices.map(device => h('span', { key: device.machineId, style: style.chip },
            device.displayName,
            h('button', {
              type: 'button', style: { border: 0, background: 'transparent', cursor: 'pointer', padding: 0, color: t.danger, fontWeight: 700, fontSize: 12 },
              'aria-label': `Remove ${device.displayName}`,
              onClick: () => removeManualDevice(device.machineId),
            }, '×'))))
        : null,
      h('details', { style: style.details },
        h('summary', { style: style.summary }, 'Device missing? Add it by machine ID'),
        h('div', { style: { display: 'grid', gap: 8, paddingTop: 8 } },
          h('div', { style: style.row },
            h('input', {
              style: { ...style.input, flex: '2 1 200px' },
              value: manualDeviceId,
              placeholder: 'Machine ID, e.g. 6f1c2a34-... or headless-host-01',
              onChange: event => setManualDeviceId(event.target.value),
            }),
            h('input', {
              style: { ...style.input, flex: '1 1 140px' },
              value: manualDeviceName,
              placeholder: 'Display name (optional)',
              onChange: event => setManualDeviceName(event.target.value),
            }),
            h('button', { type: 'button', style: style.button, disabled: !manualDeviceId.trim(), onClick: addManualDevice }, 'Add')))),
      h('details', { style: style.details },
        h('summary', { style: style.summary }, 'New remote session'),
        h('div', { style: { display: 'grid', gap: 8, paddingTop: 8 } },
          h('div', { style: style.row },
            h('input', {
              style: { ...style.input, flex: '2 1 200px' },
              value: newSessionCwd,
              placeholder: 'Working directory, e.g. /root',
              onChange: event => setNewSessionCwd(event.target.value),
            }),
            h('select', {
              style: { ...style.input, flex: '1 1 160px' },
              value: selectedModel,
              disabled: models.length === 0,
              onChange: event => setSelectedModel(event.target.value),
              'aria-label': 'Model for the new session',
            }, models.map(m => h('option', { key: m.id, value: m.id }, m.displayName))),
            h('button', {
              type: 'button', style: style.primaryButton, flex: '0 0 auto',
              disabled: loading || !machineId || !newSessionCwd.trim() || newSessionBusy,
              onClick: createRemoteSession,
            }, newSessionBusy ? 'Creating...' : 'Create')))),
      sessionOptions.length > 0
        ? h('div', { style: style.sessions }, sessionOptions.map(session => {
            const flag = session.stale ? 'stale' : session.deviceStatus && session.deviceStatus !== 'online' ? session.deviceStatus : ''
            return h('button', {
              style: { ...style.session, ...(session.id === sessionId ? style.selected : {}) },
              className: 'mai-card-hover',
              key: session.id,
              type: 'button',
              disabled: !session.cwd,
              onClick: () => openSession(session),
              title: session.cwd ? `Open ${session.cwd}` : 'ACP session list did not provide a working directory',
            },
              h('span', { style: style.sessionTitle }, session.title || session.id),
              h('span', { style: style.sessionMeta }, session.cwd || 'History requires a working directory from the runtime'),
              flag !== '' ? h('span', { style: { fontSize: 10.5, fontWeight: 650, color: session.stale ? t.text3 : '#8a6d1d', textTransform: 'uppercase', letterSpacing: '0.04em' } }, flag) : null)
          }))
        : h('p', { style: style.subtitle }, machineId ? 'No sessions on this device yet. Create one above or refresh.' : 'Select a device to list its sessions.'))
      : null,
    sessionId ? h('section', { style: style.card },
      h('div', { style: style.row },
        h('button', {
          type: 'button', style: { ...style.button, flexShrink: 0 }, title: 'Close session and go back to the list',
          onClick: () => { streamRef.current?.dispose(); streamRef.current = null; setSessionId(''); setTurnActive(false); setStopping(false); setStatus('Remote session closed') },
        }, '←'),
        h('strong', { style: { flex: 1, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, title }, title),
        h('select', {
          style: { ...style.input, flex: '0 1 190px', minWidth: 130 },
          value: currentModel,
          disabled: !hasControl || switchingModel || models.length === 0,
          title: 'Switch model for this session',
          onChange: event => {
            const next = event.target.value
            if (next && next !== currentModel) switchSessionModel(next)
          },
        },
          currentModel && !models.some(m => m.id === currentModel)
            ? h('option', { value: currentModel }, currentModel.slice(0, 24))
            : null,
          models.map(m => h('option', { key: m.id, value: m.id }, `${m.displayName} (${Math.round(m.contextWindowTokens / 1000)}k)`)))),
      h('div', { style: style.events, 'aria-live': 'polite', 'data-events': '', ref: eventsRef,
          onScroll: event => {
            const el = event.currentTarget
            if (el.scrollTop < 60 && visibleCount < displayEntries.length) {
              prevScrollHeightRef.current = el.scrollHeight
              setVisibleCount(count => Math.min(count + 100, displayEntries.length))
            }
          } },
        historyLoading
          ? h('div', { style: { fontSize: 12.5, color: t.text3, textAlign: 'center', padding: '32px 12px' } },
              displayEntries.length > 0 ? `Loading session history… (${displayEntries.length} entries loaded)` : 'Loading session history…')
          : h(React.Fragment, null,
              displayEntries.length > visibleCount
                ? h('div', { style: { fontSize: 11, color: t.text3, textAlign: 'center', padding: '6px 0' } }, `${displayEntries.length - visibleCount} earlier messages — scroll up to load more`)
                : null,
              displayEntries.slice(-visibleCount).map(entry => {
        if (entry.kind === 'thought') {
          return h('div', { style: { display: 'flex', gap: 8, alignItems: 'flex-start', justifyContent: 'flex-start' }, key: entry.key },
            h('div', { style: { ...style.avatar, background: '#8a5fd0' } }, '···'),
            h('details', { style: style.thought },
              h('summary', { style: style.thoughtSummary }, 'Thinking'),
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
            isUser ? h('div', { style: { ...style.avatar, background: avatarColor } }, 'You') : null)
        }
        if (entry.kind === 'tool') {
          const statusLabel = entry.status ? (TOOL_STATUS_LABEL[entry.status] ?? entry.status) : 'running'
          const running = entry.status !== 'completed' && entry.status !== 'failed' && entry.status !== 'cancelled'
          const statusColor = entry.status === 'completed' ? '#2f7d54' : entry.status === 'failed' ? t.danger : '#8a6d1d'
          const statusBg = entry.status === 'completed' ? '#e9f5ee' : entry.status === 'failed' ? t.dangerBg : '#fdf6e3'
          return h('details', { style: { ...style.event, padding: '6px 11px', background: t.surface }, key: entry.key },
            h('summary', { style: { ...style.row, cursor: 'pointer', userSelect: 'none', listStyle: 'none' } },
              h('span', { style: { fontSize: 10, fontWeight: 700, color: t.text3, textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 } }, 'Tool'),
              h('span', { style: { fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 } }, entry.title || 'Working'),
              running ? h('span', { className: 'mai-pulse', style: { ...style.dot, width: 6, height: 6, background: '#d4a72c' } }) : null,
              h('span', { style: { fontSize: 10.5, padding: '1px 8px', borderRadius: 999, background: statusBg, color: statusColor, fontWeight: 650, flexShrink: 0 } }, statusLabel)),
            entry.detail ? h('pre', { style: { margin: '6px 0 0', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 11.5, maxHeight: 320, overflowY: 'auto', background: t.surfaceAlt, borderRadius: 6, padding: '8px 10px' } }, entry.detail) : null)
        }
        if (entry.kind === 'plan') {
          return h('article', { style: style.event, key: entry.key },
            h('div', { style: { fontSize: 10.5, fontWeight: 700, color: t.text3, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.04em' } }, 'Plan'),
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
            h('summary', { style: style.summary }, 'Show details'),
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
          placeholder: hasControl ? 'Send an instruction to the remote session (Enter to send, Shift+Enter for a new line)' : 'Read-only: session:control is required to send instructions',
          disabled: !hasControl,
        }),
        turnActive
          ? h('button', {
              type: 'button', style: style.stopButton, disabled: !hasControl || stopping,
              onClick: stopTurn, title: stopping ? 'Stopping…' : 'Stop the current turn',
              'aria-label': 'Stop the current turn',
            },
              h('span', { style: style.stopIcon }))
          : h('button', {
              type: 'submit', style: style.sendButton,
              disabled: !streamRef.current || !hasControl || prompt.trim() === '',
              title: 'Send (Enter)', 'aria-label': 'Send instruction',
            },
              h('svg', { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true', style: { display: 'block' } },
                h('path', { d: 'M8 12.5V3.5M8 3.5L4 7.5M8 3.5L12 7.5', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' })))),
      lastDelivery || turnActive ? h('div', { style: { fontSize: 11.5, color: turnActive ? t.accent : lastDelivery?.accepted ? t.success : lastDelivery?.frame === 'pending' ? t.text3 : t.danger, textAlign: 'right', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 } },
        turnActive ? h('span', { className: 'mai-pulse', style: { ...style.dot, background: t.accent } }) : null,
        turnActive ? (stopping ? 'Stopping the current turn…' : 'MonkeyAI is working…') : lastDelivery?.accepted ? 'Turn finished' : lastDelivery?.frame === 'pending' ? 'Delivery pending' : 'Delivery rejected') : null)
      : null)
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
        'aria-label': 'MonkeyAI sessions',
        title: 'MonkeyAI Sessions',
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
