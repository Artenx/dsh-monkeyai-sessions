import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import test from 'node:test'
import vm from 'node:vm'

const packageName = 'dsh-monkeyai-sessions'
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

async function loadRemoteDescriptors() {
  const lite = resolve(packageRoot, 'src/shared/remote-info-lite.mjs')
  const stub = resolve(packageRoot, 'tests/stubs/dsh-protocol-stub.mjs')
  const build = spawnSync('esbuild', [
    'src/remote.js',
    '--bundle',
    '--format=cjs',
    '--platform=node',
    `--alias:@deepseek-ai/dsh-typert-protocol/remote-info=${lite}`,
    `--alias:zod=${stub}`,
  ], { cwd: packageRoot, encoding: 'utf8' })
  if (build.error) throw build.error
  if (build.status !== 0) throw new Error(build.stderr || 'esbuild failed for src/remote.js')
  const outFile = resolve(packageRoot, 'tests/.remote-spec.loaded.cjs')
  await writeFile(outFile, build.stdout)
  return import(pathToFileURL(outFile).href)
}

function createSchemaStub() {
  let schema
  schema = new Proxy(() => schema, {
    get(_target, property) {
      if (property === 'then') return undefined
      return () => schema
    },
  })
  const z = {}
  for (const method of ['array', 'boolean', 'discriminatedUnion', 'enum', 'literal', 'number', 'object', 'string', 'union', 'unknown']) {
    z[method] = () => schema
  }
  return z
}

function createReactStub(initialState) {
  let stateIndex = 0
  const states = [...initialState]
  const refs = []
  const effectCleanups = []

  return {
    Fragment: Symbol.for('react.fragment'),
    createElement(type, props, ...children) {
      return { type, props: props ?? {}, children }
    },
    useEffect(effect) {
      const cleanup = effect()
      if (typeof cleanup === 'function') effectCleanups.push(cleanup)
    },
    useMemo(factory) {
      return factory()
    },
    useRef(value) {
      const ref = { current: value }
      refs.push(ref)
      return ref
    },
    useState(initialValue) {
      const index = stateIndex++
      if (index >= states.length) states.push(initialValue)
      return [states[index], value => {
        states[index] = typeof value === 'function' ? value(states[index]) : value
      }]
    },
    resetForRender() {
      stateIndex = 0
      effectCleanups.length = 0
    },
    getStates() {
      return [...states]
    },
    runEffectCleanups() {
      for (const cleanup of effectCleanups.splice(0)) {
        try { cleanup() } catch {}
      }
    },
    getEffectCleanup() {
      const cleanups = effectCleanups.splice(0)
      return async () => {
        for (const cleanup of cleanups) {
          try { await cleanup() } catch {}
        }
      }
    },
  }
}

async function loadClientPlugin(React) {
  const z = createSchemaStub()
  const source = await readFile(new URL('../client.js', import.meta.url), 'utf8')
  assert.ok(!source.includes('@deepseek-ai/dsh-typert-protocol'), 'bundle must inline the remote-info factory instead of requiring the protocol package')
  let plugin
  const require = specifier => {
    if (specifier === 'react') return React
    if (specifier === 'zod') return { z }
    throw new Error(`Unexpected client bundle dependency: ${specifier}`)
  }
  vm.runInNewContext(source, {
    window: {
      __ModuleLoader__: {
        load(definition) {
          plugin = { id: definition.id, exports: definition.factory(require) }
        },
      },
    },
    setTimeout,
    clearTimeout,
  })
  return plugin
}

