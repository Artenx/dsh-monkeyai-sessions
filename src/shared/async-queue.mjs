const utf8ByteLength = typeof Buffer !== 'undefined'
  ? serialized => Buffer.byteLength(serialized)
  : (() => { const encoder = new TextEncoder(); return serialized => encoder.encode(serialized).length })()

export class AsyncQueue {
  #values = []
  #waiters = []
  #producers = []
  #closed = false
  #closeReason
  #maxItems
  #maxBytes
  #bytes = 0
  #backpressure

  constructor({ maxItems = 256, maxBytes = 4 * 1024 * 1024, backpressure = false } = {}) {
    if (!Number.isSafeInteger(maxItems) || maxItems < 1) throw new TypeError('Queue maxItems must be a positive integer')
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new TypeError('Queue maxBytes must be a positive integer')
    this.#maxItems = maxItems
    this.#maxBytes = maxBytes
    this.#backpressure = backpressure
  }

  push(value) {
    if (this.#closed) return false
    let bytes
    try {
      const serialized = JSON.stringify(value)
      if (typeof serialized !== 'string') throw new TypeError()
      bytes = utf8ByteLength(serialized)
    } catch {
      this.close(new TypeError('Queue item must be JSON serializable'))
      return false
    }
    if (bytes > this.#maxBytes) {
      this.close(new Error('Queue capacity exceeded'))
      return false
    }
    const waiter = this.#waiters.shift()
    if (waiter) {
      waiter.resolve({ done: false, value })
      return true
    }
    if (this.#values.length >= this.#maxItems || this.#bytes + bytes > this.#maxBytes) {
      if (!this.#backpressure) {
        this.close(new Error('Queue capacity exceeded'))
        return false
      }
      // Backpressure mode: park the producer until the consumer drains a slot.
      return new Promise(resolve => {
        const producer = { producer: true, value, bytes, resolve }
        this.#producers.push(producer)
      })
    }
    this.#values.push({ value, bytes })
    this.#bytes += bytes
    return true
  }

  close(reason = undefined) {
    if (this.#closed) return
    this.#closed = true
    this.#closeReason = reason
    for (const waiter of this.#waiters.splice(0)) {
      if (reason) waiter.reject(reason)
      else waiter.resolve({ done: true, value: undefined })
    }
    for (const producer of this.#producers.splice(0)) producer.resolve(false)
  }

  #drainProducers() {
    while (this.#producers.length > 0
      && this.#values.length < this.#maxItems
      && this.#bytes + this.#producers[0].bytes <= this.#maxBytes) {
      const producer = this.#producers.shift()
      this.#values.push({ value: producer.value, bytes: producer.bytes })
      this.#bytes += producer.bytes
      producer.resolve(true)
    }
  }

  next({ signal } = {}) {
    if (this.#values.length > 0) {
      const item = this.#values.shift()
      this.#bytes -= item.bytes
      this.#drainProducers()
      return Promise.resolve({ done: false, value: item.value })
    }
    if (this.#closed) {
      return this.#closeReason
        ? Promise.reject(this.#closeReason)
        : Promise.resolve({ done: true, value: undefined })
    }
    if (signal?.aborted) return Promise.reject(signal.reason ?? new Error('Queue read cancelled'))

    let waiter
    return new Promise((resolve, reject) => {
      waiter = { resolve, reject, signal, onAbort: undefined }
      if (signal) {
        waiter.onAbort = () => {
          const index = this.#waiters.indexOf(waiter)
          if (index >= 0) this.#waiters.splice(index, 1)
          reject(signal.reason ?? new Error('Queue read cancelled'))
        }
        signal.addEventListener('abort', waiter.onAbort, { once: true })
      }
      this.#waiters.push(waiter)
    }).finally(() => {
      if (signal && waiter) signal.removeEventListener('abort', waiter.onAbort)
    })
  }

  [Symbol.asyncIterator]() {
    return { next: () => this.next() }
  }
}
