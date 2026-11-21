import { expect, it } from 'vitest'
import { z } from 'zod'
import {
  application,
  bootstrapApplication,
  domainError,
  module,
} from '@loutrejs/loutre'
import {
  bindHttpServer,
  createHttpClient,
  fetchHttpTransport,
  http,
} from '@loutrejs/loutre/http'
import { generateOpenApi } from '@loutrejs/loutre/http/openapi'

const Missing = domainError({ code: 'MISSING', data: z.string() })
const tree = {
  api: {
    middlewares: [
      http.cors({ origin: 'https://app.test', exposeHeaders: ['x-page'] }),
    ],
    responses: { empty: { status: 204 } },
    routes: {
      read: {
        method: 'GET',
        path: '/read',
        responses: {
          basic: { status: 200, body: z.strictObject({ id: z.string() }) },
          detail: {
            status: 200,
            body: z.object({ id: z.string(), value: z.number() }),
          },
          events: { status: 200, stream: 'server', body: z.number() },
          missing: {
            status: 404,
            body: z.string(),
            error: http.error(Missing),
          },
        },
      },
      other: { method: 'GET', path: '/other', responses: {} },
    },
  },
} as const

it('同じstatusの応答を参照で選択し、継承した応答を複数のApplicationで利用できる', async () => {
  const contract = http.contract(tree)
  const implementation = http.implementation({
    contract,
    factory: () => ({
      read: () => ({
        schema: contract.read.detail,
        body: { id: 'one', value: 42 },
      }),
      other: () => ({ schema: contract.other.empty }),
    }),
  })
  const definition = application({
    modules: [module({ executions: [implementation] })],
  })
  const options = {
    application: definition,
    capabilities: [bindHttpServer({ runtime: 'test' })],
  }
  await using first = await bootstrapApplication(options)
  await using second = await bootstrapApplication(options)
  for (const app of [first, second]) {
    const response = await app.http.fetch(
      new Request('https://fixture.test/read', {
        headers: { origin: 'https://app.test' },
      }),
    )
    expect(response.headers.has('loutre-response')).toBe(false)
    expect(
      response.headers.get('access-control-expose-headers')?.split(', '),
    ).toEqual(['x-page'])
    const client = createHttpClient(
      contract,
      fetchHttpTransport({
        baseUrl: 'https://fixture.test',
        fetch: (input, init) => app.http.fetch(new Request(input, init)),
      }),
    )
    expect((await client.read()).body).toEqual({ id: 'one', value: 42 })
    expect((await client.other()).headers).not.toHaveProperty('loutre-response')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ id: 'one', value: 42 })
    expect(
      (await app.http.fetch(new Request('https://fixture.test/other'))).status,
    ).toBe(204)
  }
  const info = { info: { title: '参照の確認', version: '1' } }
  expect(generateOpenApi(contract, info)).toEqual(
    generateOpenApi(definition.model, info),
  )
})

it('同じstatusのJSONとSSEをそれぞれのmedia typeで復元する', async () => {
  const contract = http.contract(tree)
  const document = generateOpenApi(contract, {
    info: { title: '混合応答', version: '1' },
  })
  expect(document.paths['/read']).toMatchObject({
    get: {
      responses: {
        200: {
          content: {
            'application/json': { schema: { anyOf: expect.any(Array) } },
            'text/event-stream': { itemSchema: expect.any(Object) },
          },
        },
      },
    },
  })
  const client = createHttpClient(
    contract,
    fetchHttpTransport({
      baseUrl: 'https://fixture.test',
      fetch: async () =>
        new Response('data: 42\n\n', {
          headers: {
            'content-type': 'text/event-stream',
          },
        }),
    }),
  )
  const { body } = await client.read()
  if (
    typeof body !== 'object' ||
    body === null ||
    !(Symbol.asyncIterator in body)
  )
    throw new Error('SSE応答が必要です')
  const events = []
  for await (const event of body) events.push(event)
  expect(events).toEqual([42])
})

it('別Contract・別operation・複製・エラー応答・旧記法の戻り値を拒否する', async () => {
  const contract = http.contract(tree)
  const other = http.contract(tree)
  const invalidResults = [
    { schema: other.read.empty },
    { schema: contract.other.empty },
    { schema: { ...contract.read.empty } },
    { schema: contract.read.missing, body: 'no' },
    { schema: contract.read.empty, body: 42 },
    { schema: contract.read.detail, body: { id: 42 } },
    { kind: 'http-result', response: 'empty', body: undefined },
    new Response('unvalidated'),
  ]
  for (const result of invalidResults) {
    const implementation = http.implementation({
      contract,
      factory: () => ({
        // @ts-expect-error JavaScript利用側が型検査を経由しない場合も検証する
        read: () => result,
        other: () => ({ schema: contract.other.empty }),
      }),
    })
    await using app = await bootstrapApplication({
      application: application({
        modules: [module({ executions: [implementation] })],
      }),
      capabilities: [bindHttpServer({ runtime: 'test' })],
    })
    expect(
      (await app.http.fetch(new Request('https://fixture.test/read'))).status,
    ).toBe(500)
  }
})

it.each(['kind', 'routes'])(
  '予約名 %s は入れ子でもContract構築時に拒否する',
  (name) => {
    expect(() =>
      http.contract({ nested: { routes: { [name]: tree.api.routes.read } } }),
    ).toThrow('Reserved HTTP operation name')
  },
)

it('スキーマが重なる場合は公開された内容に最初に一致した結果を返す', async () => {
  const contract = http.contract({
    read: {
      method: 'GET',
      path: '/read',
      responses: {
        basic: { status: 200, body: z.object({ id: z.string() }) },
        detail: tree.api.routes.read.responses.detail,
      },
    },
  })
  const headers = { 'loutre-response': 'detail' }
  const client = createHttpClient(contract, async () => ({
    status: 200,
    body: { id: 'one', value: 1 },
    headers,
  }))
  await expect(client.read()).resolves.toEqual({
    status: 200,
    body: { id: 'one' },
    headers,
  })
})

it('同じ403を返す二つの分岐はステータス・ヘッダー・本文が一致する', async () => {
  const denied = { status: 403, body: z.string() } as const
  const contract = http.contract({
    check: {
      method: 'GET',
      path: '/check',
      responses: {
        permissionDenied: denied,
        accountSuspended: denied,
      },
    },
  })
  let suspended = false
  const implementation = http.implementation({
    contract,
    factory: () => ({
      check: () =>
        suspended
          ? { schema: contract.check.accountSuspended, body: 'Forbidden' }
          : { schema: contract.check.permissionDenied, body: 'Forbidden' },
    }),
  })
  await using app = await bootstrapApplication({
    application: application({
      modules: [module({ executions: [implementation] })],
    }),
    capabilities: [bindHttpServer({ runtime: 'test' })],
  })
  const read = async () => {
    const response = await app.http.fetch(
      new Request('https://fixture.test/check'),
    )
    return {
      status: response.status,
      headers: Object.fromEntries(response.headers),
      body: await response.text(),
    }
  }
  const first = await read()
  expect(first.status).toBe(403)
  expect(first.body).toBe('Forbidden')
  expect(first.headers).not.toHaveProperty('loutre-response')
  suspended = true
  expect(await read()).toEqual(first)
})
