import { defineApplication } from '@loutrejs/loutre'
import { checkCapabilities } from '@loutrejs/loutre/runtime'
import { bunRuntime } from '@loutrejs/loutre/runtime/bun'
import { denoRuntime } from '@loutrejs/loutre/runtime/deno'
import { electronRuntime } from '@loutrejs/loutre/runtime/electron'
import { awsLambdaRuntime } from '@loutrejs/loutre/runtime/aws-lambda'
import { nodeRuntime } from '@loutrejs/node'
import { cloudflareWorkersRuntime } from '@loutrejs/loutre/runtime/cloudflare-workers'
import { UsersModule } from '../integrations/http-crud/src/index.js'
import { EventsModule } from '../integrations/streaming/src/index.js'
import { silentLogger } from './helpers/silent-logger.js'

const usersDefinition = () =>
  defineApplication({ modules: [UsersModule()], logger: silentLogger })
const eventsDefinition = () =>
  defineApplication({ modules: [EventsModule()], logger: silentLogger })

describe('Runtime conformance harness', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it.each([
    [
      'Deno',
      () => {
        vi.stubGlobal('Deno', { version: { deno: '2.9.5' } })
        return denoRuntime.bind({ application: usersDefinition() })
      },
    ],
    [
      'cloudflare-workers',
      () => {
        vi.stubGlobal('navigator', { userAgent: 'Cloudflare-Workers' })
        return cloudflareWorkersRuntime.bind({
          application: usersDefinition(),
        })
      },
    ],
  ])(
    '%s bind()で同じHTTP CRUD exampleを実行する',
    async (_name, createBinding) => {
      const runtimeBinding = createBinding()
      const response = await runtimeBinding.fetch(
        new Request('https://runtime.example/users/runtime-user'),
      )
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({
        id: 'runtime-user',
        name: 'test',
      })
      await runtimeBinding.close()
    },
  )

  it('AWS Lambda managed形状へunary responseをadaptする', async () => {
    vi.stubEnv('AWS_EXECUTION_ENV', 'AWS_Lambda_nodejs24.x')
    const handler = awsLambdaRuntime.bind({ application: usersDefinition() })
    const response = await handler({
      rawPath: '/users/aws-lambda-user',
      requestContext: { http: { method: 'GET' } },
    })

    expect(response.statusCode).toBe(200)
    expect(
      JSON.parse(Buffer.from(response.body, 'base64').toString('utf8')),
    ).toEqual({ id: 'aws-lambda-user', name: 'test' })
  })

  it('AWS Lambda response streaming境界へSSE chunkを逐次出力する', async () => {
    vi.stubEnv('AWS_EXECUTION_ENV', 'AWS_Lambda_nodejs24.x')
    const chunks: Uint8Array[] = []
    let ended = false
    let metadata: unknown
    const handler = awsLambdaRuntime.bind({
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

  it('runtime identityはversionから独立している', () => {
    expect(nodeRuntime.runtime).toBe('node')
    expect(bunRuntime.runtime).toBe('bun')
    expect(denoRuntime.runtime).toBe('deno')
    expect(cloudflareWorkersRuntime.runtime).toBe('cloudflare-workers')
    expect(awsLambdaRuntime.runtime).toBe('aws-lambda')
    expect(electronRuntime.runtime).toBe('electron')
  })

  it('lifecycle ownershipに対応するhigh-level APIを公開する', () => {
    expect(typeof nodeRuntime.serve).toBe('function')
    expect(typeof bunRuntime.serve).toBe('function')
    expect(typeof denoRuntime.serve).toBe('function')
    expect(typeof denoRuntime.bind).toBe('function')
    expect(typeof cloudflareWorkersRuntime.bind).toBe('function')
    expect(typeof awsLambdaRuntime.bind).toBe('function')
    expect(typeof electronRuntime.attach).toBe('function')
  })

  it('各Runtimeのatomic capabilityをApplication requirementと照合する', () => {
    for (const runtime of [
      nodeRuntime,
      denoRuntime,
      bunRuntime,
      cloudflareWorkersRuntime,
      awsLambdaRuntime,
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
