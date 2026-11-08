import { createTypertRemoteInfo } from '@deepseek-ai/dsh-typert-protocol/remote-info'
import { z } from 'zod'

export const PACKAGE_NAME = 'dsh-monkeyai-sessions'
export const SERVICE_KEY = 'monkeyaiSessions'

const codec = (name, schema) => ({
  mode: 'strict',
  typeSymbol: `${PACKAGE_NAME}#${name}`,
  create: () => schema,
})

const parameter = (name, schema, typeName) => {
  const valueCodec = codec(typeName, schema)
  return { name, source: 'json', codec: valueCodec, strictCodec: valueCodec }
}

const Account = z.object({
  accountId: z.string(),
  serverOrigin: z.string(),
  scopes: z.array(z.string()),
  expiresAt: z.number(),
}).strict()

const Device = z.object({
  machineId: z.string(),
  displayName: z.string(),
  platform: z.string(),
  arch: z.string(),
  status: z.string(),
  stale: z.boolean(),
}).strict()

const SessionSummary = z.object({
  id: z.string(),
  machineId: z.string(),
  title: z.string(),
  sessionType: z.string(),
  startedAt: z.string(),
  lastActiveAt: z.string().nullable(),
  deviceStatus: z.string(),
  stale: z.boolean(),
}).strict()

const RuntimeSession = z.object({
  id: z.string(),
  title: z.string(),
  cwd: z.string(),
}).strict()

const Model = z.object({
  id: z.string(),
  displayName: z.string(),
  model: z.string(),
  kind: z.string(),
  contextWindowTokens: z.number().int().nonnegative(),
  supportsVision: z.boolean().optional(),
}).strict()

const AccountRequest = z.object({ accountId: z.string() }).strict()
const DeviceRequest = z.object({ accountId: z.string(), page: z.number().int().positive().optional() }).strict()
const SessionRequest = z.object({
  accountId: z.string(),
  machineId: z.string(),
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().max(100).optional(),
}).strict()
const FollowRequest = z.object({
  accountId: z.string(),
  machineId: z.string(),
  sessionId: z.string(),
  cwd: z.string(),
}).strict()

export const RemoteCommand = z.discriminatedUnion('type', [
  z.object({ type: z.literal('prompt'), text: z.string().min(1).max(65536) }).strict(),
  z.object({ type: z.literal('switch_model'), model: z.string().min(1).max(512) }).strict(),
  z.object({
    type: z.literal('respond'),
    requestId: z.union([z.string(), z.number()]),
    result: z.unknown(),
  }).strict(),
  z.object({ type: z.literal('cancel') }).strict(),
])

export const RemoteFrame = z.object({
  type: z.string().min(1),
  sessionId: z.string().optional(),
  requestId: z.union([z.string(), z.number()]).optional(),
  method: z.string().optional(),
  data: z.unknown().optional(),
  code: z.string().optional(),
  message: z.string().optional(),
}).passthrough()

const input = (name, schema, typeName) => parameter(name, schema, typeName)
const output = (typeName, schema) => codec(typeName, schema)

