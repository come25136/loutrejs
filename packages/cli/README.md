# @loutrejs/cli

Loutre Applicationを検査・可視化・buildするDeveloper CLIです。Application DefinitionからGraphを読み取り、validation、runtime compatibility check、deployment artifact、OpenAPI documentを生成できます。

## Install

```sh
npm install --save-dev @loutrejs/cli
```

## Commands

| Command   | Description                                      |
| --------- | ------------------------------------------------ |
| `check`   | Application Graphをvalidation                    |
| `doctor`  | runtime capabilityとの互換性を確認               |
| `graph`   | modules / DI / http / executions / runtimeを表示 |
| `dev`     | ApplicationをDevTools付きで起動                  |
| `explain` | Graph上のtargetを説明                            |
| `build`   | Application bundleとdeployment entryを生成       |
| `openapi` | OpenAPI 3.2 documentを生成                       |

## Usage

```sh
npm exec loutre -- check --entry src/app.ts
npm exec loutre -- doctor --entry src/app.ts
npm exec loutre -- doctor --runtime electron --entry src/app.ts
npm exec loutre -- graph di --entry src/app.ts
npm exec loutre -- graph http --entry src/app.ts --format mermaid
npm exec loutre -- explain GreetingService --entry src/app.ts
```

`doctor`で`--runtime`を省略した場合は、CLIを実行しているruntimeを使用します。別runtimeとの互換性を確認する場合は`--runtime`で明示します。

Graph outputは`text`、`json`、`mermaid`に対応しています。

## DevTools

Applicationへ`DevtoolsModule()`を追加し、`loutre dev`から普段のApplication commandを起動します。CLIはApplication ModelからGraphを構築し、子Application processへlocal DevTools channelを渡します。

```ts
import { defineModule } from '@loutrejs/loutre'
import { DevtoolsModule } from '@loutrejs/loutre/devtools'

const AppModule = defineModule(() => ({
  imports: [DevtoolsModule()],
}))
```

```sh
npm exec loutre -- dev --entry src/app.ts -- npm run dev
```

Dev serverは既定で`127.0.0.1:25136`にlistenします。BrowserやAgent向けControl Planeは`ws://127.0.0.1:25136/__loutre/client`、Application runtime channelは`ws://127.0.0.1:25136/__loutre/app`です。Graph更新、Runtime Trace、Replay、Provider Playgroundは同じstructured command/event protocolを利用します。Browser UIはControl Planeのclientの1つであり、Application Modelやruntime instanceをremote serverへ送る必要はありません。

listen先はloopbackに固定し、HostとBrowser Originを検証します。native clientはloopback接続ならOriginなしでControl Planeへ接続できます。Application channelはBrowser channelと分離し、loopbackかつBrowser Originを持たないruntime接続だけを受け付けます。Browser用tokenやhandshake endpointはありません。追加のBrowser originは`--origin`で明示します。

```sh
npm exec loutre -- dev --entry src/app.ts \
  --port 25137 \
  --origin https://preview.example.com \
  -- npm run dev
```

source変更時はApplication Graphを再構築し、Browserへpushします。watch対象はApplication Definitionのbundle dependencyから絞り込み、`.git`、`.loutre`、`.next`、`coverage`、`dist`、`node_modules`は既定で除外します。追加除外は`--ignore`で指定できます。

## Build

```sh
npm exec loutre -- build src/app.ts --out-dir dist/loutre
```

`aws-lambda`、`cloudflare-workers`、`deno`ではdeployment entryも生成できます。

```sh
npm exec loutre -- build src/app.ts --runtime aws-lambda
```

## OpenAPI

Application DefinitionまたはHTTP Contractをdefault exportするentryからOpenAPIを生成できます。

```sh
npm exec loutre -- openapi --entry src/api.ts --output openapi.json
```

Contract-firstでschemaだけ先に定義する場合、Applicationやimplementationは不要です。Application entryから生成する場合も同じcommandを使えます。

API titleとversionは`package.json`から読み取られ、`--title` / `--api-version`で上書きできます。

## Documentation

- [Getting Started](https://github.com/come25136/loutrejs/blob/main/docs/getting-started.md)
- [Architecture](https://github.com/come25136/loutrejs/blob/main/docs/architecture.md)
- [Loutre](https://github.com/come25136/loutrejs)

## License

[MIT](https://github.com/come25136/loutrejs/blob/main/LICENSE)
