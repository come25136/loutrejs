<p align="center">
  <img src="./docs/assets/loutre.png" alt="Loutreのカワウソアイコン" width="180">
</p>

<h1 align="center">Loutre</h1>

<p align="center">
  <strong>型でつないで、どこでも泳ぐ。</strong><br>
  Contract・DI・PipelineをApplication Graphで束ねる、ポータブルなTypeScriptフレームワーク。
</p>

<p align="center">
  <a href="#loutreとは">Loutreとは</a> ・
  <a href="#quick-start">Quick Start</a> ・
  <a href="./docs/architecture.md">Architecture</a>
</p>

> [!WARNING]
> Loutreは現在v0.1開発中です。Public APIには破壊的変更が入る可能性があります。
> 各packageはまだnpmへ公開していません。

## Loutreとは

Loutreは、Applicationを**明示的なGraph**として組み立てるTypeScriptフレームワークです。

Contract、DI、Pipeline、Environment、LifecycleをひとつのApplication modelとして扱い、
Type System、Runtime、CLIが同じGraphを見ます。

### 考え方

**Graph-first**  
依存関係と実行境界を、検査・説明できるGraphとして持つ。

**Explicit over magic**  
decorator、metadata、filesystem discoveryに頼らない。

**TypeScriptらしく書く**  
DIはconstructor default parameter、Implementationはfactoryで表現する。

**Execution dataはContextへ**  
request、user、tenant、transactionはtyped Contextとして流す。

**Runtimeに縛られない**  
Application codeとruntime固有APIを分離する。

## Quick Start

最小のHTTP Applicationはこんな形です。

```ts
import {
  defineApplication,
} from '@loutrejs/application'
import {
  contract,
  defineModule,
  implementation,
  inject,
  procedure,
} from '@loutrejs/core'
import {
  http,
  validate,
} from '@loutrejs/http'
import { z } from 'zod'

const GreetingContract = contract({
  greet: procedure({
    protocols: {
      http: http({
        method: 'GET',
        path: '/greetings/{name}',
        request: {
          params: {
            name: z.string().min(1),
          },
        },
        responses: {
          ok: {
            status: 200,
            body: z.object({ message: z.string() }),
          },
        },
        pipeline: [validate.params, http.controller],
      }),
    },
  }),
})

class GreetingService {
  greet(name: string) {
    return { message: `こんにちは、${name}！` }
  }
}

const GreetingController = implementation({
  name: 'GreetingController',
  contract: GreetingContract,
  protocol: http,
  factory: (greetings = inject(GreetingService)) => ({
    async greet(ctx) {
      return ctx.response.ok({
        body: greetings.greet(ctx.params.name),
      })
    },
  }),
})

const GreetingModule = defineModule(() => ({
  providers: [GreetingService],
  implementations: [GreetingController],
}))

export default defineApplication({
  modules: [GreetingModule()],
})
```

self-hostする場合もApplication sourceは変更せず、host側だけでbootstrapします。

```ts
import application from './app.js'
import { bootstrap } from '@loutrejs/application/host'

const app = bootstrap(application)

await app.listen({
  port: 3000,
  hostname: '0.0.0.0',
})
```

現在はrepository内のexampleから試せます。Node.js 26.xが必要です。

```sh
git clone https://github.com/come25136/loutrejs.git
cd loutrejs
npm install
npm run dev --workspace @loutrejs/example-hello-http
```

別terminalから:

```sh
curl http://127.0.0.1:3000/greetings/Loutre
```

```json
{"message":"こんにちは、Loutre！"}
```

Application GraphはCLIから確認できます。

```sh
npx loutre check --entry fixtures/http-crud/src/app.ts
npx loutre graph modules --entry fixtures/http-crud/src/app.ts
npx loutre graph di --entry fixtures/http-crud/src/app.ts
```

より詳しい設計は[`docs/architecture.md`](./docs/architecture.md)、実際の利用例は[`examples/`](./examples/)を参照してください。

## Development

```sh
npm install
npm run verify
```

## License

[MIT](./LICENSE)
