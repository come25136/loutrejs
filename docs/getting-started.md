# Start Loutre

In this guide, we will create a Loutre Application, test the typed HTTP API, and connect to the Runtime.

Example responsibilities are divided. The Application code shows how to configure the process, and the tests show what to ensure from the outside. Leave the reason why the change is needed in the commit, and use code comments only when there is a reason why you didn't go with a more natural-looking alternative.

## Create a project

When you start `create-loutre`, you can interactively select a Target and a package manager. If you start with Node.js and npm, you can run the commands in this guide as is.

```sh
npm create loutre@latest my-app
bun create loutre my-app
deno x -A npm:create-loutre@latest my-app
```

Move to the creation destination.

```sh
cd my-app
```

The generated project follows Loutre's recommended feature-oriented structure:

```text
src/
├ app.ts          Root Module wiring and Application Definition
├ app.test.ts     Application-boundary behavior test
├ hello/
│  ├ contract.ts  HTTP Contract for the hello feature
│  └ controller.ts
└ main.ts         Connection between Application and selected Runtime
```

As the application grows, add feature or integration directories such as `users/`, `auth/`, and `database/` instead of collecting Controllers and Providers into global type directories. Cross-cutting Pipeline behavior such as authentication or transactions can live under `layers/`. See [Architecture](./architecture.md#project-structure) for the full convention.

If you have decided on the target and package manager in advance, you can create them non-interactively.

```sh
npm create loutre@latest my-app -- --target cloudflare-workers --package-manager pnpm
```

Available targets are Node.js, Bun, Deno, Cloudflare Workers, and AWS Lambda. The package manager supports npm, pnpm, Yarn, Bun, and Deno.

Specify `--no-install` to install the dependencies later, or specify `--yes` to skip the questions and use the default values. `--yes` uses Node.js as Target and initializer as the package manager.

## Define HTTP Application

Add a `greetings` feature that receives a name and returns a greeting. Keep the HTTP Contract, Provider, and Implementation inside the feature directory, and leave `app.ts` responsible for wiring them into the Application.

`src/greetings/contract.ts` defines the external HTTP boundary.

```ts
import { contract } from '@loutrejs/loutre'
import { http, validate } from '@loutrejs/loutre/http'
import { z } from 'zod'

export const GreetingContract = contract([
  http({
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
      pipeline: [validate.params, http.controller],
    },
  }),
])
```

`src/greetings/service.ts` contains the application logic used by the feature.

```ts
export class GreetingService {
  greet(name: string) {
    return { message: `Hello, ${name}!` }
  }
}
```

`src/greetings/controller.ts` implements the Contract and delegates the actual work to the Provider.

```ts
import { implementation, inject } from '@loutrejs/loutre'
import { http } from '@loutrejs/loutre/http'
import { GreetingContract } from './contract.js'
import { GreetingService } from './service.js'

export const GreetingController = implementation({
  name: 'GreetingController',
  contract: GreetingContract,
  protocol: http,
  factory: (greetings = inject(GreetingService)) => ({
    async greet(ctx) {
      return ctx.response.ok({
        body: greetings.greet(ctx.params.name),
      })
    },
  }),
})
```

Finally, `src/app.ts` wires the feature into the root Module and Application Definition.

```ts
import { defineApplication, defineModule } from '@loutrejs/loutre'
import { GreetingController } from './greetings/controller.js'
import { GreetingService } from './greetings/service.js'

const AppModule = defineModule(() => ({
  providers: [GreetingService],
  implementations: [GreetingController],
}))

export default defineApplication({
  modules: [AppModule()],
})
```

`GreetingContract`, `GreetingService`, and `GreetingController` belong to the same feature, so they stay together under `greetings/`. `app.ts` only composes the root Application Graph; it does not absorb feature logic just because those definitions are registered there.

Application Definition is not an HTTP server itself. Define the Application Graph, which does not depend on Runtime, first, and connect execution environment-specific functions such as HTTP listener from the Host.

HTTP Contracts can also be nested with `routes`. Tree keys are architectural namespaces and do not add URL segments by themselves; add `path` on a branch when a URL prefix is required. Parent `path`, `pipeline`, and `responses` are inherited by descendant routes.

## Test the behavior

`src/app.test.ts` verifies the behavior that can be observed from the HTTP boundary, not the calling order of internal classes. Make it clear what the Application guarantees just by the test name and expected value.

```ts
import { bootstrap } from '@loutrejs/loutre/host'
import { expect, it } from 'vitest'
import application from './app.js'

it('GET /greetings/{name} returns greetings including name', async () => {
  // Don't share Host between tests. To avoid carrying over Application state.
  const app = bootstrap({ application })

  try {
    const response = await app.fetch(
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

Run the test.

```sh
npm run test
```

`bootstrap()` does not use the actual port and runs Application on Web Standard `fetch(request)`. You can reuse the same Application Definition whether for testing, embedded use, or runtime adapter.

## Connect to Node.js

Node.js Target `src/main.ts` connects Application to Node.js Runtime.

```ts
import { nodeRuntime } from '@loutrejs/node'
import application from './app.js'

const app = await nodeRuntime.create({ application })

await app.serve({ port: 3000 })
```

Start the development server.

```sh
npm run dev
```

Send the request from another terminal.

```sh
curl http://localhost:3000/greetings/Loutre
```

```json
{ "message": "Hello, Loutre!" }
```

Even if you change only Runtime, the feature code under `src/greetings/` and the Application Definition in `src/app.ts` will not change. For Bun, Deno, Cloudflare Workers, and AWS Lambda, the generated `src/main.ts` connects their respective Runtime adapters.

## Validate and record changes

The starter `verify` script checks format, lint, type checking, Application Graph, tests, and Target-specific builds all at once.

```sh
npm run verify
```

If the validation passes, we leave a commit not just a list of changed files, but what the changes made possible.

```sh
git add src/app.ts src/app.test.ts src/greetings
git commit -m "feat: Enable to return greetings by name"
```

With `feat: Update app.ts`, the reason for the change cannot be determined later. Even if you only read the history, the message should make it clear why the boundaries and behavior were changed.

## Create HTTP Client from Contract

HTTP Contract can be used not only as a server but also as a source of truth for clients. There is no need to expose the implementation or handler types.

```ts
import { createHttpClient, fetchHttpTransport } from '@loutrejs/loutre/http'
import { GreetingContract } from './greetings/contract.js'

const client = createHttpClient(
  GreetingContract,
  fetchHttpTransport({ baseUrl: 'https://example.com' }),
)

const response = await client.greet({
  params: { name: 'Loutre' },
})

if (response.status === 200) {
  console.log(response.body.message)
}
```

The request type is derived from Standard Schema input, and the response type is derived from Standard Schema output. The response is validated at runtime using the status and schema declared in the Contract.

If you want your own communication boundary, implement `HttpClientTransport` and pass it to `createHttpClient()`. Tests, IPC, and custom fetch policies can also utilize the same client surface derived from Contract.

## Create public boundaries for Module

Module `exports` is a dependency boundary on the Application Graph. Only when depending on another module's Provider, the declaring module sets the provider to `exports`, and the dependent module sets the declaring source to `imports`.

```ts
class UsersService {}

const UsersModule = defineModule(() => ({
  providers: [UsersService],
  exports: [UsersService],
}))

class BillingService {
  constructor(readonly users = inject(UsersService)) {}
}

const BillingModule = defineModule(() => ({
  imports: [UsersModule()],
  providers: [BillingService],
}))
```

`exports` is not required for dependencies within the same Module. Cross-module dependencies to Providers that are imported but not exported will be rejected with `LUTRE_MODULE_VISIBILITY` during Graph compile.

## Define Arguments and Tasks

Structured input received from the Host can be declared as `Arguments`, and processing explicitly executed by the Host can be declared as public `Task`.

```ts
import { defineApplication, defineArgs, inject, task } from '@loutrejs/loutre'
import { z } from 'zod'

class AppArgs extends defineArgs(
  z.object({
    workers: z.number().int().positive(),
  }),
) {}

export const rebuild = task<void, void>({
  name: 'search.rebuild',
  factory:
    (args = inject(AppArgs)) =>
    async () => {
      console.log(`workers=${args.workers}`)
    },
})

export default defineApplication({
  modules: [],
  arguments: AppArgs,
  tasks: [rebuild],
})
```

The Host passes the Arguments and then executes the Task. The reason why I exported `rebuild` is because the Host references it as an execution target.

```ts
import { bootstrap } from '@loutrejs/loutre/host'
import application, { rebuild } from './app.js'

const app = bootstrap({
  application,
  arguments: {
    workers: argv.workers,
  },
})

await app.run(rebuild)
await app.close('complete')
```

## Supported Runtime

We are continuously checking the operation of the following Runtimes.

| Runtime            | Validation version |
| ------------------ | ------------------ |
| Node.js            | 22 / 24 / 26       |
| Deno               | 2.9                |
| Bun                | 1.3 / 1.4          |
| Cloudflare Workers | workerd            |
| Electron           | 42 / 43            |
| AWS Lambda         | Node.js 22 / 24    |

The main connection APIs for each Runtime are:

```text
Node.js             nodeRuntime.create() → app.serve()
Bun                 bunRuntime.create() → app.serve()
Deno                denoRuntime.bind() / serve()
Cloudflare Workers  cloudflareWorkersRuntime.bind()
AWS Lambda          awsLambdaRuntime.bind()
Electron            electronRuntime.attach()
```

## Examine the Application Graph

`@loutrejs/cli` is responsible for inspecting, illustrating, and explaining the Application Graph and generating deployment artifacts. Starter includes it as a development dependency.

```sh
npm exec loutre -- check --entry src/app.ts
npm exec loutre -- graph di --entry src/app.ts
npm exec loutre -- graph contracts --entry src/app.ts --format mermaid
npm exec loutre -- explain GreetingService --entry src/app.ts
npm exec loutre -- doctor --runtime node --entry src/app.ts
npm exec loutre -- build src/app.ts --out-dir dist/loutre
npm exec loutre -- openapi --entry src/app.ts
```

When adding to an existing project, install `@loutrejs/cli` as a development dependency.

```sh
npm install --save-dev @loutrejs/cli
```

`build --runtime` supports deployment entry generation for `aws-lambda`, `cloudflare-workers`, and `deno`.

```sh
npm exec loutre -- build src/app.ts --runtime aws-lambda
```

## Read next

To learn more about the boundaries between the Application Graph, Contracts, Implementations, Modules, and Runtimes, see [Loutre Architecture](./architecture.md). Runnable configurations are available in [`examples/`](../examples/).
