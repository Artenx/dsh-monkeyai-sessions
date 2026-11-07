/**
 * Minimal, spec-compatible inlining of createTypertRemoteInfo from
 * `@deepseek-ai/dsh-typert-protocol/remote-info`. The DSH web client only
 * materializes modules listed in the bundle's `dsh.client.inject` table, and
 * subpath entries of that package are not seed words, so the factory is
 * vendored here to keep the client bundle self-contained.
 */

function optional(parameter) {
  return parameter.source === 'json' && parameter.acceptsUndefined === true
}

function createNamedInput(parameters, strict, zod) {
  const codecOf = parameter => (strict ? parameter.strictCodec : parameter.codec)
  let schema
  const create = () => {
    schema ??= zod.strictObject(Object.fromEntries(parameters.map(parameter => {
      const value = codecOf(parameter).create()
      return [parameter.wire, optional(parameter) ? value.optional() : value.nonoptional()]
    })))
    return schema
  }
  return { create }
}

export function createTypertRemoteInfo(spec, zod) {
  const descriptors = []
  const methods = Object.create(null)
  for (const [endpoint, definition] of Object.entries(spec.methods)) {
    const separator = endpoint.indexOf('/')
    const namespace = endpoint.slice(0, separator)
    const method = endpoint.slice(separator + 1)
    const parameters = definition.parameters.map(parameter => ({ ...parameter, wire: parameter.wire ?? parameter.name }))
    const descriptor = {
      ...definition,
      id: `${spec.package}#${endpoint}`,
      namespace,
      method,
      parameters,
      result: definition.result,
    }
    if (definition.invocation.kind === 'direct') {
      const inputs = []
      Object.assign(descriptor, {
        input(options) {
          const strict = options?.strict === true
          const slot = strict ? 1 : 0
          inputs[slot] ??= createNamedInput(parameters, strict, zod)
          return inputs[slot]
        },
        invoke(remote, input, signal) {
          const named = input ?? {}
          const values = parameters.map(parameter => named[parameter.wire])
          if (definition.cancellation !== undefined) values.push(signal)
          const receiver = Reflect.get(remote, namespace)
          const call = Reflect.get(receiver, method)
          return call.apply(receiver, values)
        },
      })
      methods[endpoint] = descriptor
    }
    descriptors.push(descriptor)
  }
  return { package: spec.package, descriptors, methods }
}
