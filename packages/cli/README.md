# @loutrejs/cli

Loutre Applicationを検査・可視化・buildするDeveloper CLIです。Application DefinitionからGraphを読み取り、validation、runtime compatibility check、deployment artifact、OpenAPI documentを生成できます。

## Install

```sh
npm install --save-dev @loutrejs/cli
```

## Commands

| Command    | Description                                      |
| ---------- | ------------------------------------------------ |
| `check`    | Application Graphをvalidation                    |
| `doctor`   | runtime capabilityとの互換性を確認               |
| `graph`    | modules / DI / http / executions / runtimeを表示 |
| `devtools` | ブラウザ版DevtoolsへGraph dataを公開             |
| `explain`  | Graph上のtargetを説明                            |
| `build`    | Application bundleとdeployment entryを生成       |
| `openapi`  | OpenAPI 3.2 documentを生成                       |

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

## Devtools

Application entryを指定して、ローカルのGraph APIを起動します。

```sh
npm exec loutre -- devtools --entry src/app.ts
```

APIは既定で`http://127.0.0.1:4545`にlistenします。起動後に[Loutre Devtools](https://loutrejs.come25136.id/devtools/)を開くと、Application Graphの検索、view切り替え、Node inspectionをブラウザ上で利用できます。source変更時はGraphを再buildし、Server-Sent Eventsで接続中のページへ反映します。

listen先はloopback interfaceに固定されます。CORSは公式サイトと`localhost:3000`の開発環境だけを既定で許可します。別originから接続する場合は`--origin`を繰り返して明示します。

```sh
npm exec loutre -- devtools --entry src/app.ts \
  --port 4546 \
  --origin https://preview.example.com
```

CLI processはApplication Definitionを読み込みます。Webページへ渡すのは、handlerやservice instanceを含まないJSON serialize可能なGraph Snapshotだけです。

## Build

```sh
npm exec loutre -- build src/app.ts --out-dir dist/loutre
```

`aws-lambda`、`cloudflare-workers`、`deno`ではdeployment entryも生成できます。

```sh
npm exec loutre -- build src/app.ts --runtime aws-lambda
```

## OpenAPI

```sh
npm exec loutre -- openapi --entry src/app.ts --output openapi.json
```

API titleとversionは`package.json`から読み取られ、`--title` / `--api-version`で上書きできます。

## Documentation

- [Getting Started](https://github.com/come25136/loutrejs/blob/main/docs/getting-started.md)
- [Architecture](https://github.com/come25136/loutrejs/blob/main/docs/architecture.md)
- [Loutre](https://github.com/come25136/loutrejs)

## License

[MIT](https://github.com/come25136/loutrejs/blob/main/LICENSE)
