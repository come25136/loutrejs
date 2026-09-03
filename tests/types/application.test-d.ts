import { binding, defineApplication } from '@loutrejs/loutre'
import { bootstrap } from '@loutrejs/loutre/host'
import {
  consume,
  contract,
  cron,
  defineEnv,
  defineArgs,
  defineModule,
  fixedDelay,
  defineImplementation,
  queue,
  task,
} from '@loutrejs/loutre'
import { http } from '@loutrejs/loutre/http'
import { bunRuntime } from '@loutrejs/loutre/runtime/bun'
import { denoRuntime } from '@loutrejs/loutre/runtime/deno'
import { nodeRuntime } from '@loutrejs/node'
import { z } from 'zod'
const HealthContract = contract([
  http({
    get: {
      method: 'GET',
      path: '/health',
      responses: { ok: { status: 200, body: z.string() } },
      pipeline: [http.controller],
    },
  }),
])
const HealthHttp = defineImplementation({
  name: 'HealthHttp',
  contract: HealthContract,
  protocol: http,
}).factory(() => ({
  get: (context) => context.response.ok({ body: 'ok' }),
}))
const HttpModule = defineModule(() => ({
  environment: [AppEnv],
  providers: [HealthService],
  implementations: [HealthHttp],
}))
const ImportedHttpModule = defineModule(() => ({ imports: [HttpModule()] }))
const WorkerModule = defineModule(() => ({}))
class AppEnv extends defineEnv(
  z.object({ PORT: z.coerce.number().default(3000) }).transform((env) => ({
    port: env.PORT,
  })),
) {}
class HealthService {}
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
const processOrder = task<
  {
    readonly id: string
  },
  void
>({
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
  delay: 1000,
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
httpApplication.fetch(new Request('http://localhost/health'))
nodeRuntime.create({ application: httpDefinition }).then((app) => {
  const env: AppEnv = app.get(AppEnv)
  const health: HealthService = app.get(HealthService)
  void env
  void health
  app.serve({ port: 3000 })
  app.serve({ shutdownHooks: false })
  app.serve({
    // @ts-expect-error startup presentationはFrameworkが所有し、customizeできない
    presentation: { version: '0.1.0' },
  })
})
bunRuntime.create({ application: httpDefinition }).then((app) => {
  app.serve({ shutdownHooks: false })
})
denoRuntime.create({ application: httpDefinition }).then((app) => {
  app.serve({ shutdownHooks: false })
})
// @ts-expect-error static serve APIは公開しない
nodeRuntime.serve
// @ts-expect-error static serve APIは公開しない
bunRuntime.serve
// @ts-expect-error static serve APIは公開しない
denoRuntime.serve
// @ts-expect-error public Taskが無いApplicationにはrunを公開しない
httpApplication.run
// @ts-expect-error listener ownershipはApplication hostではなくruntime adapterが持つ
httpApplication.listen
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
// @ts-expect-error HTTPが無いApplicationにはfetchを公開しない
workerApplication.fetch
nodeRuntime.create({
  // @ts-expect-error HTTPが無いApplicationはNode runtime server contextを生成できない
  application: workerDefinition,
  arguments: { instance: 'worker-1' },
})
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
const invocationBinding = binding.invocation({
  application: defineApplication({ modules: [HttpModule()] }),
})
invocationBinding.http
const invocationApplication = invocationBinding.application
// @ts-expect-error callback runtimeにはlistenを公開しない
invocationApplication.listen
// @ts-expect-error callback runtimeにはtriggersを公開しない
invocationApplication.triggers
// @ts-expect-error public Taskが無いcallback Applicationにはrunを公開しない
invocationApplication.run
const nonHttpInvocationBinding = binding.invocation({
  application: defineApplication({ modules: [WorkerModule()] }),
})
// @ts-expect-error HTTP capabilityが無いInvocation Bindingにはhttpを公開しない
nonHttpInvocationBinding.http
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
