import { bootstrap } from '@loutrejs/loutre/host'
import { defineApplication } from '@loutrejs/loutre'
import {
  contract,
  defineModule,
  implementation,
  type StandardSchemaV1,
} from '@loutrejs/loutre'
import { http, validate } from '@loutrejs/loutre/http'
import { nodeRuntime } from '@loutrejs/node'
import { z } from 'zod'
import { silentLogger } from './helpers/silent-logger.js'
import { reserveHttpPort } from './helpers/http-server.js'
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
    const Contract = contract([
      http({
        upload: {
          method: 'POST',
          path: '/upload',
          request: {
            body: {
              contentType: 'application/octet-stream',
              schema: BodyStreamSchema,
            },
          },
          responses: {
            accepted: {
              status: 202,
              body: z.object({ bytes: z.number() }),
            },
          },
          pipeline: [validate.body, http.controller],
        },
      }),
    ])
    const Implementation = implementation({
      name: 'Implementation',
      contract: Contract,
      protocol: http,

      factory: () => ({
        async upload(ctx) {
          const reader = ctx.input.body.getReader()
          let bytes = 0
          while (true) {
            const chunk = await reader.read()
            if (chunk.done) break
            bytes += chunk.value.byteLength
          }
          return ctx.response.accepted({ body: { bytes } })
        },
      }),
    })
    const Module = defineModule(() => ({
      implementations: [Implementation],
    }))
    const definition = defineApplication({
      modules: [Module()],
      logger: silentLogger,
    })
    const application = bootstrap({ application: definition })
    const response = await application.fetch(
      new Request('https://fixture.test/upload', {
        method: 'POST',
        headers: { 'content-type': 'application/octet-stream' },
        body: new Uint8Array([1, 2, 3, 4]),
      }),
    )
    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({ bytes: 4 })
    await application.close()
    const port = await reserveHttpPort()
    const app = await nodeRuntime.create({ application: definition })
    await app.serve({
      port,
      hostname: '127.0.0.1',
    })
    try {
      const nodeResponse = await fetch(`http://127.0.0.1:${port}/upload`, {
        method: 'POST',
        headers: { 'content-type': 'application/octet-stream' },
        body: new Uint8Array([1, 2, 3, 4, 5]),
      })
      expect(nodeResponse.status).toBe(202)
      expect(await nodeResponse.json()).toEqual({ bytes: 5 })
    } finally {
      await app.close()
    }
  })
})
