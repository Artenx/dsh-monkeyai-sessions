import assert from 'node:assert/strict'
import test from 'node:test'
import { AsyncQueue } from '../src/shared/async-queue.mjs'

test('AsyncQueue bounds buffered item count and delivers accepted items before overflow', async () => {
  const queue = new AsyncQueue({ maxItems: 2, maxBytes: 128 })
  assert.equal(queue.push({ seq: 1 }), true)
  assert.equal(queue.push({ seq: 2 }), true)
  assert.equal(queue.push({ seq: 3 }), false)
  assert.deepEqual(await queue.next(), { done: false, value: { seq: 1 } })
  assert.deepEqual(await queue.next(), { done: false, value: { seq: 2 } })
  await assert.rejects(queue.next(), /capacity exceeded/)
})

test('AsyncQueue bounds buffered bytes and cancels pending readers', async () => {
  const queue = new AsyncQueue({ maxItems: 2, maxBytes: 8 })
  assert.equal(queue.push('payload too large'), false)
  await assert.rejects(queue.next(), /capacity exceeded/)

  const waitingQueue = new AsyncQueue()
  const controller = new AbortController()
  const waiting = waitingQueue.next({ signal: controller.signal })
  controller.abort(new Error('cancelled'))
  await assert.rejects(waiting, /cancelled/)
  waitingQueue.close()
})
