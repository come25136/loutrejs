# create-loutre

Loutre Applicationをstarterから作成するproject initializerです。Runtime targetとpackage managerを選び、開発・test・buildまで始められるprojectを生成します。

## Quick Start

```sh
npm create loutre@latest my-app
```

BunやDenoからも実行できます。

```sh
bun create loutre my-app
deno x -A npm:create-loutre@latest my-app
```

対話形式でtargetとpackage managerを選択できます。

## Targets

- Node.js
- Bun
- Deno
- Cloudflare Workers
- AWS Lambda

## Package managers

- npm
- pnpm
- Yarn
- Bun
- Deno

## Non-interactive usage

Targetとpackage managerはoptionで指定できます。

```sh
npm create loutre@latest my-app -- --target cloudflare-workers --package-manager pnpm
```

主なoption:

| Option                                | Description                   |
| ------------------------------------- | ----------------------------- |
| `--target <target>`                   | Runtime targetを指定          |
| `--package-manager <package-manager>` | package managerを指定         |
| `--yes`                               | 未指定項目にdefaultを使用     |
| `--no-install`                        | dependency installationをskip |

## Generated project

starterにはTypeScript configurationに加えて、Vitest、Oxlint、Oxfmtとsample testが含まれます。生成したprojectでは`verify` scriptからformat、lint、type / Application Graph check、test、target固有buildをまとめて実行できます。

## Documentation

- [Getting Started](https://github.com/come25136/loutrejs/blob/main/docs/getting-started.md)
- [Examples](https://github.com/come25136/loutrejs/tree/main/examples)
- [Loutre](https://github.com/come25136/loutrejs)

## License

[MIT](https://github.com/come25136/loutrejs/blob/main/LICENSE)
