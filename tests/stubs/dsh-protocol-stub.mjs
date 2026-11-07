export class TypertRemoteService {
  constructor(ctx, serviceKey) {
    this.ctx = ctx
    this.name = serviceKey
  }
}
export function credentialKey(pkg, id) {
  return `${pkg}:${id}`
}
export function credentialKeyId(key) {
  const idx = key.indexOf(':')
  return idx >= 0 ? key.slice(idx + 1) : key
}
export function credentialKeyScope(key) {
  const idx = key.indexOf(':')
  return idx >= 0 ? key.slice(0, idx) : ''
}
export function createTypertRemoteInfo(spec) {
  return {
    package: spec.package,
    descriptors: Object.keys(spec.methods).map(endpoint => ({ endpoint })),
    methods: {},
  }
}

function chainable() {
  const proxy = new Proxy(function chain() {}, {
    get(_target, property) {
      if (property === 'then') return undefined
      if (property === Symbol.toPrimitive) return () => 'zod-stub'
      return proxy
    },
    apply() {
      return proxy
    },
  })
  return proxy
}

export const z = new Proxy(function z() {}, {
  get(_target, property) {
    if (property === 'then') return undefined
    return chainable()
  },
  apply() {
    return chainable()
  },
})

