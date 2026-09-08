import { defineApplication, defineModule } from '@loutrejs/loutre'
import { checkRuntimeSupport } from '@loutrejs/loutre/runtime'
import { http } from '@loutrejs/loutre/http'
import { bunRuntime } from '@loutrejs/loutre/runtime/bun'
import { denoRuntime } from '@loutrejs/loutre/runtime/deno'
import { electronRuntime } from '@loutrejs/loutre/runtime/electron'
import { awsLambdaRuntime } from '@loutrejs/loutre/runtime/aws-lambda'
import { nodeRuntime } from '@loutrejs/node'
import { cloudflareWorkersRuntime } from '@loutrejs/loutre/runtime/cloudflare-workers'
import { messagePort } from '@loutrejs/message-port'
import { z } from 'zod'
import { UsersModule } from '../integrations/http-crud/src/index.js'
import { EventsHttpModule } from '../integrations/streaming/src/index.js'
import { silentLogger } from './helpers/silent-logger.js'

const usersDefinition = () =>
  defineApplication({ modules: [UsersModule()], logger: silentLogger })
const eventsDefinition = () =>
  defineApplication({ modules: [EventsHttpModule()], logger: silentLogger })

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
    '%s bind()で同じHTTP CRUD integrationを実行する',
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

  it('AWS Lambda streamingのoutput書き込み失敗時にResponse bodyをcancelする', async () => {
    vi.stubEnv('AWS_EXECUTION_ENV', 'AWS_Lambda_nodejs24.x')
    let returned = 0
    const source: AsyncIterable<{ sequence: number }> = {
      [Symbol.asyncIterator]() {
        return {
          async next() {
            return { done: false, value: { sequence: 1 } }
          },
          async return() {
            returned += 1
            return { done: true, value: undefined }
          },
        }
      },
    }
    const contract = http.contract({
      events: {
        method: 'GET',
        path: '/events',
        interaction: 'server-stream',
        responses: {
          ok: {
            status: 200,
            stream: 'server',
            body: z.object({ sequence: z.number() }),
          },
        },
      },
    })
    const implementation = http.implementation({
      contract,
      factory: () => ({
        events: (context) => context.response.ok({ body: source }),
      }),
    })
    const Module = defineModule(() => ({ executions: [implementation] }))
    const handler = awsLambdaRuntime.bind({
      application: defineApplication({ modules: [Module()] }),
      response: 'streaming',
    })

    await expect(
      handler(
        {
          rawPath: '/events',
          requestContext: { http: { method: 'GET' } },
        },
        {
          write() {
            throw new Error('output failed')
          },
          end() {},
        },
      ),
    ).rejects.toThrow('output failed')
    expect(returned).toBe(1)
  })

  it('Electron attachが新MessagePort ExtensionをKernel経由で実行する', async () => {
    Object.defineProperty(process.versions, 'electron', {
      configurable: true,
      value: '43.0.0',
    })
    try {
      const contract = messagePort.contract({
        greet: {
          input: z.object({ name: z.string() }),
          responses: { ok: z.object({ message: z.string() }) },
        },
      })
      const handler = messagePort.implementation({
        name: 'ElectronGreetHandler',
        contract,
        factory: () => ({
          greet: (context) =>
            context.response.ok({ message: `Hello, ${context.input.name}` }),
        }),
      })
      const Module = defineModule(() => ({ executions: [handler] }))
      let onMessage: ((event: { readonly data: unknown }) => void) | undefined
      const posted: unknown[] = []
      const attachment = electronRuntime.attach({
        application: defineApplication({ modules: [Module()] }),
        port: {
          postMessage: (value) => posted.push(value),
          on: (_type, listener) => {
            onMessage = listener
          },
          start: () => undefined,
        },
      })

      onMessage?.({
        data: {
          id: 'request-1',
          procedure: 'greet',
          input: { name: 'Loutre' },
        },
      })
      await vi.waitFor(() => {
        expect(posted).toContainEqual({
          id: 'request-1',
          response: 'ok',
          value: { message: 'Hello, Loutre' },
          done: true,
        })
      })
      await attachment.close()
    } finally {
      delete (process.versions as Record<string, string | undefined>).electron
    }
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
    expect(typeof nodeRuntime.create).toBe('function')
    expect('serve' in nodeRuntime).toBe(false)
    expect(typeof bunRuntime.create).toBe('function')
    expect('serve' in bunRuntime).toBe(false)
    expect(typeof denoRuntime.create).toBe('function')
    expect('serve' in denoRuntime).toBe(false)
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
      expect(checkRuntimeSupport(['http.server'], runtime).ok).toBe(true)
    }
    expect(
      checkRuntimeSupport(
        ['messagePort.send', 'messagePort.receive'],
        electronRuntime,
      ).ok,
    ).toBe(true)
  })
})
