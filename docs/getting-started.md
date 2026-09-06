# Start Loutre

This guide creates a small HTTP Application, tests it through the portable Kernel host, and connects it to Node.js.

## Create a project

```sh
npm create loutre@latest my-app
cd my-app
```

You can also choose Bun, Deno, Cloudflare Workers, or AWS Lambda as the target.

## Define an HTTP execution

Keep HTTP semantics in the HTTP Extension and register the resulting execution in a Module.

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
    return { message: `Hello, ${name}!` }
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

`defineApplication()` builds the canonical Application Model. HTTP route details remain owned by the HTTP Extension; Core stores the execution contribution without protocol-specific branching.

## Test through the portable Kernel host

```ts
import { bootstrapApplication } from '@loutrejs/loutre'
import { bindHttpServer } from '@loutrejs/loutre/http'
import { expect, it } from 'vitest'
import application from './app.js'

it('returns a greeting', async () => {
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
      message: 'Hello, Loutre!',
    })
  } finally {
    await app.close('test-complete')
  }
})
```

`bootstrapApplication()` initializes the Kernel and exposes only Host APIs contributed by the Extensions present in the Application Model.

## Connect to Node.js

`src/main.ts`:

```ts
import { nodeRuntime } from '@loutrejs/node'
import application from './app.js'

const app = await nodeRuntime.create({ application })
await app.serve({ port: 3000 })
```

Run the server and send a request:

```sh
npm run dev
curl http://localhost:3000/greetings/Loutre
```

```json
{ "message": "Hello, Loutre!" }
```

The Application Definition remains portable. Runtime adapters own platform-specific listener and callback boundaries.

## Add Environment

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

Node.js can then use the validated value after Application initialization:

```ts
const app = await nodeRuntime.create({ application })
await app.serve({ port: app.get(AppEnv).PORT })
```

## Add a Task and Trigger

Task semantics are provided by `@loutrejs/tasks`.

```ts
import { defineApplication, defineModule } from '@loutrejs/loutre'
import { fixedDelay, task } from '@loutrejs/tasks'

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
  executions: [cleanup, heartbeat],
}))

export default defineApplication({ modules: [WorkerModule()] })
```

Run a Task manually or start Trigger execution through the Extension-owned Host API:

```ts
import { bootstrapApplication } from '@loutrejs/loutre'
import application, { cleanup } from './app.js'

const app = await bootstrapApplication({ application })
await app.tasks.run(cleanup)
await app.tasks.triggers.start()
```

## Queue consumers

Queue descriptors and consumers also come from `@loutrejs/tasks`. Drivers such as BullMQ are ordinary Providers declared in the same Module that owns the execution.

```ts
import { defineModule } from '@loutrejs/loutre'
import { consume, queue, task } from '@loutrejs/tasks'
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

## Inspect the Application Model

```sh
npm exec loutre -- check --entry src/app.ts
npm exec loutre -- graph modules --entry src/app.ts
npm exec loutre -- graph di --entry src/app.ts --format mermaid
npm exec loutre -- graph executions --entry src/app.ts --format json
npm exec loutre -- doctor --entry src/app.ts --runtime node
```

The CLI loads the same compiled Application Model used by Runtime. It does not maintain a second graph compiler.

## Generate OpenAPI

HTTP OpenAPI metadata is projected by the HTTP Extension:

```sh
npm exec loutre -- openapi --entry src/app.ts --output openapi.json
```

See [Architecture](./architecture.md) for the Kernel and Execution Extension boundaries.
