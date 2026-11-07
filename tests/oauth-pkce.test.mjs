import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import {
  createAuthorizationRequest,
  createRefreshForm,
  createTokenForm,
  normalizeServerOrigin,
  normalizeTokenResponse,
  parseAuthorizationCallback,
} from '../src/shared/oauth-pkce.mjs'

test('authorization request uses PKCE S256 and the registered MonkeyAI client', () => {
  const randomSizes = []
  const request = createAuthorizationRequest('https://ai.example.test', 1_000, size => {
    randomSizes.push(size)
    return Buffer.alloc(size, randomSizes.length)
  })
  const url = new URL(request.authorizationUrl)

  assert.equal(url.origin, 'https://ai.example.test')
  assert.equal(url.pathname, '/oauth/authorize')
  assert.equal(url.searchParams.get('response_type'), 'code')
  assert.equal(url.searchParams.get('client_id'), 'monkeyai-desktop')
  assert.equal(url.searchParams.get('redirect_uri'), 'monkeyai-desktop://oauth/callback')
  assert.equal(url.searchParams.get('scope'), 'device:connect session:read session:control')
  assert.match(request.state, /^[A-Za-z0-9_-]{43}$/)
  assert.match(request.verifier, /^[A-Za-z0-9_-]{43}$/)
  assert.notEqual(request.state, request.verifier)
  assert.deepEqual(randomSizes, [32, 32])
  assert.equal(
    url.searchParams.get('code_challenge'),
    createHash('sha256').update(request.verifier).digest('base64url'),
  )
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256')
  assert.equal(url.searchParams.get('state'), request.state)
  assert.equal(url.searchParams.has('code_verifier'), false)
  assert.equal(request.authorizationUrl.includes(request.verifier), false)
  assert.equal(request.expiresAt, 601_000)
})

test('loopback authorization requests pin the port and parse the http callback', () => {
  const request = createAuthorizationRequest('https://ai.example.test', 1_000, randomBytesSize => Buffer.alloc(randomBytesSize, 7), { callbackMode: 'loopback', loopbackPort: 49152 })
  const url = new URL(request.authorizationUrl)

  assert.equal(request.callbackMode, 'loopback')
  assert.equal(request.loopbackPort, 49152)
  assert.equal(request.redirectUri, 'http://127.0.0.1:49152/oauth/callback')
  assert.equal(url.searchParams.get('redirect_uri'), 'http://127.0.0.1:49152/oauth/callback')
  assert.throws(() => createAuthorizationRequest('https://ai.example.test', 1_000, undefined, { callbackMode: 'loopback' }), /port/)

  const pending = request
  const callback = 'http://127.0.0.1:49152/oauth/callback?code=auth-code&state=' + encodeURIComponent(request.state)
  assert.deepEqual(parseAuthorizationCallback(callback, pending, 9_999), { code: 'auth-code', verifier: request.verifier })
  assert.throws(() => parseAuthorizationCallback(
    'http://127.0.0.1:49153/oauth/callback?code=auth-code&state=' + request.state,
    pending,
    9_999,
  ), /loopback redirect/)
  assert.throws(() => parseAuthorizationCallback(
    'http://10.0.0.5:49152/oauth/callback?code=auth-code&state=' + request.state,
    pending,
    9_999,
  ), /loopback redirect/)
  assert.throws(() => parseAuthorizationCallback(
    'monkeyai-desktop://oauth/callback?code=auth-code&state=' + request.state,
    pending,
    9_999,
  ), /loopback redirect/)
})

test('server origin rejects paths, embedded credentials, and query; plain HTTP is allowed', () => {
  assert.equal(normalizeServerOrigin('http://127.0.0.1:8080/'), 'http://127.0.0.1:8080')
  assert.equal(normalizeServerOrigin('http://192.168.1.10:3000'), 'http://192.168.1.10:3000')
  assert.equal(normalizeServerOrigin('https://example.test'), 'https://example.test')
  assert.throws(() => normalizeServerOrigin('ftp://example.test'), /HTTP or HTTPS/)
  assert.throws(() => normalizeServerOrigin('https://user:pass@example.test'), /root origin/)
  assert.throws(() => normalizeServerOrigin('https://example.test/api'), /root origin/)
  assert.throws(() => normalizeServerOrigin('https://example.test/?token=value'), /root origin/)
})

test('callback parser accepts only the matching state and registered redirect', () => {
  const pending = {
    state: 'expected-state',
    verifier: 'verifier-value',
    expiresAt: 10_000,
  }
  const callback = 'monkeyai-desktop://oauth/callback?code=auth-code&state=expected-state'

  assert.deepEqual(parseAuthorizationCallback(callback, pending, 9_999), {
    code: 'auth-code',
    verifier: 'verifier-value',
  })
  assert.throws(() => parseAuthorizationCallback(
    'monkeyai-desktop://oauth/callback?code=auth-code&state=wrong',
    pending,
    9_999,
  ), /state verification/)
  assert.throws(() => parseAuthorizationCallback(
    'https://example.test/callback?code=auth-code&state=expected-state',
    pending,
    9_999,
  ), /registered MonkeyAI/)
  assert.throws(() => parseAuthorizationCallback(callback, pending, 10_000), /expired/)
})

test('token requests use form encoding and token records preserve refresh credentials', () => {
  assert.deepEqual(Object.fromEntries(createTokenForm({ code: 'c', verifier: 'v' })), {
    grant_type: 'authorization_code',
    client_id: 'monkeyai-desktop',
    redirect_uri: 'monkeyai-desktop://oauth/callback',
    code: 'c',
    code_verifier: 'v',
  })
  assert.equal(createRefreshForm('refresh').get('grant_type'), 'refresh_token')
  assert.deepEqual(normalizeTokenResponse({
    access_token: 'access-token-value-12345',
    refresh_token: 'refresh-token',
    token_type: 'Bearer',
    expires_in: 60,
    scope: 'session:read device:connect',
  }, 2_000), {
    accessToken: 'access-token-value-12345',
    refreshToken: 'refresh-token',
    expiresAt: 62_000,
    scopes: ['device:connect', 'session:read'],
    grantId: undefined,
  })
  assert.equal(normalizeTokenResponse({
    access_token: 'access-token-value-12345',
    refresh_token: 'refresh-token',
    token_type: 'Bearer',
    expires_in: 60,
    scope: 'session:read',
    grant_id: 'grant-abc-123',
  }, 2_000).grantId, 'grant-abc-123')
})
