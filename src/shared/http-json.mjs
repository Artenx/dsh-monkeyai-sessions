import { normalizeServerOrigin } from './oauth-pkce.mjs'

const MAX_RESPONSE_BYTES = 1_048_576
const REQUEST_TIMEOUT_MS = 15_000

export class MonkeyAIHttpError extends Error {
  constructor(status, code = 'remote_request_failed') {
    super(`MonkeyAI request failed (${status}, ${code})`)
    this.name = 'MonkeyAIHttpError'
    this.status = status
    this.code = code
  }
}

export async function requestJson(serverAddress, path, {
  method = 'GET',
  accessToken,
  body,
  form,
  headers = {},
  signal,
  fetchImpl = globalThis.fetch,
} = {}) {
  const origin = normalizeServerOrigin(serverAddress)
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || path.includes('..')) {
    throw new TypeError('MonkeyAI API path is invalid')
  }
  if (typeof fetchImpl !== 'function') throw new Error('Fetch is unavailable in the DSH Host runtime')

  const url = new URL(path, origin)
  if (url.origin !== origin) throw new TypeError('MonkeyAI API request escaped the configured origin')

  const requestHeaders = new Headers(headers)
  requestHeaders.set('accept', 'application/json')
  if (accessToken) requestHeaders.set('authorization', `Bearer ${accessToken}`)
  let requestBody
  if (form !== undefined) {
    requestHeaders.set('content-type', 'application/x-www-form-urlencoded')
    requestBody = form.toString()
  } else if (body !== undefined) {
    requestHeaders.set('content-type', 'application/json')
    requestBody = JSON.stringify(body)
  }

  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout
  const response = await fetchImpl(url, {
    method,
    headers: requestHeaders,
    body: requestBody,
    redirect: 'error',
    signal: requestSignal,
  })
  const text = await readBoundedText(response)
  const data = text === '' ? null : parseJson(text)

  if (!response.ok) {
    const code = typeof data?.error === 'string' && /^[a-z0-9_]{1,64}$/.test(data.error)
      ? data.error
      : 'remote_request_failed'
    throw new MonkeyAIHttpError(response.status, code)
  }
  if (data === null) return null
  if (typeof data !== 'object' || Array.isArray(data)) throw new TypeError('MonkeyAI returned a non-object JSON response')
  return data
}

async function readBoundedText(response) {
  const contentLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
    throw new TypeError('MonkeyAI response exceeds the size limit')
  }
  if (!response.body) return ''

  const reader = response.body.getReader()
  const chunks = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel()
      throw new TypeError('MonkeyAI response exceeds the size limit')
    }
    chunks.push(value)
  }

  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}

function parseJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    throw new TypeError('MonkeyAI returned invalid JSON')
  }
}
