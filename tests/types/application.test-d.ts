import {
  createKernelApplication,
  defineApplication,
  defineArgs,
  defineEnv,
  defineExecution,
  defineExecutionExtension,
  defineModule,
  type ExecutionDefinition,
} from '@loutrejs/loutre'
import { http } from '@loutrejs/loutre/http'
import { awsLambdaRuntime } from '@loutrejs/loutre/runtime/aws-lambda'
import { bunRuntime } from '@loutrejs/loutre/runtime/bun'
import { cloudflareWorkersRuntime } from '@loutrejs/loutre/runtime/cloudflare-workers'
import { denoRuntime } from '@loutrejs/loutre/runtime/deno'
import { electronRuntime } from '@loutrejs/loutre/runtime/electron'
import { nodeRuntime } from '@loutrejs/node'
import type { MessagePortHostApi } from '@loutrejs/loutre/message-port'
import { consume, cron, fixedDelay, queue, task } from '@loutrejs/loutre/tasks'
import { z } from 'zod'

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
    get: (context) => context.response.ok({ body: 'ok' }),
  }),
})
const HttpModule = defineModule(() => ({
  environment: [AppEnv],
  providers: [HealthService],
  executions: [HealthHttp],
}))
const ImportedHttpModule = defineModule(() => ({ imports: [HttpModule()] }))

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
  delay: 1000,
  task: cleanup,
})
const orders = queue({
  name: 'orders',
  payload: z.object({ id: z.string() }),
})
const orderConsumer = consume({
  name: 'orders.process.consumer',
  queue: orders,
  task: processOrder,
})
const WorkerModule = defineModule(() => ({
  executions: [calculate, nightly, poll, orderConsumer],
}))

const httpDefinition = defineApplication({ modules: [ImportedHttpModule()] })
const httpApplication = createKernelApplication({ application: httpDefinition })
httpApplication.http.fetch(new Request('http://localhost/health'))
// @ts-expect-error HTTP ApplicationにはTasks Host APIは無い
httpApplication.tasks

const workerDefinition = defineApplication({
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
// @ts-expect-error HTTP executionが無いApplicationにはhttpを公開しない
workerApplication.http
// @ts-expect-error required ArgumentsはKernel Application生成時に必要
createKernelApplication({ application: workerDefinition })

const defaultArgsDefinition = defineApplication({
  modules: [],
  arguments: DefaultArgs,
})
createKernelApplication({ application: defaultArgsDefinition })
createKernelApplication({ application: defaultArgsDefinition, arguments: {} })

nodeRuntime.create({ application: httpDefinition }).then((app) => {
  const env: AppEnv = app.get(AppEnv)
  const health: HealthService = app.get(HealthService)
  void env
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
const customHttpModule = defineModule(() => ({
  executions: [customHttpExecution],
}))
const customHttpDefinition = defineApplication({
  modules: [customHttpModule()],
})
nodeRuntime.create({
  // @ts-expect-error Node runtimeはnamespaceだけが同じcustom extensionを受け付けない
  application: customHttpDefinition,
})
bunRuntime.create({
  // @ts-expect-error Bun runtimeもHTTP Extension identityを要求する
  application: customHttpDefinition,
})
denoRuntime.create({
  // @ts-expect-error Deno runtimeもHTTP Extension identityを要求する
  application: customHttpDefinition,
})
cloudflareWorkersRuntime.bind({
  // @ts-expect-error Cloudflare Workers runtimeもHTTP Extension identityを要求する
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
        kind: 'message-port-result',
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
const customMessagePortModule = defineModule(() => ({
  executions: [customMessagePortExecution],
}))
const customMessagePortDefinition = defineApplication({
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
denoRuntime.create({ application: httpDefinition }).then((app) => {
  app.serve({ shutdownHooks: false })
})
nodeRuntime.create({
  // @ts-expect-error HTTP executionが無いApplicationはNode server runtimeへ渡せない
  application: workerDefinition,
  arguments: { instance: 'worker-1' },
})

// @ts-expect-error static serve APIは公開しない
nodeRuntime.serve
// @ts-expect-error static serve APIは公開しない
bunRuntime.serve
// @ts-expect-error static serve APIは公開しない
denoRuntime.serve

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
