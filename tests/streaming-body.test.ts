import { bootstrap } from '@loutrejs/application/host'
import { defineApplication } from '@loutrejs/application'
import {
  contract,
  defineModule,
  implementation,
  procedure,
  type StandardSchemaV1,
} from '@loutrejs/core'
import { http, validate } from '@loutrejs/http'
import { nodeRuntime } from '@loutrejs/runtime-node'
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
    const Contract = contract({
      upload: procedure({
        protocols: {
          http: http({
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
          }),
        },
      }),
    })
    const Implementation = implementation({
      name: 'Implementation',
      contract: Contract,
      protocol: http,
      factory: () => ({
        async upload(ctx) {
          const reader = ctx.body.getReader()
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
    const host = await nodeRuntime.serve({
      application: definition,
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
      await host.close()
    }
  })
})
