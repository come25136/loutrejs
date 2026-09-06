# @loutrejs/loutre

LoutreのCore packageです。Application Definition、Contract、DI、Pipeline、Task、Trigger、Environment、Arguments、Runtime bindingなど、Loutre Applicationを構成するpublic APIを提供します。

> Loutreは現在v0.xです。Public APIには破壊的変更が入る可能性があります。

## Install

```sh
npm install @loutrejs/loutre
```

新しいApplicationを始める場合はinitializerも利用できます。

```sh
npm create loutre@latest my-app
```

## Application model

LoutreはHTTP endpointだけを中心にせず、Applicationが実行する処理を同じmodelへ載せます。

- **Contract / Implementation** — protocolごとのinterfaceと実装
- **Module / DI** — dependencyとApplication構成
- **Pipeline / Layer** — requestやexecution contextの処理
- **Task / Trigger / Queue** — 明示実行、schedule、queue consumer
- **Environment / Arguments** — Hostから渡されるtyped input
- **Application Graph** — Application構造をRuntimeとToolingで共有

## Example

```ts
import { defineApplication, task } from '@loutrejs/loutre'

export const hello = task<void, string>({
  name: 'hello',
  factory: () => () => 'Hello, Loutre!',
})

export default defineApplication({
  modules: [],
  tasks: [hello],
})
```

## Entry points

主なsubpath exportは次のとおりです。

| Entry point                     | Role                           |
| ------------------------------- | ------------------------------ |
| `@loutrejs/loutre/http`         | HTTP Contract / Pipeline       |
| `@loutrejs/loutre/host`         | Application bootstrap          |
| `@loutrejs/loutre/binding`      | Host / Queue binding           |
| `@loutrejs/loutre/runtime`      | Runtime capability             |
| `@loutrejs/loutre/graph`        | Application Graph              |
| `@loutrejs/loutre/openapi`      | OpenAPI compatibility alias    |
| `@loutrejs/loutre/http/openapi` | OpenAPI generation (canonical) |
| `@loutrejs/loutre/presentation` | startup presentation           |
| `@loutrejs/loutre/message-port` | MessagePort protocol           |

## HTTP subpath

HTTPのContract、request/response validation、middleware、route dispatch、CORS/auth semanticsは`@loutrejs/loutre/http`から提供します。実装はWeb Platform API（`Request` / `Response` / `Headers` / `ReadableStream`等）だけに依存し、Node.js固有のlistener/bindingは`@loutrejs/node`が担当します。

```ts
import { defineApplication, defineModule } from '@loutrejs/loutre'
import { http } from '@loutrejs/loutre/http'
```

HTTPは本体packageのsubpathですが、CoreからHTTPへの逆依存とHTTPからNode.js built-inへの依存は禁止し、CIで静的に検証します。

## Documentation

- [Getting Started](https://github.com/come25136/loutrejs/blob/main/docs/getting-started.md)
- [Architecture](https://github.com/come25136/loutrejs/blob/main/docs/architecture.md)
- [Examples](https://github.com/come25136/loutrejs/tree/main/examples)

## License

[MIT](https://github.com/come25136/loutrejs/blob/main/LICENSE)
