import {
  contract,
  defineModule,
  implement,
  procedure,
  type StandardSchemaV1,
} from '@loutrefw/core'
import {
  ContextOf,
  ControllerOf,
  createHttpApplication,
  http,
  validate,
} from '@loutrefw/http'
import { z } from 'zod'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { createNodeHttpServer } from '@loutrefw/runtime-node'

const BodyStreamSchema: StandardSchemaV1<
  unknown,
  ReadableStream<Uint8Array>
> = {
  '~standard': {
    version: 1,
    vendor: 'loutre-test',
    validate: (value) =>
      value instanceof ReadableStream
        ? { value }
        : { issues: [{ message: 'ReadableStreamが必要です' }] },
  },
}

describe('streaming validate.body', () => {
  it('binary bodyをbufferせずStandard SchemaからControllerへ1回だけ渡す', async () => {
    const Contract = contract({
      upload: procedure({
        protocols: {
          http: http({
            method: 'POST',
            path: '/upload',
            request: { body: BodyStreamSchema },
            responses: {
              accepted: {
                status: 202,
                body: z.object({ bytes: z.number() }),
              },
            },
            pipeline: [validate.body, http.controller],
          }),
        },
      }),
    })
    type Controller = ControllerOf<typeof Contract, 'http'>
    class Implementation implements Controller {
      async upload(ctx: ContextOf<Controller, 'upload'>) {
        const reader = ctx.body.getReader()
        let bytes = 0
        while (true) {
          const chunk = await reader.read()
          if (chunk.done) break
          bytes += chunk.value.byteLength
        }
        return ctx.response.accepted({
          body: { bytes },
        })
      }
    }
    const Module = defineModule(() => ({
      implementations: [implement(Contract).for(http).with(Implementation)],
    }))
    const application = createHttpApplication({ modules: [Module()] })
    const response = await application.handle(
      new Request('https://fixture.test/upload', {
        method: 'POST',
        headers: { 'content-type': 'application/octet-stream' },
        body: new Uint8Array([1, 2, 3, 4]),
      }),
    )
    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({ bytes: 4 })

    const server = createNodeHttpServer(application)
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    try {
      const { port } = server.address() as AddressInfo
      const nodeResponse = await fetch(`http://127.0.0.1:${port}/upload`, {
        method: 'POST',
        headers: { 'content-type': 'application/octet-stream' },
        body: new Uint8Array([1, 2, 3, 4, 5]),
      })
      expect(nodeResponse.status).toBe(202)
      expect(await nodeResponse.json()).toEqual({ bytes: 5 })
    } finally {
      server.close()
      await once(server, 'close')
      await application.shutdown('test')
    }
  })
})
