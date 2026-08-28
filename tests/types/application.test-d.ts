import { defineApplication } from '@loutrejs/application'
import { createInvocationBinding } from '@loutrejs/application/binding'
import { bootstrap } from '@loutrejs/application/host'
import {
  consume,
  contract,
  cron,
  defineArgs,
  defineModule,
  fixedDelay,
  implementation,
  procedure,
  queue,
  task,
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

class AppArgs extends defineArgs(
  z.object({ instance: z.string(), workers: z.number().default(4) }),
) {}
class DefaultArgs extends defineArgs(
  z.object({ workers: z.number().default(4) }),
) {}

const cleanup = task<void, void>({
  name: 'maintenance.cleanup',
  factory: () => async () => undefined,
})
const calculate = task<number, number>({
  name: 'calculate',
  factory: () => async (input) => input + 1,
})
const processOrder = task<{ readonly id: string }, void>({
  name: 'orders.process',
  factory: () => async () => undefined,
})
const nightly = cron({
  name: 'maintenance.cleanup.nightly',
  expression: '0 3 * * *',
  timezone: 'Asia/Tokyo',
  task: cleanup,
})
const poll = fixedDelay({
  name: 'maintenance.poll',
  delay: 1_000,
  task: cleanup,
})
const orders = queue({
  name: 'orders',
  payload: z.object({ id: z.string() }),
})
const orderConsumer = consume({
  name: 'orders.process',
  queue: orders,
  task: processOrder,
})

const httpDefinition = defineApplication({ modules: [ImportedHttpModule()] })
const httpApplication = bootstrap({ application: httpDefinition })
httpApplication.listen({ port: 3000 })
httpApplication.fetch(new Request('http://localhost/health'))
// @ts-expect-error public Taskが無いApplicationにはrunを公開しない
httpApplication.run
// @ts-expect-error listenはobject formのみを受け付ける
httpApplication.listen(3000)
// @ts-expect-error Triggerが無いApplicationにはtriggersを公開しない
httpApplication.triggers
// @ts-expect-error Arguments Contractが無いApplicationにargumentsは渡せない
bootstrap({ application: httpDefinition, arguments: {} })

const workerDefinition = defineApplication({
  modules: [WorkerModule()],
  arguments: AppArgs,
  tasks: [calculate],
  triggers: [nightly, poll, orderConsumer],
})
const workerApplication = bootstrap({
  application: workerDefinition,
  arguments: { instance: 'worker-1' },
})
workerApplication.run(calculate, 41)
workerApplication.triggers.start()
workerApplication.triggers.stop()
// @ts-expect-error Task inputはnumber
workerApplication.run(calculate, '41')
// @ts-expect-error Trigger-only Taskはpublic run surfaceに含めない
workerApplication.run(cleanup)
// @ts-expect-error HTTPが無いApplicationにはlistenを公開しない
workerApplication.listen
// @ts-expect-error HTTPが無いApplicationにはfetchを公開しない
workerApplication.fetch
// @ts-expect-error required Argumentsはbootstrap時に必要
bootstrap({ application: workerDefinition })

const defaultArgsDefinition = defineApplication({
  modules: [WorkerModule()],
  arguments: DefaultArgs,
})
bootstrap({ application: defaultArgsDefinition })
bootstrap({ application: defaultArgsDefinition, arguments: {} })

const triggerOnlyApplication = bootstrap({
  application: defineApplication({
    modules: [WorkerModule()],
    triggers: [nightly, poll, orderConsumer],
  }),
})
// @ts-expect-error Triggerから参照されるTaskはmanual run rootではない
triggerOnlyApplication.run

const invocationApplication = createInvocationBinding({
  application: defineApplication({ modules: [HttpModule()] }),
}).application
// @ts-expect-error callback runtimeにはlistenを公開しない
invocationApplication.listen
// @ts-expect-error callback runtimeにはtriggersを公開しない
invocationApplication.triggers
// @ts-expect-error public Taskが無いcallback Applicationにはrunを公開しない
invocationApplication.run

const wrongInput = task<string, void>({
  name: 'wrong.input',
  factory: () => () => undefined,
})
// @ts-expect-error Queue payloadとTask inputは一致させる
consume({ name: 'wrong.consumer', queue: orders, task: wrongInput })

const wrongTrigger = task<string, void>({
  name: 'wrong.trigger',
  factory: () => () => undefined,
})
// @ts-expect-error Cron Taskはvoid inputのみを受け付ける
cron({
  name: 'wrong.trigger',
  expression: '* * * * *',
  timezone: 'UTC',
  task: wrongTrigger,
})
