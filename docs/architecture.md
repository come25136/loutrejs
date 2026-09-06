# Loutre Architecture

Loutre is a **TypeScript Application Graph Kernel**. Application structure is compiled once into an `Application Model`; Runtime execution, CLI graph inspection, OpenAPI projection, and deployment tooling all consume that same model.

If you are building your first Application, start with [Getting Started](./getting-started.md).

## Overview

```mermaid
flowchart TB
  code["Application code\nModules / Providers / Executions"] --> definition["Application Definition"]
  definition --> model["Application Model"]
  model --> runtime["Kernel Runtime"]
  model --> graph["Graph Projection"]
  model --> tooling["CLI / OpenAPI / Build"]

  http["HTTP Extension"] --> model
  tasks["Tasks Extension"] --> model
  messagePort["MessagePort Extension"] --> model
  websocket["WebSocket Extension"] --> model

  runtime --> node["Node.js"]
  runtime --> bun["Bun"]
  runtime --> deno["Deno"]
  runtime --> workers["Cloudflare Workers"]
  runtime --> lambda["AWS Lambda"]
  runtime --> electron["Electron"]
```

Core owns only portable Application concerns:

- Application Definition and canonical Application Model
- Module boundaries and Provider / DI
- Environment and Arguments
- Lifecycle
- active execution lifetime
- Runtime Capability identity
- generic Layer composition
- diagnostics and Graph projection

HTTP, Tasks, MessagePort, WebSocket, Queue consumers, and similar execution semantics are owned by Execution Extensions. Core does not branch on protocol identity.

## Packages

| Package                  | Role                                                          |
| ------------------------ | ------------------------------------------------------------- |
| `@loutrejs/loutre`       | Application Graph Kernel, DI, lifecycle, runtime abstractions |
| `@loutrejs/loutre/http`  | HTTP Execution Extension and OpenAPI integration              |
| `@loutrejs/tasks`        | Task / Trigger / Queue Consumer Execution Extension           |
| `@loutrejs/message-port` | MessagePort Execution Extension                               |
| `@loutrejs/websocket`    | WebSocket Execution Extension                                 |
| `@loutrejs/node`         | Node.js HTTP Runtime Adapter                                  |
| `@loutrejs/bullmq`       | BullMQ Queue Consumer Driver                                  |
| `@loutrejs/cli`          | Graph inspection, validation, build, deployment tooling       |

The main package exposes these important subpaths:

| Subpath                         | Role                                                 |
| ------------------------------- | ---------------------------------------------------- |
| `@loutrejs/loutre`              | Application, Module, DI, lifecycle, Kernel bootstrap |
| `@loutrejs/loutre/http`         | HTTP Extension                                       |
| `@loutrejs/loutre/graph`        | Application Model graph projection                   |
| `@loutrejs/loutre/runtime`      | Runtime capability and Kernel runtime primitives     |
| `@loutrejs/loutre/http/openapi` | OpenAPI projection                                   |
| `@loutrejs/loutre/presentation` | startup presentation                                 |
| `@loutrejs/loutre/runtime/*`    | portable Runtime adapters                            |

## Application Definition and Model

`defineApplication()` builds the canonical model immediately.

```ts
const application = defineApplication({
  modules: [AppModule()],
  arguments: AppArgs,
})
```

An Application Definition does not own a listener, timer, or process. It contains the compiled `model`, which is the single source of truth used by Runtime and Tooling.

A Module declares Providers and Execution Definitions:

```ts
const AppModule = defineModule(() => ({
  environment: [AppEnv],
  providers: [UsersService],
  executions: [UsersHttp, cleanupTask, heartbeat],
}))
```

Execution Definitions are branded by their owning Extension. During model construction, the Extension compiles each definition into a protocol-neutral execution contribution containing its dependency edges, required Runtime Capabilities, compiled payload, and Graph metadata.

## HTTP Extension

HTTP semantics live in `@loutrejs/loutre/http`.

```ts
import { http } from '@loutrejs/loutre/http'
import { z } from 'zod'

export const UsersContract = http.contract({
  get: {
    method: 'GET',
    path: '/users/{id}',
    request: {
      params: { id: z.string() },
    },
    responses: {
      found: {
        status: 200,
        body: z.object({ id: z.string(), name: z.string() }),
      },
    },
  },
})

export const UsersHttp = http.implementation({
  name: 'UsersHttp',
  contract: UsersContract,
  factory: (users = inject(UsersService)) => ({
    async get(ctx) {
      return ctx.response.found({
        body: await users.get(ctx.input.params.id),
      })
    },
  }),
})
```

HTTP owns route compilation, request decoding, response finalization, middleware composition, authentication helpers, CORS, streaming, and OpenAPI metadata. The Application Model only sees an Execution Extension contribution.

## Tasks Extension

Task, Trigger, and Queue Consumer semantics live in `@loutrejs/tasks`.

```ts
import { fixedDelay, task } from '@loutrejs/tasks'

export const cleanup = task<void, void>({
  name: 'cleanup',
  factory: () => async () => {
    // work
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
```

A hosted Application receives the Extension-owned `tasks` API only when the model contains Tasks executions.

```ts
const app = await bootstrapApplication({ application })
await app.tasks.run(cleanup)
await app.tasks.triggers.start()
```

## MessagePort and WebSocket

MessagePort is provided by `@loutrejs/message-port`; WebSocket is provided by `@loutrejs/websocket`. Both packages depend only on the Kernel public surface and contribute their own execution model, runtime, host API, and graph projection.

This keeps transport semantics outside Core while preserving one Application Model.

## DI and Module visibility

Providers are application-scoped by default. Dependencies declared with `inject()` are collected into the Application Model.

```ts
class UsersService {
  constructor(readonly repository = inject(UserRepository)) {}
}
```

Cross-module dependencies require an explicit `exports` / `imports` path. Visibility is validated while the model is built, before Runtime startup.

## Environment and Arguments

Runtime inputs are declared as typed contracts and bound before Provider construction.

```ts
class AppEnv extends defineEnv(
  z.object({ PORT: z.coerce.number().int().positive() }),
) {}

const AppModule = defineModule(() => ({
  environment: [AppEnv],
}))
```

Runtime adapters provide the environment source. `bootstrapApplication()` can receive an explicit source for tests or embedded execution.

## Runtime and lifecycle

`bootstrapApplication()` creates and initializes the portable Kernel-hosted Application.

```ts
const app = await bootstrapApplication({ application })
```

Runtime adapters add platform ownership around that Kernel application. Node.js, for example, owns the HTTP listener:

```ts
const app = await nodeRuntime.create({ application })
await app.serve({ port: 3000 })
```

Shutdown first drains Extension-owned work and active executions, then closes Extension runtimes, then runs Provider lifecycle cleanup.

## Graph and tooling

The CLI loads the Application Definition, reads its compiled model, and projects it without rebuilding a second architecture representation.

```sh
loutre check --entry src/app.ts
loutre graph modules --entry src/app.ts
loutre graph di --entry src/app.ts --format mermaid
loutre graph executions --entry src/app.ts --format json
loutre doctor --entry src/app.ts --runtime node
```

OpenAPI is also an Extension projection. Core does not know HTTP route semantics.

## Design invariant

There is one canonical Application Model. Runtime adapters, CLI, build, graph projection, and Execution Extensions must not maintain a second parallel model of the Application.