test('Client bundle exposes unary DTOs and the duplex followSession contract', async () => {
  const client = await loadClientPlugin(createReactStub([]))
  const remote = await loadRemoteDescriptors()
  const info = remote.TYPERT_REMOTE
  const descriptors = new Map(info.descriptors.map(descriptor => [`${descriptor.namespace}/${descriptor.method}`, descriptor]))
  const unaryParameters = new Map([
    ['listAccounts', []],
    ['beginAuthorization', ['request']],
    ['authorizationStatus', ['request']],
    ['createSession', ['request']],
    ['completeAuthorization', ['request']],
    ['signIn', ['request']],
    ['disconnect', ['request']],
    ['listDevices', ['request']],
    ['listSessions', ['request']],
    ['listRuntimeSessions', ['request']],
    ['listModels', ['request']],
    ['switchModel', ['request']],
  ])

  assert.equal(client.id, packageName)
  assert.deepEqual(Array.from(client.exports.inject), ['slots', 'remote', 'layout'])
  assert.equal(info.package, packageName)
  assert.deepEqual(Array.from(descriptors.keys(), key => key).sort(), [
    'monkeyaiSessions/authorizationStatus',
    'monkeyaiSessions/beginAuthorization',
    'monkeyaiSessions/completeAuthorization',
    'monkeyaiSessions/createSession',
    'monkeyaiSessions/disconnect',
    'monkeyaiSessions/followSession',
    'monkeyaiSessions/listAccounts',
    'monkeyaiSessions/listDevices',
    'monkeyaiSessions/listModels',
    'monkeyaiSessions/listRuntimeSessions',
    'monkeyaiSessions/listSessions',
    'monkeyaiSessions/signIn',
    'monkeyaiSessions/switchModel',
  ])

  for (const [name, parameterNames] of unaryParameters) {
    const definition = descriptors.get(`monkeyaiSessions/${name}`)
    assert.equal(definition.service, 'monkeyaiSessions')
    assert.equal(definition.invocation.kind, 'direct')
    assert.equal(definition.mode, undefined)
    assert.equal(definition.uplink, undefined)
    assert.deepEqual(Array.from(definition.parameters, parameter => parameter.name), parameterNames)
    assert.equal(definition.result.mode, 'strict')
    assert.equal(typeof definition.result.create, 'function')
    for (const parameter of definition.parameters) {
      assert.equal(parameter.source, 'json')
      assert.equal(parameter.codec.mode, 'strict')
      assert.equal(parameter.strictCodec.mode, 'strict')
      assert.ok(parameter.codec.typeSymbol.startsWith(`${packageName}#`))
    }
  }

  const followSession = descriptors.get('monkeyaiSessions/followSession')
  assert.equal(followSession.invocation.kind, 'direct')
  assert.equal(followSession.mode, 'stream')
  assert.equal(followSession.cancellation.parameter, 'signal')
  assert.deepEqual(Array.from(followSession.parameters, parameter => parameter.name), ['request'])
  assert.equal(followSession.result.mode, 'strict')
  assert.equal(followSession.uplink.codec.typeSymbol, `${packageName}#RemoteCommand`)
  assert.equal(followSession.result.typeSymbol, `${packageName}#RemoteFrame`)
  assert.equal(typeof followSession.uplink.codec.create, 'function')
  assert.equal(typeof followSession.result.create, 'function')
})

function findOpenSessionButton(node) {
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findOpenSessionButton(child)
      if (match) return match
    }
    return undefined
  }
  if (!node || typeof node !== 'object') return undefined
  if (node.type === 'button' && node.props?.title?.startsWith('打开 ')) return node
  return findOpenSessionButton(node.children)
}

function findAriaLabel(node, label) {
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findAriaLabel(child, label)
      if (match) return match
    }
    return undefined
  }
  if (!node || typeof node !== 'object') return undefined
  if (node.props?.['aria-label'] === label) return node
  return findAriaLabel(node.children, label)
}

