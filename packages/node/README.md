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

const server = await nodeRuntime.serve({
  application,
  port: 3000,
})

await server.close()
```

`serve()`はApplicationのinitialization、HTTP listener、shutdownをひとつのlifecycleとして扱います。

## Port selection

`port`を明示した場合は、そのportでlistenできなければerrorになります。

```ts
await nodeRuntime.serve({ application, port: 8080 })
```

`port`を省略した場合は3000から利用可能なportを探します。

```ts
const server = await nodeRuntime.serve({ application })
console.log(server.port)
```

## Options

| Option          | Description                          |
| --------------- | ------------------------------------ |
| `application`   | HTTP-capable Loutre Application      |
| `port`          | listenするport。省略時は3000から探索 |
| `hostname`      | listenするhostname                   |
| `shutdownHooks` | SIGINT / SIGTERM hookの有効化        |
| `environment`   | Applicationへ渡すEnvironment source  |
| `arguments`     | Applicationへ渡すArguments           |

## Documentation

- [Getting Started](https://github.com/come25136/loutrejs/blob/main/docs/getting-started.md)
- [Loutre](https://github.com/come25136/loutrejs)

## License

[MIT](https://github.com/come25136/loutrejs/blob/main/LICENSE)
