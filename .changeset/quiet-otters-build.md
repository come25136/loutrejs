---
'@loutrejs/loutre': minor
'@loutrejs/http': minor
'@loutrejs/websocket': minor
'@loutrejs/tasks': minor
'@loutrejs/message-port': minor
---

Application Modelを正本とするExecution Extension architectureを導入します。HTTP、WebSocket、Task、MessagePortをCoreの公開rootだけに依存する独立Extensionとして分離し、型付きRuntime capability、active execution lifecycle、Host API合成、Graph projectionを提供します。

## Breaking changes

Loutre 0.xの破壊的再設計として、Protocol中心の旧APIからExecution Extension APIへ移行します。

| 旧API                                          | 新API                                                              |
| ---------------------------------------------- | ------------------------------------------------------------------ |
| `@loutrejs/loutre/http`                        | `@loutrejs/http`                                                   |
| `@loutrejs/loutre/message-port`                | `@loutrejs/message-port`                                           |
| Moduleの`implementations`                      | Moduleの`executions`                                               |
| HTTP routeの`pipeline`                         | HTTP routeの`middlewares`                                          |
| Core Protocol / Procedure / ProtocolDescriptor | Extension-owned Contract / Execution Definition                    |
| response `staticHeaders`                       | response `headers`（固定値、schema、または`{ schema, defaults }`） |

HTTP request bodyを宣言するContractでは、`request.headers`でrequiredな`content-type: string`を宣言する契約を維持します。Content-Typeの正規化、JSON / `+json` / multipart / text decodingは、そのContractでvalidateされたContent-Typeに従ってHTTP Extensionが実行します。

CORSは従来どおり対象routeのmiddlewareとして宣言し、browser preflight用の明示`OPTIONS` routeは不要です。
