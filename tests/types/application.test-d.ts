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
const calculate = entrypoint<number, number>({
  name: 'calculate',
  factory: () => async (input) => input + 1,
})
const processOrder = entrypoint<{ readonly id: string }, void>({
  name: 'orders.process',
  factory: () => async () => undefined,
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
// @ts-expect-error manual Entrypointが無いApplicationにはrunを公開しない
httpApplication.run
// @ts-expect-error listenはobject formのみを受け付ける
httpApplication.listen(3000)
// @ts-expect-error Triggerが無いApplicationにはtriggersを公開しない
httpApplication.triggers

const workerApplication = bootstrap(
  defineApplication({
    modules: [WorkerModule()],
    entrypoint: calculate,
    triggers: [nightly, poll, orderConsumer],
  }),
)
workerApplication.run(41)
workerApplication.triggers.start()
workerApplication.triggers.stop()
// @ts-expect-error Entrypoint inputはnumber
workerApplication.run('41')
// @ts-expect-error Applicationのmanual Entrypointはdescriptor引数を取らない
workerApplication.run(calculate, 41)
// @ts-expect-error HTTPが無いApplicationにはlistenを公開しない
workerApplication.listen
// @ts-expect-error HTTPが無いApplicationにはfetchを公開しない
workerApplication.fetch

const triggerOnlyApplication = bootstrap(
  defineApplication({
    modules: [WorkerModule()],
    triggers: [nightly, poll, orderConsumer],
  }),
)
// @ts-expect-error Triggerから参照されるEntrypointはmanual run rootではない
triggerOnlyApplication.run

const invocationApplication = createInvocationBinding(
  defineApplication({ modules: [HttpModule()] }),
).application
// @ts-expect-error callback runtimeにはlistenを公開しない
invocationApplication.listen
// @ts-expect-error callback runtimeにはtriggersを公開しない
invocationApplication.triggers
// @ts-expect-error manual Entrypointが無いcallback Applicationにはrunを公開しない
invocationApplication.run

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
