# @loutrejs/node

Loutre ApplicationをNode.jsで起動するRuntime Adapterです。HTTP serverへの接続と、HTTPを持たないworkerのApplication lifecycleを管理します。

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

`create()`はApplicationをinitializeしてRuntime Application Contextを返します。SIGINT / SIGTERMのshutdown hookを標準で登録します。`app.serve()`がHTTP listenerを開始し、`app.close()`がlistenerとApplication lifecycleをまとめて終了します。

## HTTPを持たないworker

TaskやQueueを持つApplicationも`nodeRuntime.create({ application })`で起動できます。`serve()`を呼ぶ必要はありません。

SIGINT / SIGTERMを受けると`app.close(signal)`を実行し、Task・Queueの停止と終了lifecycleへsignalを渡します。手動の`close()`でもsignal handlerを解除します。終了失敗はApplicationのLoggerへ`error`と`signal`を記録し、手動の`close()`では例外として返します。Runtimeは`process.exit()`を呼ばないため、利用側で作成したtimerや外部resourceは終了lifecycleで解放してください。

埋め込み用途やテストでは`nodeRuntime.create({ application, shutdownHooks: false })`で無効にできます。既存の`serve({ shutdownHooks })`は指定時に設定を上書きし、省略時は`create()`の設定を維持します。

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

| Option                 | Description                                 |
| ---------------------- | ------------------------------------------- |
| `create.application`   | Loutre Application                          |
| `create.environment`   | Applicationへ渡すEnvironment source         |
| `create.shutdownHooks` | SIGINT / SIGTERM hookの有効化。標準は`true` |
| `create.arguments`     | Applicationへ渡すArguments                  |
| `serve.port`           | listenするport。省略時は3000から探索        |
| `serve.hostname`       | listenするhostname                          |
| `serve.shutdownHooks`  | shutdown hook設定の上書き。省略時は維持     |

## Documentation

- [Getting Started](https://github.com/come25136/loutrejs/blob/main/docs/getting-started.md)
- [Loutre](https://github.com/come25136/loutrejs)

## License

[MIT](https://github.com/come25136/loutrejs/blob/main/LICENSE)
