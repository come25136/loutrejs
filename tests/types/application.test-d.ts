import {
  createKernelApplication,
  buildApplicationModel,
  application,
  args,
  env,
  defineExecution,
  defineExecutionExtension,
  module,
  type ExecutionDefinition,
} from '@loutrejs/loutre'
import { http } from '@loutrejs/loutre/http'
import { awsLambdaRuntime } from '@loutrejs/loutre/runtime/aws-lambda'
import { bunRuntime } from '@loutrejs/loutre/runtime/bun'
import { cloudflareWorkersRuntime } from '@loutrejs/loutre/runtime/cloudflare-workers'
import { electronRuntime } from '@loutrejs/loutre/runtime/electron'
import { nodeRuntime } from '@loutrejs/node'
import type { MessagePortHostApi } from '@loutrejs/loutre/message-port'
import { trigger, queue, task } from '@loutrejs/loutre/tasks'
import { z } from 'zod'
import type { RuntimeEngine } from '@loutrejs/loutre/runtime'
// @ts-expect-error 未生成Moduleを受け付ける互換用unionは公開しない。
import type { ModuleInput } from '@loutrejs/loutre'
// @ts-expect-error Moduleの暗黙生成helperは公開しない。
import { asModuleInstance } from '@loutrejs/loutre'

void asModuleInstance

// @ts-expect-error Denoは公開Runtime identityから削除した
const removedRuntime: RuntimeEngine = 'deno'
void removedRuntime

class AppEnv extends env(
  z.object({ PORT: z.coerce.number().default(3000) }).transform((values) => ({
    port: values.PORT,
  })),
) {}
class HealthService {}
class AppArgs extends args(
  z.object({ instance: z.string(), workers: z.number().default(4) }),
) {}
class DefaultArgs extends args(z.object({ workers: z.number().default(4) })) {}

const HealthContract = http.contract({
  get: {
    method: 'GET',
    path: '/health',
    responses: { ok: { status: 200, body: z.string() } },
  },
})
const HealthHttp = http.implementation({
  name: 'HealthHttp',
  contract: HealthContract,
  factory: () => ({
    get: () => ({ schema: HealthContract.get.ok, body: 'ok' }),
  }),
})
const HttpModule = module(() => ({
  environment: [AppEnv],
  providers: [HealthService],
  executions: [HealthHttp],
}))
const ImportedHttpModule = module(() => ({ imports: [HttpModule()] }))

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
const nightly = trigger.cron({
  name: 'maintenance.cleanup.nightly',
  expression: '0 3 * * *',
  timezone: 'Asia/Tokyo',
  task: cleanup,
})
const poll = trigger.fixedDelay({
  name: 'maintenance.poll',
  delay: 1000,
  task: cleanup,
})
const orders = queue({
  name: 'orders',
  payload: z.object({ id: z.string() }),
})
const orderConsumer = trigger.consume({
  name: 'orders.process.consumer',
  queue: orders,
  task: processOrder,
})
const WorkerModule = module(() => ({
  executions: [calculate, nightly, poll, orderConsumer],
}))

const httpDefinition = application({ modules: [ImportedHttpModule()] })
const httpApplication = createKernelApplication({ application: httpDefinition })
httpApplication.http.fetch(new Request('http://localhost/health'))
// @ts-expect-error HTTP ApplicationにはTasks Host APIは無い
httpApplication.tasks

const workerDefinition = application({
  modules: [WorkerModule()],
  arguments: AppArgs,
})
const workerApplication = createKernelApplication({
  application: workerDefinition,
  arguments: { instance: 'worker-1' },
})
workerApplication.tasks.run(calculate, 41)
workerApplication.tasks.start()
workerApplication.tasks.stop()
// @ts-expect-error Task inputはnumber
workerApplication.tasks.run(calculate, '41')
// @ts-expect-error HTTP executionが無いApplicationにhttpは公開しない
workerApplication.http
// @ts-expect-error required ArgumentsはKernel Application生成時に必要
createKernelApplication({ application: workerDefinition })

const defaultArgsDefinition = application({
  modules: [],
  arguments: DefaultArgs,
})
createKernelApplication({ application: defaultArgsDefinition })
createKernelApplication({ application: defaultArgsDefinition, arguments: {} })

nodeRuntime.create({ application: httpDefinition }).then((app) => {
  const appEnv: AppEnv = app.get(AppEnv)
  const health: HealthService = app.get(HealthService)
  void appEnv
  void health
  app.serve({ port: 3000 })
  app.serve({ shutdownHooks: false })
  app.serve({
    // @ts-expect-error startup presentationはFrameworkが所有する
    presentation: { version: '0.1.0' },
  })
})

interface CustomHttpHostApi {
  fetch(request: Request): Promise<Response>
}
const customHttpExtension = defineExecutionExtension<
  ExecutionDefinition,
  unknown,
  'http',
  CustomHttpHostApi
