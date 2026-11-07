import { createHash, randomBytes } from 'node:crypto'

export const MONKEYAI_CLIENT_ID = 'monkeyai-desktop'
export const MONKEYAI_REDIRECT_URI = 'monkeyai-desktop://oauth/callback'
export const MONKEYAI_SCOPES = Object.freeze([
  'device:connect',
  'session:read',
  'session:control',
])

const AUTH_TTL_MS = 10 * 60 * 1000

export function normalizeServerOrigin(input) {
  if (typeof input !== 'string' || input.trim() === '') throw new TypeError('MonkeyAI server address is required')

  let url
  try {
    url = new URL(input.trim())
  } catch {
    throw new TypeError('MonkeyAI server address must be a valid HTTP(S) origin')
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new TypeError('MonkeyAI server address must use HTTP or HTTPS')
  }
  if (url.username || url.password || url.search || url.hash || (url.pathname !== '' && url.pathname !== '/')) {
    throw new TypeError('MonkeyAI server address must be a root origin without credentials or a path')
  }
  return url.origin
}

export const LOOPBACK_CALLBACK_HOSTS = Object.freeze(['127.0.0.1', 'localhost', '[::1]'])

export function createAuthorizationRequest(serverAddress, now = Date.now(), random = randomBytes, {
  callbackMode = 'scheme',
  loopbackPort,
} = {}) {
  const serverOrigin = normalizeServerOrigin(serverAddress)
  const state = random(32).toString('base64url')
  const verifier = random(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  const authorizationUrl = new URL('/oauth/authorize', serverOrigin)

  let redirectUri = MONKEYAI_REDIRECT_URI
  if (callbackMode === 'loopback') {
    const port = Number.isInteger(loopbackPort) && loopbackPort >= 1 && loopbackPort <= 65535
      ? loopbackPort
      : 0
    if (!port) throw new TypeError('Loopback callback port is required')
    redirectUri = `http://127.0.0.1:${port}/oauth/callback`
  }

  authorizationUrl.searchParams.set('response_type', 'code')
  authorizationUrl.searchParams.set('client_id', MONKEYAI_CLIENT_ID)
  authorizationUrl.searchParams.set('redirect_uri', redirectUri)
  authorizationUrl.searchParams.set('scope', MONKEYAI_SCOPES.join(' '))
  authorizationUrl.searchParams.set('state', state)
  authorizationUrl.searchParams.set('code_challenge', challenge)
  authorizationUrl.searchParams.set('code_challenge_method', 'S256')

  return {
    serverOrigin,
    callbackMode,
    redirectUri,
    loopbackPort: callbackMode === 'loopback' ? Number(new URL(redirectUri).port) : undefined,
    state,
    verifier,
    authorizationUrl: authorizationUrl.toString(),
    expiresAt: now + AUTH_TTL_MS,
  }
}

export function parseAuthorizationCallback(callbackAddress, pending, now = Date.now()) {
  if (!pending || typeof pending !== 'object') throw new TypeError('Authorization request is unavailable')
  if (!Number.isFinite(pending.expiresAt) || now >= pending.expiresAt) throw new Error('Authorization request expired')

  let callback
  try {
    callback = new URL(callbackAddress)
  } catch {
    throw new TypeError('Paste the complete MonkeyAI OAuth callback URL')
  }

  if (pending.callbackMode === 'loopback') {
    if (callback.protocol !== 'http:'
      || !LOOPBACK_CALLBACK_HOSTS.includes(callback.hostname)
      || callback.pathname !== '/oauth/callback'
      || String(callback.port) !== String(pending.loopbackPort)) {
      throw new TypeError('Callback URL does not match the loopback redirect for this authorization request')
    }
  } else if (callback.protocol !== 'monkeyai-desktop:' || callback.hostname !== 'oauth' || callback.port !== '' || callback.pathname !== '/callback') {
    throw new TypeError('Callback URL does not match the registered MonkeyAI desktop redirect')
  }
  if (callback.username || callback.password || callback.hash) throw new TypeError('Callback URL contains unsupported fields')
  if (callback.searchParams.getAll('state').length !== 1 || callback.searchParams.getAll('code').length !== 1) {
    throw new TypeError('Callback URL must contain one state and one authorization code')
  }

  const state = callback.searchParams.get('state')
  const code = callback.searchParams.get('code')
  if (!state || state !== pending.state) throw new Error('OAuth state verification failed')
  if (!code || code.length > 4096 || /[\s\u0000-\u001f\u007f]/.test(code)) {
    throw new TypeError('Authorization code is invalid')
  }

  return { code, verifier: pending.verifier }
}

export function createTokenForm({ code, verifier, redirectUri = MONKEYAI_REDIRECT_URI }) {
  return new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: MONKEYAI_CLIENT_ID,
    redirect_uri: redirectUri,
    code,
    code_verifier: verifier,
  })
}

export function createRefreshForm(refreshToken) {
  if (typeof refreshToken !== 'string' || refreshToken === '') throw new TypeError('Refresh token is required')
  return new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: MONKEYAI_CLIENT_ID,
    refresh_token: refreshToken,
  })
}

export function normalizeTokenResponse(value, now = Date.now(), previous = undefined) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('OAuth token response is invalid')
  if (typeof value.access_token !== 'string' || value.access_token.length < 16) throw new TypeError('OAuth response has no valid access token')
  if (value.token_type !== undefined && String(value.token_type).toLowerCase() !== 'bearer') throw new TypeError('OAuth token type is unsupported')
  const expiresIn = Number(value.expires_in)
  if (!Number.isFinite(expiresIn) || expiresIn <= 0 || expiresIn > 31_536_000) throw new TypeError('OAuth expiry is invalid')

  const refreshToken = typeof value.refresh_token === 'string' && value.refresh_token !== ''
    ? value.refresh_token
    : previous?.refreshToken
  if (!refreshToken) throw new TypeError('OAuth response has no refresh token')

  const scope = typeof value.scope === 'string'
    ? value.scope.split(/\s+/).filter(Boolean)
    : previous?.scopes ?? []
  const scopes = [...new Set(scope)].sort()

  return {
    accessToken: value.access_token,
    refreshToken,
    expiresAt: now + Math.floor(expiresIn * 1000),
    scopes,
    grantId: typeof value.grant_id === 'string' && value.grant_id !== '' ? value.grant_id : undefined,
  }
}
