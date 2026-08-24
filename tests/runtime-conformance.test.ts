import { createBunFetchHandler, bunRuntime } from '@loutrefw/runtime-bun'
import { createDenoFetchHandler, denoRuntime } from '@loutrefw/runtime-deno'
import { electronRuntime } from '@loutrefw/runtime-electron'
import {
  createLambdaHandler,
  createLambdaStreamingHandler,
  lambdaRuntime,
} from '@loutrefw/runtime-lambda'
import { nodeRuntime } from '@loutrefw/runtime-node'
import {
  createWorkerdFetchHandler,
  workerdRuntime,
} from '@loutrefw/runtime-workerd'
import { checkCapabilities } from '@loutrefw/runtime'
import { createUsersApplication } from '../fixtures/http-crud/src/index.js'
import { createEventsApplication } from '../fixtures/streaming/src/index.js'

describe('Runtime conformance harness', () => {
  it.each([
    ['Deno 2.9 LTS', createDenoFetchHandler],
    ['Bun 1.4 Stable', createBunFetchHandler],
    ['workerd', createWorkerdFetchHandler],
  ])('%s adapterで同じFixture Aを実行する', async (_name, createHandler) => {
    const application = createUsersApplication()
    const handler = createHandler(application)
    const response = await handler(
      new Request('https://runtime.fixture/users/runtime-user'),
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      id: 'runtime-user',
      name: 'test',
    })
    await application.shutdown('test')
  })

  it('AWS Lambda nodejs24.x managed形状へunary responseをadaptする', async () => {
    const application = createUsersApplication()
    const handler = createLambdaHandler(application)
    const response = await handler({
      rawPath: '/users/lambda-user',
      requestContext: { http: { method: 'GET' } },
    })

    expect(response.statusCode).toBe(200)
    expect(
      JSON.parse(Buffer.from(response.body, 'base64').toString('utf8')),
    ).toEqual({ id: 'lambda-user', name: 'test' })
    await application.shutdown('test')
  })

  it('AWS Lambda response streaming境界へSSE chunkを逐次出力する', async () => {
    const application = createEventsApplication()
    const chunks: Uint8Array[] = []
    let ended = false
    let metadata: unknown
    const handler = createLambdaStreamingHandler(application)
    await handler(
      {
        rawPath: '/events',
        requestContext: { http: { method: 'GET' } },
      },
      {
        write: (chunk) => {
          chunks.push(chunk)
          return true
        },
        end: () => {
          ended = true
        },
        setMetadata: (value) => {
          metadata = value
        },
      },
    )

    expect(ended).toBe(true)
    expect(metadata).toEqual(
      expect.objectContaining({ statusCode: 200 }),
    )
    expect(new TextDecoder().decode(Buffer.concat(chunks))).toContain(
      'data:{"sequence":3,"message":"event-3"}',
    )
    await application.shutdown('test')
  })

  it('各Runtimeのatomic capabilityをApplication requirementと照合する', () => {
    for (const runtime of [
      nodeRuntime,
      denoRuntime,
      bunRuntime,
      workerdRuntime,
      lambdaRuntime,
    ]) {
      expect(checkCapabilities(['http.server'], runtime).ok).toBe(true)
    }
    expect(
      checkCapabilities(['messagePort.send', 'messagePort.receive'], electronRuntime)
        .ok,
    ).toBe(true)
  })
})
