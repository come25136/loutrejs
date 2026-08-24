import {
  contract,
  contextKey,
  defineModule,
  implement,
  layer,
  procedure,
  shortCircuit,
} from '@loutrefw/core'
import {
  ContextOf,
  ControllerOf,
  createHttpApplication,
  http,
  validate,
} from '@loutrefw/http'
import { z } from 'zod'

describe('HTTP application boundary', () => {
  it('全HTTP入力を検証し、Layer stateをctxからapplication-scoped Controllerへ渡す', async () => {
    const EXECUTION_ID = contextKey('executionId').of<string>()
    let executions = 0
    const execution = layer({
      name: 'execution-id',
      provides: [EXECUTION_ID],
      inbound: () => {
        executions += 1
        return { executionId: `exec-${executions}` }
      },
    })
    const Contract = contract({
      update: procedure({
        protocols: {
          http: http({
            method: 'POST',
            path: '/things/{id}',
            request: {
              params: z.object({ id: z.string().min(2) }),
              query: z.object({ page: z.coerce.number().int() }),
              headers: z.object({ 'x-kind': z.literal('fixture') }),
              body: z.object({ name: z.string() }),
            },
            responses: {
              updated: {
                status: 200,
                headers: z.object({
                  'x-dynamic': z.string(),
                  'x-overridden': z.string(),
                  'content-type': z.string(),
                }),
                staticHeaders: {
                  'x-declared': 'static',
                  'x-overridden': 'static',
                },
                body: z.object({
                  id: z.string(),
                  page: z.number(),
                  name: z.string(),
                  executionId: z.string(),
                }),
              },
            },
            pipeline: [
              validate.params,
              validate.query,
              validate.headers,
              validate.body,
              execution,
              http.controller,
            ],
          }),
        },
      }),
    })
    type Controller = ControllerOf<typeof Contract, 'http'>
    let controllerInstances = 0
    class Implementation implements Controller {
      constructor() {
        controllerInstances += 1
      }

      update(ctx: ContextOf<Controller, 'update'>) {
        return ctx.response.updated({
          body: {
            id: ctx.params.id,
            page: ctx.query.page,
            name: ctx.body.name,
            executionId: ctx.executionId,
          },
          headers: {
            'x-dynamic': 'request',
            'x-overridden': 'dynamic',
            'content-type': 'text/plain',
          },
        })
      }
    }
    const Module = defineModule(() => ({
      implementations: [implement(Contract).for(http).with(Implementation)],
    }))
    const application = createHttpApplication({ modules: [Module()] })

    const response = await application.handle(
      new Request('http://fixture.test/things/t1?page=2', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-kind': 'fixture',
        },
        body: JSON.stringify({ name: 'Loutre' }),
      }),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('x-declared')).toBe('static')
    expect(response.headers.get('x-dynamic')).toBe('request')
    expect(response.headers.get('x-overridden')).toBe('dynamic')
    expect(response.headers.get('content-type')).toBe(
      'application/json; charset=utf-8',
    )
    expect(await response.json()).toEqual({
      id: 't1',
      page: 2,
      name: 'Loutre',
      executionId: 'exec-1',
    })

    const second = await application.handle(
      new Request('http://fixture.test/things/t2?page=3', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-kind': 'fixture',
        },
        body: JSON.stringify({ name: 'Second' }),
      }),
    )
    expect(second.status).toBe(200)
    expect(await second.json()).toEqual({
      id: 't2',
      page: 3,
      name: 'Second',
      executionId: 'exec-2',
    })
    expect(controllerInstances).toBe(1)

    const invalid = await application.handle(
      new Request('http://fixture.test/things/x?page=2', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-kind': 'fixture',
        },
        body: JSON.stringify({ name: 'Loutre' }),
      }),
    )
    expect(invalid.status).toBe(400)
  })

  it('treats output schema failures as internal finalization errors', async () => {
    const Contract = contract({
      run: procedure({
        protocols: {
          http: http({
            method: 'GET',
            path: '/invalid-output',
            responses: {
              ok: {
                status: 200,
                body: z.object({ value: z.string() }),
              },
            },
            pipeline: [http.controller],
          }),
        },
      }),
    })
    type Controller = ControllerOf<typeof Contract, 'http'>
    class Implementation implements Controller {
      run(ctx: ContextOf<Controller, 'run'>) {
        return ctx.response.ok({
          body: { value: 42 as unknown as string },
        })
      }
    }
    const Module = defineModule(() => ({
      implementations: [implement(Contract).for(http).with(Implementation)],
    }))
    const application = createHttpApplication({ modules: [Module()] })

    const response = await application.handle(
      new Request('http://fixture.test/invalid-output'),
    )
    expect(response.status).toBe(500)
  })

  it('response header schema failuresをinternal finalization errorにする', async () => {
    const Contract = contract({
      run: procedure({
        protocols: {
          http: http({
            method: 'GET',
            path: '/invalid-output-header',
            responses: {
              ok: {
                status: 200,
                body: z.object({ value: z.string() }),
                headers: z.object({ etag: z.string().startsWith('"') }),
              },
            },
            pipeline: [http.controller],
          }),
        },
      }),
    })
    type Controller = ControllerOf<typeof Contract, 'http'>
    class Implementation implements Controller {
      run(ctx: ContextOf<Controller, 'run'>) {
        return ctx.response.ok({
          body: { value: 'invalid' },
          headers: { etag: 'invalid' },
        })
      }
    }
    const Module = defineModule(() => ({
      implementations: [implement(Contract).for(http).with(Implementation)],
    }))
    const application = createHttpApplication({ modules: [Module()] })

    const response = await application.handle(
      new Request('http://fixture.test/invalid-output-header'),
    )

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual(
      expect.objectContaining({ error: 'Internal Server Error' }),
    )
  })

  it('schema未宣言のdynamic response headerを拒否する', async () => {
    const Contract = contract({
      run: procedure({
        protocols: {
          http: http({
            method: 'GET',
            path: '/undeclared-output-header',
            responses: {
              ok: {
                status: 200,
                body: z.object({ value: z.string() }),
              },
            },
            pipeline: [http.controller],
          }),
        },
      }),
    })
    type Controller = ControllerOf<typeof Contract, 'http'>
    class Implementation implements Controller {
      run(ctx: ContextOf<Controller, 'run'>) {
        return ctx.response.ok({
          body: { value: 'invalid' },
          headers: { etag: 'undeclared' },
        } as never)
      }
    }
    const Module = defineModule(() => ({
      implementations: [implement(Contract).for(http).with(Implementation)],
    }))
    const application = createHttpApplication({ modules: [Module()] })

    const response = await application.handle(
      new Request('http://fixture.test/undeclared-output-header'),
    )

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual(
      expect.objectContaining({ error: 'Internal Server Error' }),
    )
  })

  it('short circuit resultもoutbound後にProtocol Finalizationを通す', async () => {
    let controllerCalled = false
    const cached = layer({
      name: 'cached-result',
      inbound: () =>
        shortCircuit({
          kind: 'http-result' as const,
          variant: 'ok',
          body: { value: 'cached' },
        }),
    })
    const Contract = contract({
      run: procedure({
        protocols: {
          http: http({
            method: 'GET',
            path: '/cached',
            responses: {
              ok: {
                status: 200,
                body: z.object({ value: z.string() }),
              },
            },
            pipeline: [cached, http.controller],
          }),
        },
      }),
    })
    class Implementation {
      run() {
        controllerCalled = true
      }
    }
    const Module = defineModule(() => ({
      implementations: [
        implement(Contract).for(http).with(Implementation as any),
      ],
    }))
    const application = createHttpApplication({ modules: [Module()] })
    const response = await application.handle(
      new Request('https://fixture.test/cached'),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ value: 'cached' })
    expect(controllerCalled).toBe(false)
  })

  it('HTTP serverのlisten完了をpublic hookへ通知する', () => {
    const urls: string[] = []
    const application = createHttpApplication({
      modules: [],
      lifecycle: {
        onServerListening: (url) => urls.push(url),
      },
    })

    application.onServerListening('http://127.0.0.1:3000')

    expect(urls).toEqual(['http://127.0.0.1:3000'])
  })
})
