# @loutrejs/cli

Loutre Applicationを検査・可視化・buildするDeveloper CLIです。Application DefinitionからGraphを読み取り、validation、runtime compatibility check、deployment artifact、OpenAPI documentを生成できます。

## Install

```sh
npm install --save-dev @loutrejs/cli
```

## Commands

| Command   | Description                                           |
| --------- | ----------------------------------------------------- |
| `check`   | Application Graphをvalidation                         |
| `doctor`  | runtime capabilityとの互換性を確認                    |
| `graph`   | modules / DI / contracts / executions / runtimeを表示 |
| `explain` | Graph上のtargetを説明                                 |
| `build`   | Application bundleとdeployment entryを生成            |
| `openapi` | OpenAPI 3.2 documentを生成                            |

## Usage

```sh
npm exec loutre -- check --entry src/app.ts
npm exec loutre -- doctor --entry src/app.ts
npm exec loutre -- doctor --runtime electron --entry src/app.ts
npm exec loutre -- graph di --entry src/app.ts
npm exec loutre -- graph contracts --entry src/app.ts --format mermaid
npm exec loutre -- explain GreetingService --entry src/app.ts
```

`doctor`で`--runtime`を省略した場合は、CLIを実行しているruntimeを使用します。別runtimeとの互換性を確認する場合は`--runtime`で明示します。

Graph outputは`text`、`json`、`mermaid`に対応しています。

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
