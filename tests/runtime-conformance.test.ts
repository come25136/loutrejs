import { defineApplication } from '@loutrejs/application'
import { checkCapabilities } from '@loutrejs/runtime'
import { bunRuntime } from '@loutrejs/runtime-bun'
import { denoRuntime } from '@loutrejs/runtime-deno'
import { electronRuntime } from '@loutrejs/runtime-electron'
import { lambdaRuntime } from '@loutrejs/runtime-lambda'
import { nodeRuntime } from '@loutrejs/runtime-node'
import { workerdRuntime } from '@loutrejs/runtime-workerd'
import { UsersModule } from '../fixtures/http-crud/src/index.js'
import { EventsModule } from '../fixtures/streaming/src/index.js'
import { silentLogger } from './helpers/silent-logger.js'

const usersDefinition = () =>
  defineApplication({ modules: [UsersModule()], logger: silentLogger })
const eventsDefinition = () =>
  defineApplication({ modules: [EventsModule()], logger: silentLogger })

describe('Runtime conformance harness', () => {
  it.each([
    [
      'Deno 2.9 LTS',
      () => denoRuntime.bind({ application: usersDefinition() }),
    ],
    ['workerd', () => workerdRuntime.bind({ application: usersDefinition() })],
  ])('%s bind()で同じFixture Aを実行する', async (_name, createBinding) => {
    const runtimeBinding = createBinding()
    const response = await runtimeBinding.fetch(
      new Request('https://runtime.fixture/users/runtime-user'),
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      id: 'runtime-user',
      name: 'test',
    })
    await runtimeBinding.close()
  })

  it('AWS Lambda nodejs24.x managed形状へunary responseをadaptする', async () => {
    const handler = lambdaRuntime.bind({ application: usersDefinition() })
    const response = await handler({
      rawPath: '/users/lambda-user',
      requestContext: { http: { method: 'GET' } },
    })

    expect(response.statusCode).toBe(200)
    expect(
      JSON.parse(Buffer.from(response.body, 'base64').toString('utf8')),
    ).toEqual({ id: 'lambda-user', name: 'test' })
  })

  it('AWS Lambda response streaming境界へSSE chunkを逐次出力する', async () => {
    const chunks: Uint8Array[] = []
    let ended = false
    let metadata: unknown
    const handler = lambdaRuntime.bind({
      application: eventsDefinition(),
      response: 'streaming',
    })
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
    expect(metadata).toEqual(expect.objectContaining({ statusCode: 200 }))
    expect(new TextDecoder().decode(Buffer.concat(chunks))).toContain(
      'data:{"sequence":3,"message":"event-3"}',
    )
  })

  it('lifecycle ownershipに対応するhigh-level APIを公開する', () => {
    expect(typeof nodeRuntime.serve).toBe('function')
    expect(typeof bunRuntime.serve).toBe('function')
    expect(typeof denoRuntime.serve).toBe('function')
    expect(typeof denoRuntime.bind).toBe('function')
    expect(typeof workerdRuntime.bind).toBe('function')
    expect(typeof lambdaRuntime.bind).toBe('function')
    expect(typeof electronRuntime.attach).toBe('function')
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
      checkCapabilities(
        ['messagePort.send', 'messagePort.receive'],
        electronRuntime,
      ).ok,
    ).toBe(true)
  })
})
