import { nodeRuntime } from '@loutrejs/node'
import type { Server } from 'node:http'
import {
  bindRuntimeCapability,
  defineApplication,
  defineExecution,
  defineExecutionExtension,
  defineModule,
  runtimeCapability,
  type ExecutionDefinition,
} from '@loutrejs/loutre'
import { http } from '@loutrejs/loutre/http'
import { z } from 'zod'
import { reserveHttpPort } from './helpers/http-server.js'

describe('Node runtime + HTTP Execution Extension', () => {
  it('新Application KernelのHTTP Host APIをNode listenerへbindする', async () => {
    const contract = http.contract({
      hello: {
        method: 'GET',
        path: '/hello/{name}',
        request: {
          params: { name: z.string().min(1) },
        },
        responses: {
          ok: {
            status: 200,
            body: z.object({ message: z.string() }),
          },
        },
      },
    })
    const controller = http.implementation({
      name: 'hello.http',
      contract,
      factory: () => ({
        hello: (context) =>
          context.response.ok({
            body: { message: `Hello, ${context.input.params.name}!` },
          }),
      }),
    })
    const AppModule = defineModule(() => ({ executions: [controller] }))
    const definition = defineApplication({ modules: [AppModule()] })
    const port = await reserveHttpPort()
    const application = await nodeRuntime.create({ application: definition })

    try {
      await application.serve({
        port,
        hostname: '127.0.0.1',
        shutdownHooks: false,
      })
      const response = await fetch(`http://127.0.0.1:${port}/hello/Loutre`)

      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toEqual({
        message: 'Hello, Loutre!',
      })
    } finally {
      await application.close('test')
    }
  })

  it('追加Runtime Capability bindingをKernelへ透過する', async () => {
    const EXTRA_DRIVER = runtimeCapability<{ readonly value: string }>(
      'fixture.node.extra-driver',
    )
    interface ExtraExecution extends ExecutionDefinition {
      readonly id: string
    }
    const createRuntime = vi.fn(({ capabilities }) => {
      expect(capabilities.get(EXTRA_DRIVER)).toEqual({ value: 'bound' })
      return {}
    })
    const extension = defineExecutionExtension<ExtraExecution, {}>({
      kind: 'execution-extension',
      abiVersion: '1',
      name: '@fixture/node-extra-capability',
      compile: (definition) => ({
        kind: 'execution',
        id: definition.id,
        executionKind: 'fixture.node-extra',
        dependencies: [],
        capabilities: [EXTRA_DRIVER],
        compiled: Object.freeze({}),
      }),
      createRuntime,
    })
    const contract = http.contract({
      health: {
        method: 'GET',
        path: '/health',
        responses: { ok: { status: 204 } },
      },
    })
    const controller = http.implementation({
      contract,
      factory: () => ({ health: (context) => context.response.ok({}) }),
    })
    const Module = defineModule(() => ({
      executions: [
        controller,
        defineExecution(extension, { id: 'fixture.node-extra' }),
      ],
    }))
    const application = await nodeRuntime.create({
      application: defineApplication({ modules: [Module()] }),
      capabilities: [bindRuntimeCapability(EXTRA_DRIVER, { value: 'bound' })],
    })

    expect(createRuntime).toHaveBeenCalledTimes(1)
    await application.close('test')
  })

  it('await usingはadapterのcloseへ委譲してlistenerとshutdown hookを閉じる', async () => {
    const contract = http.contract({
      health: {
        method: 'GET',
        path: '/health',
        responses: { ok: { status: 204 } },
      },
    })
    const controller = http.implementation({
      contract,
      factory: () => ({ health: (context) => context.response.ok({}) }),
    })
    const AppModule = defineModule(() => ({ executions: [controller] }))
    const definition = defineApplication({ modules: [AppModule()] })
    const port = await reserveHttpPort()
    const signalListeners = {
      SIGINT: process.listenerCount('SIGINT'),
      SIGTERM: process.listenerCount('SIGTERM'),
    }
    let server: Server | undefined

    {
      await using application = await nodeRuntime.create({
        application: definition,
      })
      server = (await application.serve({ port, hostname: '127.0.0.1' })).server
      expect(server.listening).toBe(true)
      expect(process.listenerCount('SIGINT')).toBe(signalListeners.SIGINT + 1)
      expect(process.listenerCount('SIGTERM')).toBe(signalListeners.SIGTERM + 1)
    }

    expect(server?.listening).toBe(false)
    expect(process.listenerCount('SIGINT')).toBe(signalListeners.SIGINT)
    expect(process.listenerCount('SIGTERM')).toBe(signalListeners.SIGTERM)
  })
})
