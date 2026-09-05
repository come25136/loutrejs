# @loutrejs/http

Loutre Application Graph KernelへHTTP request executionを接続する公式Extensionです。

HTTP route、request validation、response、middleware、dispatch、Graph projection、Host APIを所有します。CoreはHTTP method、path、status codeを解釈しません。

Coreのgeneric LayerはHTTP上ではMiddlewareとして扱い、routeの`middlewares`へ指定します。

```ts
import { defineApplication, defineModule } from '@loutrejs/loutre'
import { http } from '@loutrejs/http'

const Api = http.contract({
  hello: {
    method: 'GET',
    path: '/hello',
    responses: { ok: { status: 200 } },
  },
})

const Controller = http.implementation({
  contract: Api,
  factory: () => ({
    hello: (context) => context.response.ok({}),
  }),
})

const AppModule = defineModule(() => ({ executions: [Controller] }))
export default defineApplication({ modules: [AppModule()] })
```

Middlewareが追加するstateは`state: type<>()`で宣言します。`http.middleware()`ではHTTP Contextと戻り値の型が補われ、`inject`の依存型も推論されます。

```ts
import { type } from '@loutrejs/loutre'
import { http } from '@loutrejs/http'

const tracing = http.middleware({
  name: 'tracing',
  state: type<{ traceId: string }>(),
  factory: () => async (_context, next) => {
    return next({ traceId: crypto.randomUUID() })
  },
})
```

routeに`middlewares: [tracing]`を指定すると、handlerから`context.state.traceId`を`string`として参照できます。transport非依存の`defineLayer()`でも同じstate宣言を使用できます。

Application entryからOpenAPIを出力するにはCLIを使います。ProviderやHTTP listenerを起動せず、宣言されたrequest / response schemaを変換します。

```sh
loutre openapi --entry src/app.ts --output openapi.json
```

schemaにはStandard JSON Schemaへの変換機能が必要です。request bodyを宣言する場合は、request headers schemaに`content-type`の文字列リテラルも宣言してください。
