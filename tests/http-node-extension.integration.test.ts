import { nodeRuntime } from '@loutrejs/node'
import { defineApplication, defineModule } from '@loutrejs/loutre'
import { http } from '@loutrejs/http'
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
            body: { message: `Hello, ${context.params.name}!` },
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
})
