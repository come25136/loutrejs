# Loutreをはじめる

このガイドでは、小さなHTTP Applicationを作り、portableなKernel Hostからテストし、Node.jsへ接続します。

## プロジェクトを作成する

```sh
npm create loutre@latest my-app
cd my-app
```

TargetにはNode.js、Bun、Deno、Cloudflare Workers、AWS Lambdaを選べます。

## HTTP executionを定義する

HTTP semanticsはHTTP Extensionに置き、生成されたExecution DefinitionをModuleへ登録します。

`src/greetings/contract.ts`:

```ts
import { http } from '@loutrejs/loutre/http'
import { z } from 'zod'

export const GreetingContract = http.contract({
  greet: {
    method: 'GET',
    path: '/greetings/{name}',
    request: {
      params: {
        name: z.string().min(1),
      },
    },
    responses: {
      ok: {
        status: 200,
        body: z.object({ message: z.string() }),
      },
    },
  },
})
```

`src/greetings/service.ts`:

```ts
export class GreetingService {
  greet(name: string) {
    return { message: `こんにちは、${name}！` }
  }
}
```

`src/greetings/controller.ts`:

```ts
import { inject } from '@loutrejs/loutre'
import { http } from '@loutrejs/loutre/http'
import { GreetingContract } from './contract.js'
import { GreetingService } from './service.js'

export const GreetingHttp = http.implementation({
  name: 'GreetingHttp',
  contract: GreetingContract,
  factory: (greetings = inject(GreetingService)) => ({
    async greet(ctx) {
      return ctx.response.ok({
        body: greetings.greet(ctx.input.params.name),
      })
    },
  }),
})
```

`src/app.ts`:

```ts
import { defineApplication, defineModule } from '@loutrejs/loutre'
import { GreetingHttp } from './greetings/controller.js'
import { GreetingService } from './greetings/service.js'

const AppModule = defineModule(() => ({
  providers: [GreetingService],
  executions: [GreetingHttp],
}))

export default defineApplication({
  modules: [AppModule()],
})
```

`defineApplication()`がcanonical Application Modelを構築します。HTTP routeの詳細はHTTP Extensionが所有し、Coreはprotocol固有の分岐を持ちません。

## portable Kernel Hostからテストする

```ts
import { bootstrapApplication } from '@loutrejs/loutre'
import { bindHttpServer } from '@loutrejs/loutre/http'
import { expect, it } from 'vitest'
import application from './app.js'

it('挨拶を返す', async () => {
  const app = await bootstrapApplication({
    application,
    capabilities: [bindHttpServer({ runtime: 'test' })],
  })

  try {
    const response = await app.http.fetch(
      new Request('http://localhost/greetings/Loutre'),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      message: 'こんにちは、Loutre！',
    })
  } finally {
    await app.close('test-complete')
  }
})
```

`bootstrapApplication()`はKernelを初期化し、Application Modelに含まれるExtensionがcontributeしたHost APIだけを公開します。

## Node.jsへ接続する

`src/main.ts`:

```ts
import { nodeRuntime } from '@loutrejs/node'
import application from './app.js'

const app = await nodeRuntime.create({ application })
await app.serve({ port: 3000 })
```

```sh
npm run dev
curl http://localhost:3000/greetings/Loutre
```

```json
{ "message": "こんにちは、Loutre！" }
```

Application Definitionはportableなままです。platform固有のlistenerやcallback boundaryはRuntime adapterが所有します。

## Environmentを追加する

```ts
import { defineEnv, defineModule } from '@loutrejs/loutre'
import { z } from 'zod'

export class AppEnv extends defineEnv(
  z.object({ PORT: z.coerce.number().int().positive().default(3000) }),
) {}

const AppModule = defineModule(() => ({
  environment: [AppEnv],
  executions: [GreetingHttp],
}))
```

Application初期化後はvalidation済みの値を利用できます。

```ts
const app = await nodeRuntime.create({ application })
await app.serve({ port: app.get(AppEnv).PORT })
```

## TaskとTriggerを追加する

Task semanticsは`@loutrejs/loutre/tasks`が提供します。

```ts
import { defineApplication, defineModule } from '@loutrejs/loutre'
import { fixedDelay, task } from '@loutrejs/loutre/tasks'

export const cleanup = task<void, void>({
  name: 'cleanup',
  factory: () => async () => {
    console.log('cleanup')
  },
})

export const heartbeat = fixedDelay({
  name: 'heartbeat',
  delay: 5_000,
  immediate: true,
  task: cleanup,
})

const WorkerModule = defineModule(() => ({
  executions: [heartbeat],
}))

export default defineApplication({ modules: [WorkerModule()] })
```

Triggerだけを登録すれば十分です。Tasks Extensionが参照先Taskを宣言し、CoreがそのTaskをcanonical Application Modelへ自動で含めます。

Taskのmanual executionとTrigger起動はExtension-owned Host APIから行います。

```ts
import { bootstrapApplication } from '@loutrejs/loutre'
import application, { cleanup } from './app.js'

const app = await bootstrapApplication({ application })
await app.tasks.run(cleanup)
await app.tasks.start()
```

## Queue consumer

Queue descriptorとconsumerも`@loutrejs/loutre/tasks`から提供されます。BullMQのようなdriverは同じModuleのProviderとして宣言します。

```ts
import { defineModule } from '@loutrejs/loutre'
import { consume, queue, task } from '@loutrejs/loutre/tasks'
import { bindBullMqQueue } from '@loutrejs/bullmq'
import { z } from 'zod'

const orders = queue({
  name: 'orders',
  payload: z.object({ id: z.string() }),
})

const processOrder = task<{ id: string }, void>({
  name: 'orders.process',
  factory:
    () =>
    async ({ id }) =>
      console.log(id),
})

const orderConsumer = consume({
  name: 'orders.consumer',
  queue: orders,
  task: processOrder,
})

const QueueModule = defineModule(() => ({
  providers: [
    bindBullMqQueue(orders, {
      connection: { host: '127.0.0.1', port: 6379 },
    }),
  ],
  executions: [processOrder, orderConsumer],
}))
```

## Application Modelを確認する

```sh
npm exec loutre -- check --entry src/app.ts
npm exec loutre -- graph modules --entry src/app.ts
npm exec loutre -- graph di --entry src/app.ts --format mermaid
npm exec loutre -- graph executions --entry src/app.ts --format json
npm exec loutre -- doctor --entry src/app.ts --runtime node
```

CLIはRuntimeと同じcompile済みApplication Modelを読みます。別のGraph compilerを持ちません。

## OpenAPIを生成する

HTTP OpenAPI metadataはHTTP Extensionがprojectionします。

```sh
npm exec loutre -- openapi --entry src/app.ts --output openapi.json
```

KernelとExecution Extensionの境界は[Architecture](./architecture.md)を参照してください。
