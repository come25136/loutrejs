import assert from 'node:assert/strict'
import { defineApplication, defineModule, inject } from '@loutrejs/loutre'
import { Logger } from '@loutrejs/loutre/runtime'
import { task } from '@loutrejs/loutre/tasks'
import { bunRuntime } from '@loutrejs/loutre/runtime/bun'
import { nodeRuntime } from '@loutrejs/node'

const runtime = globalThis.Bun ? bunRuntime : nodeRuntime
const signals = ['SIGINT', 'SIGTERM']
const baseline = signals.map((signal) => process.listenerCount(signal))
const events = []
const started = Promise.withResolvers()
const execution = Promise.withResolvers()
const timeout = Promise.withResolvers()
const stopped = Promise.withResolvers()
const hangGuard = setTimeout(() => {
  throw new Error('signal後にWorkerのshutdownが完了しませんでした')
}, 5_000)

class Resource {
  destroyed = false
  keepAlive

  onModuleInit() {
    this.keepAlive = setInterval(() => {}, 1_000)
  }

  onModuleDestroy() {
    this.destroyed = true
    clearInterval(this.keepAlive)
    events.push('provider.destroy')
  }

  onApplicationShutdown(signal) {
    events.push(`provider.shutdown:${signal}`)
    stopped.resolve()
  }
}

const job = task({
  name: 'shutdown.worker',
  factory:
    (resource = inject(Resource)) =>
    async () => {
      started.resolve()
      await execution.promise
      assert.equal(resource.destroyed, false)
      events.push('execution.complete')
    },
})

const application = await runtime.create({
  application: defineApplication({
    modules: [defineModule({ providers: [Resource], executions: [job] })],
    logger: new Logger({
      write(record) {
        if (record.level !== 'error') return
        assert.equal(record.signal, 'SIGTERM')
        assert.equal(record.error.safeCleanupBoundaryReached, false)
        timeout.resolve()
      },
    }),
  }),
  forceShutdownTimeoutMs: 5,
})
const running = application.tasks.run(job)
await started.promise
process.kill(process.pid, 'SIGTERM')
await timeout.promise
assert.deepEqual(events, [])
assert.deepEqual(
  signals.map((signal) => process.listenerCount(signal)),
  baseline,
)
execution.resolve()
await running
await stopped.promise
assert.deepEqual(events, [
  'execution.complete',
  'provider.destroy',
  'provider.shutdown:SIGTERM',
])

clearTimeout(hangGuard)
console.log(`${runtime.runtime} worker signal shutdown conformance: passed`)
