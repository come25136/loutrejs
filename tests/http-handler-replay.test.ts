import { AsyncLocalStorage } from 'node:async_hooks'
import { z } from 'zod'
import {
  bootstrapApplication,
  defineApplication,
  defineModule,
} from '@loutrejs/loutre'
import { http, bindHttpServer } from '@loutrejs/loutre/http'
import {
  RuntimeDevtoolsInstrumentation,
  type RuntimeDevtoolsContext,
  type RuntimeEvent,
} from '@loutrejs/loutre/devtools'
import { requestId } from './helpers/identities.js'

describe('HTTP handlerのdirect replay', () => {
  it('検証後の入力とmiddleware stateを再利用し、不正な入力をhandlerへ渡さない', async () => {
    const events: RuntimeEvent[] = []
    const context = new AsyncLocalStorage<RuntimeDevtoolsContext>()
    const instrumentation = new RuntimeDevtoolsInstrumentation({
      options: {},
      observer: {
        executionStarted: (event) => events.push(event),
        spanStarted: (event) => events.push(event),
      },
      context: {
        run: (value, operation) => context.run(value, operation),
        current: () => context.getStore(),
      },
    })
    const offset = http.middleware<{ offset: number }>({
      name: 'offset',
      factory: () => async (_context, next) => {
        await next({ offset: 3 })
      },
    })
    const contract = http.contract({
      calculate: {
        method: 'POST',
        path: '/items/{id}',
        middlewares: [offset],
        request: {
          params: { id: z.coerce.number() },
          headers: z.object({ 'content-type': z.literal('application/json') }),
          body: z.object({ multiplier: z.number() }),
        },
        responses: {
          ok: { status: 200, body: z.object({ value: z.number() }) },
        },
      },
    })
    const calls: number[] = []
    const controller = http.implementation({
      name: 'Calculator',
      contract,
      factory: () => ({
        calculate({ input, response, state }) {
          const value = input.params.id * input.body.multiplier + state.offset
          calls.push(value)
          return response.ok({ body: { value } })
        },
      }),
    })
    const application = await bootstrapApplication({
      application: defineApplication({
        modules: [defineModule({ executions: [controller] })],
      }),
      capabilities: [bindHttpServer({ runtime: 'test' })],
      instrumentation,
    })
    try {
      const response = await application.http.fetch(
        new Request('https://example.test/items/2', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ multiplier: 4 }),
        }),
      )
      await expect(response.json()).resolves.toEqual({ value: 11 })
      const handler = events.find(
        (event) =>
          event.type === 'span.started' && event.kind === 'http.handler',
      )
      if (handler?.type !== 'span.started' || !handler.capsuleId)
        throw new Error('HTTP handlerのcapsuleがありません。')
      const replay = await instrumentation.replayCapsule({
        requestId: requestId('replay'),
        capsuleId: handler.capsuleId,
      })
      expect(replay).toMatchObject({
        status: 'ok',
        result: { value: { body: { value: 11 } } },
      })
      const invalid = await instrumentation.replayCapsule({
        requestId: requestId('invalid-replay'),
        capsuleId: handler.capsuleId,
        inputOverride: { params: [], body: { multiplier: 4 } },
      })
      expect(invalid).toMatchObject({
        status: 'error',
        error: { message: 'LUTRE_DEVTOOLS_HTTP_HANDLER_INPUT_REQUIRED' },
      })
      expect(calls).toEqual([11, 11])
    } finally {
      await application.close()
      instrumentation.close()
    }
  })
})
