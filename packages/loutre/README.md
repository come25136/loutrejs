# @loutrejs/loutre

LoutreのApplication Graph Kernelです。Application Definition / Model、Module、DI、Environment、Arguments、Lifecycle、Runtime Capability、generic Layer、Kernel bootstrapを提供します。

HTTPは同じpackageの`@loutrejs/loutre/http` subpathからExecution Extensionとして提供します。Task、MessagePort、WebSocketは独立Extension packageです。

## Install

```sh
npm install @loutrejs/loutre
```

新しいApplicationはinitializerから作成できます。

```sh
npm create loutre@latest my-app
```

## Application Model

Applicationの構成は`defineApplication()`でcanonical `Application Model`へcompileされます。

```ts
import { defineApplication, defineModule } from '@loutrejs/loutre'
import { http } from '@loutrejs/loutre/http'
import { z } from 'zod'

const HealthContract = http.contract({
  health: {
    method: 'GET',
    path: '/health',
    responses: {
      ok: { status: 200, body: z.string() },
    },
  },
})

const HealthHttp = http.implementation({
  name: 'HealthHttp',
  contract: HealthContract,
  factory: () => ({
    health: (ctx) => ctx.response.ok({ body: 'ok' }),
  }),
})

const AppModule = defineModule(() => ({
  executions: [HealthHttp],
}))

export default defineApplication({ modules: [AppModule()] })
```

## Kernel bootstrap

portableなApplicationはroot packageから起動できます。

```ts
import { bootstrapApplication } from '@loutrejs/loutre'
import { bindHttpServer } from '@loutrejs/loutre/http'

const app = await bootstrapApplication({
  application,
  capabilities: [bindHttpServer({ runtime: 'test' })],
})

const response = await app.http.fetch(new Request('http://localhost/health'))
```

ExtensionがApplication Modelに存在するときだけ、そのExtensionのHost APIがApplicationへ合成されます。

## Entry points

| Entry point                     | Role                                          |
| ------------------------------- | --------------------------------------------- |
| `@loutrejs/loutre`              | Application Graph Kernel / Kernel bootstrap   |
| `@loutrejs/loutre/http`         | HTTP Execution Extension                      |
| `@loutrejs/loutre/graph`        | Application Model graph projection            |
| `@loutrejs/loutre/runtime`      | Runtime capability / Kernel runtime primitive |
| `@loutrejs/loutre/http/openapi` | OpenAPI projection                            |
| `@loutrejs/loutre/presentation` | startup presentation                          |
| `@loutrejs/loutre/runtime/*`    | portable Runtime adapter                      |

Additional official Extensions:

- `@loutrejs/tasks`
- `@loutrejs/message-port`
- `@loutrejs/websocket`

Node.js listener ownership is provided by `@loutrejs/node`.

## Architecture invariant

Core never interprets HTTP, Task, MessagePort, or WebSocket identity. Execution Extensions compile their definitions into the single Application Model and own their runtime semantics, Host API, and Graph projection.

## Documentation

- [Getting Started](https://github.com/come25136/loutrejs/blob/main/docs/getting-started.md)
- [Architecture](https://github.com/come25136/loutrejs/blob/main/docs/architecture.md)
- [Examples](https://github.com/come25136/loutrejs/tree/main/examples)

## License

[MIT](https://github.com/come25136/loutrejs/blob/main/LICENSE)
