import { expect, it } from 'vitest'
import { z } from 'zod'
import {
  application,
  bootstrapApplication,
  domainError,
  module,
} from '@loutrejs/loutre'
import { bindHttpServer, http } from '@loutrejs/loutre/http'
import { generateOpenApi } from '@loutrejs/loutre/http/openapi'

const Missing = domainError({ code: 'MISSING', data: z.string() })
const tree = {
  api: {
    responses: { empty: { status: 204 } },
    routes: {
      read: {
        method: 'GET',
        path: '/read',
        responses: {
          basic: { status: 200, body: z.object({ id: z.string() }) },
          detail: {
            status: 200,
            body: z.object({ id: z.string(), value: z.number() }),
          },
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
      new Request('https://fixture.test/read'),
    )
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
