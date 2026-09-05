# @loutrejs/http

Loutre Application Graph KernelへHTTP request executionを接続する公式Extensionです。

HTTP route、request validation、response、dispatch、Graph projection、Host APIを所有します。CoreはHTTP method、path、status codeを解釈しません。

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