test('Client plugin releases its panel, active stream, and Remote mount on unload', async () => {
  const account = { accountId: 'account-1', serverOrigin: 'https://monkeyai.example', scopes: ['session:read'], expiresAt: 1 }
  const deviceId = '123e4567-e89b-12d3-a456-426614174000'
  const session = { id: 'session-1', title: 'Remote task', cwd: '/workspace/project' }
  const React = createReactStub([
    account.serverOrigin,
    '',
    '',
    '',
    '',
    [account],
    account.accountId,
    [],
    deviceId,
    [],
    [session],
    '',
    [],
    [],
    '',
    '{"action":"accept","content":{}}',
    'Connected',
    '',
    false,
  ])
  const remote = await loadRemoteDescriptors()
  const client = await loadClientPlugin(React)
  assert.equal(client.id, packageName)

  const entries = new Map()
  const slotDisposers = []
  const childDisposers = []
  const lifecycle = []
  let remoteDisposals = 0
  let streamDisposals = 0
  let mountedContribution
  let resolveNext
  let nextCount = 0
  let followCount = 0
  let stream

  const api = {
    listAccounts: async () => [account],
    listModels: async () => ({ models: [] }),
    followSession() {
      followCount += 1
      if (followCount === 1) {
        return {
          [Symbol.asyncIterator]() {
            return { next: () => Promise.reject(new Error('api gateway: Remote stream WebSocket failed')) }
          },
          dispose() { streamDisposals += 1 },
          send() {},
        }
      }
      stream = {
        [Symbol.asyncIterator]() {
          return {
            next: () => new Promise(resolve => { nextCount += 1; resolveNext = resolve }),
          }
        },
        dispose() {
          streamDisposals += 1
          resolveNext?.({ done: true })
        },
        send() {},
      }
      return stream
    },
  }

  const ctx = {
    plugin(pluginFactory) {
      let pluginCleanup
      const owner = {
        layout: { selectPanel() {} },
        remote: {
          async $mount(contribution) {
            mountedContribution = contribution
            lifecycle.push('remote-mounted')
            return async () => {
              remoteDisposals += 1
              lifecycle.push('remote-unmounted')
            }
          },
        },
        async inject(dependencies, callback) {
          assert.deepEqual(Array.from(dependencies), ['remote.monkeyaiSessions'])
          callback({ remote: { monkeyaiSessions: api } })
          childDisposers.push(async () => {
            for (const dispose of slotDisposers.reverse()) await dispose?.()
          })
        },
        slots: {
          inject(name, register) {
            assert.ok(name === 'main' || name === 'sidebar.panellist')
            slotDisposers.push(register())
          },
          register(config, component) {
            const entry = { config, component }
            const key = config.name === 'main' ? 'main' : config.id
            entries.set(key, entry)
            lifecycle.push(`slot-mounted:${config.name}`)
            return () => {
              entry.cleanup?.()
              entries.delete(key)
              lifecycle.push(`slot-unmounted:${config.name}`)
            }
          },
        },
      }
      const start = Promise.resolve().then(() => pluginFactory(owner)).then(disposer => {
        pluginCleanup = disposer
      })
      const fiber = {
        then(resolve, reject) {
          return start.then(() => resolve(), reject)
        },
        async dispose() {
          await start
          for (const dispose of childDisposers.reverse()) await dispose()
          await pluginCleanup?.()
        },
      }
      return fiber
    },
  }

  const disposePlugin = await client.exports.apply(ctx)
  assert.equal(mountedContribution.package, packageName)
  assert.deepEqual(
    Array.from(mountedContribution.descriptors, descriptor => descriptor.id).sort(),
    Array.from(remote.TYPERT_REMOTE.descriptors, descriptor => descriptor.id).sort(),
  )
  assert.equal(entries.get('main')?.config.key, 'monkeyai-sessions')
  assert.equal(entries.get('monkeyai-sessions')?.config.name, 'sidebar.panellist')
  assert.equal(entries.get('monkeyai-sessions')?.config.order, 45)

  const mainEntry = entries.get('main')
  React.resetForRender()
  const pageElement = mainEntry.component({ api })
  const pageTree = pageElement.type(pageElement.props)
  mainEntry.cleanup = React.getEffectCleanup()
  const initialCleanup = mainEntry.cleanup
  const openButton = findOpenSessionButton(pageTree)
  assert.ok(openButton)
  const runningSession = openButton.props.onClick()
  for (let i = 0; i < 150 && followCount < 2; i += 1) await new Promise(resolve => setTimeout(resolve, 10))
  assert.equal(followCount, 2, 'the session stream should reconnect after a carrier failure')
  assert.ok(stream)

  resolveNext({ done: false, value: { type: 'history_loaded' } })
  while (nextCount < 2) await new Promise(resolve => setImmediate(resolve))
  React.resetForRender()
  const loadedPage = mainEntry.component({ api })
  const loadedTree = loadedPage.type(loadedPage.props)
  const loadedCleanup = React.getEffectCleanup()
  mainEntry.cleanup = async () => {
    await loadedCleanup()
    await initialCleanup()
  }
  assert.ok(findAriaLabel(loadedTree, '会话状态：空闲'))

  resolveNext({ done: true })
  await runningSession
  assert.ok(React.getStates().includes('idle'))

  await disposePlugin()
  await mainEntry.cleanup()

  assert.equal(streamDisposals, 1)
  assert.equal(remoteDisposals, 1)
  assert.equal(entries.size, 0)
  assert.ok(lifecycle.indexOf('remote-unmounted') > lifecycle.indexOf('slot-unmounted:sidebar.panellist'))
})
