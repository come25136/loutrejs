# @loutrejs/node

Loutre ApplicationをNode.jsのHTTP serverへ接続するRuntime Adapterです。Web StandardのRequest / ResponseをLoutre HTTP Applicationへbridgeし、server lifecycleをNode.js上で管理します。

Node.js 22以上を対象にしています。

## Install

```sh
npm install @loutrejs/loutre @loutrejs/node
```

## Usage

```ts
import { nodeRuntime } from '@loutrejs/node'
import application from './app.js'

const app = await nodeRuntime.create({ application })
const server = await app.serve({ port: 3000 })

console.log(server.port)
await app.close()
```

`create()`はApplicationをinitializeしてRuntime Application Contextを返します。`app.serve()`がHTTP listenerとshutdown hookを開始し、`app.close()`がlistenerとApplication lifecycleをまとめて終了します。

## Port selection

`port`を明示した場合は、そのportでlistenできなければerrorになります。

```ts
const app = await nodeRuntime.create({ application })
await app.serve({ port: 8080 })
```

`port`を省略した場合は3000から利用可能なportを探します。

```ts
const app = await nodeRuntime.create({ application })
const server = await app.serve()
console.log(server.port)
```

## Options

| Option                | Description                          |
| --------------------- | ------------------------------------ |
| `create.application`  | HTTP-capable Loutre Application      |
| `create.environment`  | Applicationへ渡すEnvironment source  |
| `create.arguments`    | Applicationへ渡すArguments           |
| `serve.port`          | listenするport。省略時は3000から探索 |
| `serve.hostname`      | listenするhostname                   |
| `serve.shutdownHooks` | SIGINT / SIGTERM hookの有効化        |

## Documentation

- [Getting Started](https://github.com/come25136/loutrejs/blob/main/docs/getting-started.md)
- [Loutre](https://github.com/come25136/loutrejs)

## License

[MIT](https://github.com/come25136/loutrejs/blob/main/LICENSE)
