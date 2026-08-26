import { defineApplication } from '@loutrejs/application'
import { bootstrap } from '@loutrejs/application/host'
import { createInvocationBinding } from '@loutrejs/application/binding'
import {
  consumer,
  contract,
  defineModule,
  entrypoint,
  implementation,
  procedure,
  queue,
  schedule,
} from '@loutrejs/core'
import { http } from '@loutrejs/http'
import { z } from 'zod'

const HealthContract = contract({
  get: procedure({
    protocols: {
      http: http({
        method: 'GET',
        path: '/health',
        responses: { ok: { status: 200, body: z.string() } },
        pipeline: [http.controller],
      }),
    },
  }),
})

const HealthHttp = implementation({
  name: 'HealthHttp',
  contract: HealthContract,
  protocol: http,
  factory: () => ({
    get: (context) => context.response.ok({ body: 'ok' }),
  }),
})

const HttpModule = defineModule(() => ({
  implementations: [HealthHttp],
}))
const ImportedHttpModule = defineModule(() => ({
  imports: [HttpModule()],
}))
const WorkerModule = defineModule(() => ({}))

const cleanup = entrypoint<void, void>({
  name: 'maintenance.cleanup',
  factory: () => async () => undefined,
})
const processOrder = entrypoint<{ readonly id: string }, void>({
  name: 'orders.process',
  factory: () => async () => undefined,
})
const unregistered = entrypoint<boolean, void>({
  name: 'unregistered',
  factory: () => () => undefined,
})
const nightly = schedule({
  name: 'maintenance.cleanup.nightly',
  cron: { expression: '0 3 * * *', timezone: 'Asia/Tokyo' },
  entrypoint: cleanup,
})
const orders = queue<{ readonly id: string }>({ name: 'orders' })
const orderConsumer = consumer({
  name: 'orders.process',
  queue: orders,
  entrypoint: processOrder,
})

const httpApplication = bootstrap(
  defineApplication({ modules: [ImportedHttpModule()] }),
)
httpApplication.listen({ port: 3000 })
httpApplication.fetch(new Request('http://localhost/health'))
// @ts-expect-error listenはobject formのみを受け付ける
httpApplication.listen(3000)
// @ts-expect-error Scheduleが無いApplicationにはschedulerを公開しない
httpApplication.scheduler
// @ts-expect-error Consumerが無いApplicationにはqueueを公開しない
httpApplication.queue

const workerApplication = bootstrap(
  defineApplication({
    modules: [WorkerModule()],
    entrypoints: [cleanup],
    schedules: [nightly],
    consumers: [orderConsumer],
  }),
)
workerApplication.run(cleanup)
workerApplication.run(processOrder, { id: 'order-1' })
workerApplication.scheduler.start()
workerApplication.queue.listen()
// @ts-expect-error HTTPが無いApplicationにはlistenを公開しない
workerApplication.listen
// @ts-expect-error HTTPが無いApplicationにはfetchを公開しない
workerApplication.fetch
// @ts-expect-error 未登録Entrypointは実行できない
workerApplication.run(unregistered, true)
// @ts-expect-error inputを持つEntrypointには引数が必要
workerApplication.run(processOrder)
// @ts-expect-error Entrypoint input型を一致させる
workerApplication.run(processOrder, { id: 1 })

const invocationApplication = createInvocationBinding(
  defineApplication({ modules: [HttpModule()] }),
).application
// @ts-expect-error callback runtimeにはlistenを公開しない
invocationApplication.listen
// @ts-expect-error callback runtimeにはschedulerを公開しない
invocationApplication.scheduler
// @ts-expect-error callback runtimeにはqueueを公開しない
invocationApplication.queue

const wrongInput = entrypoint<string, void>({
  name: 'wrong.input',
  factory: () => () => undefined,
})
// @ts-expect-error Queue payloadとEntrypoint inputは一致させる
consumer({ name: 'wrong.consumer', queue: orders, entrypoint: wrongInput })

const wrongSchedule = entrypoint<string, void>({
  name: 'wrong.schedule',
  factory: () => () => undefined,
})
// @ts-expect-error Schedule Entrypointはvoid inputのみを受け付ける
schedule({
  name: 'wrong.schedule',
  cron: { expression: '* * * * *', timezone: 'UTC' },
  entrypoint: wrongSchedule,
})
