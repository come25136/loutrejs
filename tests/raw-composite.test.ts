import { expect, expectTypeOf, it } from 'vitest'
import {
  bootstrapApplication,
  defineApplication,
  defineModule,
  inject,
  provide,
  token,
  type,
  type ExecutionGroup,
} from '@loutrejs/loutre'
import { bindHttpServer, http, type HttpHostApi } from '@loutrejs/loutre/http'

it('nested ExecutionGroupをcompile前にflattenしhost APIとDI ownershipを保つ', async () => {
  const Greeting = token<string>('greeting')
  const raw = http.raw({
    name: 'raw',
    route: { method: '*', path: '/raw' },
    factory:
      (greeting = inject(Greeting)) =>
      async (context) =>
        new Response(`${greeting}:${context.request.method}`),
  })
  const group = {
    kind: 'execution-group' as const,
    executions: [{ kind: 'execution-group' as const, executions: [raw] }],
  }
  const Module = defineModule(() => ({
    providers: [provide(Greeting).useValue('hello')],
    executions: [group],
  }))
  const definition = defineApplication({ modules: [Module()] })
  expect(definition.model.executions.map((execution) => execution.id)).toEqual([
    'raw',
  ])
  const application = await bootstrapApplication({
    application: definition,
    capabilities: [bindHttpServer({ runtime: 'test' })],
  })
  expectTypeOf(application.http).toEqualTypeOf<HttpHostApi>()
  try {
    const response = await application.http.fetch(
      new Request('http://test/raw', { method: 'DELETE' }),
    )
    expect(await response.text()).toBe('hello:DELETE')
  } finally {
    await application.close()
  }
})

it('循環ExecutionGroupをModel diagnosticにし、未知のdeclarationを既存validationへ渡す', () => {
  const executions: ExecutionGroup[] = []
  const group: ExecutionGroup = { kind: 'execution-group', executions }
  executions.push(group)
  const Module = defineModule(() => ({ executions: [group] }))
  expect(
    defineApplication({ modules: [Module()] }).model.diagnostics,
  ).toContainEqual(
    expect.objectContaining({ code: 'LUTRE_EXECUTION_GROUP_INVALID' }),
  )
})

it('wildcard methodはrawだけで許可し同じpathのmethod routeとの衝突を拒否する', () => {
  expect(() =>
    http.contract({
      endpoint: {
        method: '*',
        path: '/raw',
        responses: { ok: { status: 204 } },
      },
    }),
  ).toThrow('http.raw()')
  const raw = http.raw({
    name: 'raw',
    route: { method: '*', path: '/raw' },
    factory: () => async () => new Response(),
  })
  const get = http.raw({
    name: 'get',
    route: { method: 'GET', path: '/raw' },
    factory: () => async () => new Response(),
  })
  const conflicting = defineModule(() => ({ executions: [get, raw] }))
  expect(
    defineApplication({ modules: [conflicting()] }).model.diagnostics,
  ).toContainEqual(
    expect.objectContaining({ code: 'LUTRE_HTTP_DUPLICATE_ROUTE' }),
  )
})

it('raw middlewareのstateを型推論しbodyを事前消費せずhandlerへ渡す', async () => {
  const middleware = http.middleware({
    name: 'state',
    state: type<{ identity: { id: string } }>(),
    factory: () => async (_context, next) => {
      await next({ identity: { id: '42' } })
    },
  })
  const raw = http.raw({
    route: { method: '*', path: '/raw', middlewares: [middleware] },
    factory: () => async (context) => {
      expectTypeOf(context.state.identity.id).toEqualTypeOf<string>()
      expect(context.request.bodyUsed).toBe(false)
      return new Response(
        `${context.state.identity.id}:${await context.request.text()}`,
        { status: 202, headers: { 'content-type': 'custom/protocol' } },
      )
    },
  })
  const Module = defineModule(() => ({ executions: [raw] }))
  const handlerInvocations: unknown[] = []
  const app = await bootstrapApplication({
    application: defineApplication({ modules: [Module()] }),
    capabilities: [bindHttpServer({ runtime: 'test' })],
    instrumentation: {
      beginOperation(metadata, invocation) {
        if (metadata.kind === 'http.handler')
          handlerInvocations.push(invocation)
        return { complete() {} }
      },
    },
  })
  try {
    const response = await app.http.fetch(
      new Request('http://test/raw', { method: 'POST', body: 'payload' }),
    )
    expect(response.status).toBe(202)
    expect(response.headers.get('content-type')).toBe('custom/protocol')
    expect(await response.text()).toBe('42:payload')
    expect(handlerInvocations).toEqual([undefined])
  } finally {
    await app.close()
  }
})

it('raw response streamをExecutionLeaseとdrainで管理する', async () => {
  let cancelReason: unknown
  const raw = http.raw({
    route: { method: '*', path: '/raw' },
    factory: () => async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('ready'))
          },
          cancel(reason) {
            cancelReason = reason
          },
        }),
      ),
  })
  const Module = defineModule(() => ({ executions: [raw] }))
  const app = await bootstrapApplication({
    application: defineApplication({ modules: [Module()] }),
    capabilities: [bindHttpServer({ runtime: 'test' })],
  })
  const response = await app.http.fetch(new Request('http://test/raw'))
  const reader = response.body!.getReader()
  expect((await reader.read()).done).toBe(false)
  await app.close()
  expect(cancelReason).toBeInstanceOf(Error)
  await expect(reader.read()).rejects.toThrow()
  expect((await app.http.fetch(new Request('http://test/raw'))).status).toBe(
    503,
  )
})