const methods = {
  [`${SERVICE_KEY}/listAccounts`]: {
    service: SERVICE_KEY,
    invocation: { kind: 'direct' },
    parameters: [],
    result: output('AccountList', z.array(Account)),
  },
  [`${SERVICE_KEY}/beginAuthorization`]: {
    service: SERVICE_KEY,
    invocation: { kind: 'direct' },
    parameters: [input('request', z.object({
      serverAddress: z.string().min(1).max(2048),
      callbackMode: z.union([z.literal('scheme'), z.literal('loopback')]).optional(),
    }).strict(), 'BeginAuthorizationRequest')],
    result: output('AuthorizationStart', z.object({
      requestId: z.string(),
      serverOrigin: z.string(),
      authorizationUrl: z.string(),
      redirectUri: z.string(),
      expiresAt: z.number(),
    }).strict()),
  },
  [`${SERVICE_KEY}/signIn`]: {
    service: SERVICE_KEY,
    invocation: { kind: 'direct' },
    parameters: [input('request', z.object({
      serverAddress: z.string().min(1).max(2048),
      email: z.string().min(1).max(320),
      password: z.string().min(1).max(1024),
    }).strict(), 'SignInRequest')],
    result: output('Account', Account),
  },
  [`${SERVICE_KEY}/authorizationStatus`]: {
    service: SERVICE_KEY,
    invocation: { kind: 'direct' },
    parameters: [input('request', AccountRequest, 'AuthorizationStatusRequest')],
    result: output('AuthorizationStatus', z.object({
      status: z.enum(['pending', 'completed', 'failed', 'expired']),
      account: Account.optional(),
      error: z.string().optional(),
      expiresAt: z.number().optional(),
    }).strict()),
  },
  [`${SERVICE_KEY}/createSession`]: {
    service: SERVICE_KEY,
    invocation: { kind: 'direct' },
    parameters: [input('request', z.object({
      accountId: z.string(),
      machineId: z.string().min(1).max(256),
      cwd: z.string().min(1).max(4096),
      model: z.string().min(1).max(512).optional(),
    }).strict(), 'CreateSessionRequest')],
    result: output('CreatedSession', z.object({
      sessionId: z.string(),
      cwd: z.string(),
      title: z.string().optional(),
      model: z.string().optional(),
    }).strict()),
  },
  [`${SERVICE_KEY}/completeAuthorization`]: {
    service: SERVICE_KEY,
    invocation: { kind: 'direct' },
    parameters: [input('request', z.object({
      requestId: z.string(),
      callbackUrl: z.string().min(1).max(8192),
    }).strict(), 'CompleteAuthorizationRequest')],
    result: output('Account', Account),
  },
  [`${SERVICE_KEY}/disconnect`]: {
    service: SERVICE_KEY,
    invocation: { kind: 'direct' },
    parameters: [input('request', AccountRequest, 'AccountRequest')],
    result: output('DisconnectResult', z.object({ disconnected: z.boolean() }).strict()),
  },
  [`${SERVICE_KEY}/listDevices`]: {
    service: SERVICE_KEY,
    invocation: { kind: 'direct' },
    parameters: [input('request', DeviceRequest, 'DeviceRequest')],
    result: output('DeviceList', z.object({ items: z.array(Device), total: z.number().int().nonnegative() }).strict()),
  },
  [`${SERVICE_KEY}/listSessions`]: {
    service: SERVICE_KEY,
    invocation: { kind: 'direct' },
    parameters: [input('request', SessionRequest, 'SessionRequest')],
    result: output('SessionList', z.object({
      items: z.array(SessionSummary),
      page: z.number().int().positive(),
      pageSize: z.number().int().positive(),
      total: z.number().int().nonnegative(),
      serverTime: z.string(),
    }).strict()),
  },
  [`${SERVICE_KEY}/listRuntimeSessions`]: {
    service: SERVICE_KEY,
    invocation: { kind: 'direct' },
    parameters: [input('request', AccountRequest.extend({ machineId: z.string() }).strict(), 'RuntimeSessionListRequest')],
    result: output('RuntimeSessionList', z.object({ sessions: z.array(RuntimeSession) }).strict()),
  },
  [`${SERVICE_KEY}/listModels`]: {
    service: SERVICE_KEY,
    invocation: { kind: 'direct' },
    parameters: [input('request', AccountRequest, 'ModelListRequest')],
    result: output('ModelList', z.object({ models: z.array(Model) }).strict()),
  },
  [`${SERVICE_KEY}/switchModel`]: {
    service: SERVICE_KEY,
    invocation: { kind: 'direct' },
    parameters: [input('request', z.object({
      accountId: z.string(),
      machineId: z.string().min(1).max(256),
      sessionId: z.string().min(1).max(256),
      model: z.string().min(1).max(512),
    }).strict(), 'SwitchModelRequest')],
    result: output('SwitchModelResult', z.object({
      switched: z.boolean(),
      model: z.string().optional(),
      message: z.string().optional(),
    }).strict()),
  },
  [`${SERVICE_KEY}/followSession`]: {
    service: SERVICE_KEY,
    invocation: { kind: 'direct' },
    mode: 'stream',
    parameters: [input('request', FollowRequest, 'FollowSessionRequest')],
    uplink: { codec: codec('RemoteCommand', RemoteCommand) },
    cancellation: { parameter: 'signal' },
    result: output('RemoteFrame', RemoteFrame),
  },
}

export const TYPERT_REMOTE = createTypertRemoteInfo({ package: PACKAGE_NAME, methods }, z)
export default TYPERT_REMOTE