>({
  kind: 'execution-extension',
  name: 'custom:http',
  abiVersion: '1',
  compile: (_definition, context) => ({
    kind: 'execution',
    id: `custom-http:${context.definitionIndex}`,
    executionKind: 'custom-http',
    dependencies: [],
    capabilities: [],
    compiled: undefined,
  }),
  createRuntime: () => ({}),
  host: {
    namespace: 'http',
    create: () => ({ fetch: async () => new Response() }),
  },
})
const customHttpExecution = defineExecution(customHttpExtension, {})
const customHttpModule = module(() => ({
  executions: [customHttpExecution],
}))
const customHttpDefinition = application({
  modules: [customHttpModule()],
})
nodeRuntime.create({
  application: customHttpDefinition,
})
bunRuntime.create({
  application: customHttpDefinition,
})

cloudflareWorkersRuntime.bind({
  application: customHttpDefinition,
})
awsLambdaRuntime.bind({
  // @ts-expect-error AWS Lambda runtimeもHTTP Extension identityを要求する
  application: customHttpDefinition,
})

const customMessagePortExtension = defineExecutionExtension<
  ExecutionDefinition,
  unknown,
  'messagePort',
  MessagePortHostApi
>({
  kind: 'execution-extension',
  name: 'custom:message-port',
  abiVersion: '1',
  compile: (_definition, context) => ({
    kind: 'execution',
    id: `custom-message-port:${context.definitionIndex}`,
    executionKind: 'custom-message-port',
    dependencies: [],
    capabilities: [],
    compiled: undefined,
  }),
  createRuntime: () => ({}),
  host: {
    namespace: 'messagePort',
    create: () => ({
      invoke: async () => ({
        kind: 'unary',
        response: 'ok',
        value: undefined,
      }),
    }),
  },
})
const customMessagePortExecution = defineExecution(
  customMessagePortExtension,
  {},
)
const customMessagePortModule = module(() => ({
  executions: [customMessagePortExecution],
}))
const customMessagePortDefinition = application({
  modules: [customMessagePortModule()],
})
electronRuntime.attach({
  // @ts-expect-error Electron runtimeはnamespaceだけが同じcustom extensionを受け付けない
  application: customMessagePortDefinition,
  port: {
    postMessage: () => undefined,
    addEventListener: () => undefined,
  },
})
bunRuntime.create({ application: httpDefinition }).then((app) => {
  app.serve({ shutdownHooks: false })
})

nodeRuntime.create({
  application: workerDefinition,
  arguments: { instance: 'worker-1' },
})

// @ts-expect-error static serve APIは公開しない
nodeRuntime.serve
// @ts-expect-error static serve APIは公開しない
bunRuntime.serve
const wrongInput = task<string, void>({
  name: 'wrong.input',
  factory: () => () => undefined,
})
// @ts-expect-error Queue payloadとTask inputは一致させる
trigger.consume({ name: 'wrong.consumer', queue: orders, task: wrongInput })
const wrongTrigger = task<string, void>({
  name: 'wrong.trigger',
  factory: () => () => undefined,
})
// @ts-expect-error Cron Taskはvoid inputのみを受け付ける
trigger.cron({
  name: 'wrong.trigger',
  expression: '* * * * *',
  timezone: 'UTC',
  task: wrongTrigger,
})

const StaticHttpModule = module({ executions: [HealthHttp] })
const DynamicWorkerModule = module((name: string) => ({
  name,
  executions: [calculate],
}))
const StaticRootModule = module({
  imports: [StaticHttpModule, DynamicWorkerModule('Worker')],
})
const staticApp = createKernelApplication({
  application: application({ modules: [StaticRootModule] }),
})
staticApp.http.fetch(new Request('http://localhost/health'))
const taskResult: Promise<number> = staticApp.tasks.run(calculate, 1)
void taskResult
// @ts-expect-error 静的Moduleにインスタンス化の括弧は不要
StaticHttpModule()
// @ts-expect-error 動的Moduleの引数はstring
DynamicWorkerModule(123)
// @ts-expect-error 動的Moduleは引数を渡してからApplicationへ登録する
application({ modules: [DynamicWorkerModule] })
// @ts-expect-error 動的Moduleは引数を渡してからimportsへ登録する
module({ imports: [DynamicWorkerModule] })
const staticHttpApp = createKernelApplication({
  application: application({ modules: [StaticHttpModule] }),
})
staticHttpApp.http.fetch(new Request('http://localhost/health'))
// @ts-expect-error HTTPのみの静的ModuleにはTasks Host APIは無い
staticHttpApp.tasks
// @ts-expect-error 引数なしtemplateも生成してからApplicationへ登録する。
application({ modules: [HttpModule] })
// @ts-expect-error 引数なしtemplateも生成してからimportsへ登録する。
module({ imports: [HttpModule] })
// @ts-expect-error Modelも未生成templateを正規化しない。
buildApplicationModel({ modules: [HttpModule] })
nodeRuntime.create({
  application: workerDefinition,
  arguments: { instance: 'worker' },
  shutdownHooks: false,
})
