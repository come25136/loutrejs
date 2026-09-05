import { contract } from '@loutrejs/loutre'
import {
  createHttpClient,
  http,
  type HttpClient,
  type HttpClientTransport,
} from '@loutrejs/loutre/http'
import { z } from 'zod'
const UsersContract = contract([
  http({
    get: {
      method: 'GET',
      path: '/users/{id}',
      request: {
        params: { id: z.string().transform(Number) },
        query: z.object({ includePosts: z.boolean().optional() }),
      },
      responses: {
        ok: {
          status: 200,
          body: z.object({ id: z.string(), name: z.string() }),
        },
        notFound: {
          status: 404,
          body: z.object({ message: z.string() }),
        },
      },
      pipeline: [http.controller],
    },
    create: {
      method: 'POST',
      path: '/users',
      request: {
        headers: z.object({ 'content-type': z.literal('application/json') }),
        body: z.object({ name: z.string() }),
      },
      responses: {
        created: {
          status: 201,
          body: z.object({ id: z.string(), name: z.string() }),
        },
      },
      pipeline: [http.controller],
    },
    health: {
      method: 'GET',
      path: '/health',
      responses: {
        ok: { status: 200, body: z.literal('ok') },
      },
      pipeline: [http.controller],
    },
  }),
])
declare const transport: HttpClientTransport
const client = createHttpClient(UsersContract, transport)
const compatible: HttpClient<typeof UsersContract> = client
void compatible
client.get({
  params: { id: '42' },
  query: { includePosts: true },
})
client.create({
  headers: { 'content-type': 'application/json' },
  body: { name: 'Ada' },
})
client.create({
  headers: {
    // @ts-expect-error Content-TypeはContractのheader schemaに従う
    'content-type': 'text/plain',
  },
  body: { name: 'Ada' },
})
client.health()
// @ts-expect-error path parameterはschema outputではなくwire inputを受け取る
client.get({ params: { id: 42 }, query: {} })
// @ts-expect-error path parameterは必須
client.get({ query: {} })
// @ts-expect-error bodyを宣言したprocedureではbodyが必須
client.create({})
// @ts-expect-error requestを持たないprocedureは入力を受け取らない
client.health({})
type GetResult = Awaited<ReturnType<typeof client.get>>
declare const result: GetResult
if (result.status === 200) {
  const id: string = result.body.id
  const name: string = result.body.name
  void [id, name]
} else {
  const status: 404 = result.status
  const message: string = result.body.message
  void [status, message]
}
