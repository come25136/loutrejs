import { defineApplication } from '@loutrejs/application'
import { bootstrap } from '@loutrejs/application/host'
import { createInvocationBinding } from '@loutrejs/application/binding'
import {
  consume,
  contract,
  cron,
  defineModule,
  entrypoint,
  fixedDelay,
  implementation,
  procedure,
  queue,
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

const HttpModule = defineModule(() => ({ implementations: [HealthHttp] }))
const ImportedHttpModule = defineModule(() => ({ imports: [HttpModule()] }))
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
const nightly = cron({
  name: 'maintenance.cleanup.nightly',
  expression: '0 3 * * *',
  timezone: 'Asia/Tokyo',
  entrypoint: cleanup,
})
const poll = fixedDelay({
  name: 'maintenance.poll',
  delay: 1_000,
  entrypoint: cleanup,
})
const orders = queue({
  name: 'orders',
  payload: z.object({ id: z.string() }),
})
const orderConsumer = consume({
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
// @ts-expect-error Triggerが無いApplicationにはtriggersを公開しない
httpApplication.triggers

const workerApplication = bootstrap(
  defineApplication({
    modules: [WorkerModule()],
    entrypoints: [cleanup],
    triggers: [nightly, poll, orderConsumer],
  }),
)
workerApplication.run(cleanup)
workerApplication.triggers.start()
workerApplication.triggers.stop()
// @ts-expect-error HTTPが無いApplicationにはlistenを公開しない
workerApplication.listen
// @ts-expect-error HTTPが無いApplicationにはfetchを公開しない
workerApplication.fetch
// @ts-expect-error Trigger専用Entrypointは明示run rootではない
workerApplication.run(processOrder, { id: 'order-1' })
// @ts-expect-error 未登録Entrypointは実行できない
workerApplication.run(unregistered, true)

const invocationApplication = createInvocationBinding(
  defineApplication({ modules: [HttpModule()] }),
).application
// @ts-expect-error callback runtimeにはlistenを公開しない
invocationApplication.listen
// @ts-expect-error callback runtimeにはtriggersを公開しない
invocationApplication.triggers

const wrongInput = entrypoint<string, void>({
  name: 'wrong.input',
  factory: () => () => undefined,
})
// @ts-expect-error Queue payloadとEntrypoint inputは一致させる
consume({ name: 'wrong.consumer', queue: orders, entrypoint: wrongInput })

const wrongTrigger = entrypoint<string, void>({
  name: 'wrong.trigger',
  factory: () => () => undefined,
})
// @ts-expect-error Cron Entrypointはvoid inputのみを受け付ける
cron({
  name: 'wrong.trigger',
  expression: '* * * * *',
  timezone: 'UTC',
  entrypoint: wrongTrigger,
})
