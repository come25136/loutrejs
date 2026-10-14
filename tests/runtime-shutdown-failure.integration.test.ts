import { defineApplication, defineModule } from '@loutrejs/loutre'
import { http } from '@loutrejs/loutre/http'
import { ApplicationShutdownError } from '@loutrejs/loutre/runtime'
import { bunRuntime } from '@loutrejs/loutre/runtime/bun'
import { nodeRuntime, type NodeListenerHandle } from '@loutrejs/node'
import { RuntimeDevtoolsInstrumentation } from '@loutrejs/loutre/devtools'
import * as nodeDevtools from '../packages/node/src/devtools.js'
import { silentLogger } from './helpers/silent-logger.js'

function failingApplication(events: string[], error: Error) {
  class Resource {
    onApplicationShutdown(signal?: string) {
      events.push(`shutdown:${signal}`)
      throw error
    }
  }
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
  return defineApplication({
    modules: [
      defineModule({ providers: [Resource], executions: [controller] }),
    ],
    logger: silentLogger,
  })
}

describe('Runtime終了失敗時のplatform resource', () => {
  beforeEach(() => vi.spyOn(console, 'log').mockImplementation(() => {}))
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it.each(['Node', 'Bun'] as const)(
    '%sはlifecycle失敗後もHTTPを停止し、失敗を保持する',
    async (name) => {
      const events: string[] = []
      const error = new Error('lifecycle failed')
      const stop = vi.fn(() => {})
      if (name === 'Bun')
        vi.stubGlobal('Bun', {
          env: {},
          version: 'test',
          serve: () => ({ port: 43210, stop }),
        })
      const definition = failingApplication(events, error)
      const app =
        name === 'Node'
          ? await nodeRuntime.create({
              application: definition,
              shutdownHooks: false,
            })
          : await bunRuntime.create({
              application: definition,
              shutdownHooks: false,
            })
      try {
        const listener = await app.serve({ port: 0, hostname: '127.0.0.1' })
        if ('server' in listener)
          expect(
            (await fetch(`http://127.0.0.1:${listener.port}/health`)).status,
          ).toBe(204)
        const failure = await app
          .close('SIGTERM')
          .catch((value: unknown) => value)
        expect(failure).toBeInstanceOf(AggregateError)
        const kernelError = (failure as AggregateError).errors[0]
        expect(kernelError).toBeInstanceOf(ApplicationShutdownError)
        expect(kernelError.safeCleanupBoundaryReached).toBe(true)
        expect(kernelError.errors).toContain(error)
        if ('server' in listener) {
          expect((listener as NodeListenerHandle).server.listening).toBe(false)
          await expect(
            fetch(`http://127.0.0.1:${listener.port}/health`),
          ).rejects.toThrow()
        } else {
          expect(stop).toHaveBeenCalledExactlyOnceWith(false)
        }
        await expect(app.serve({ port: 0 })).rejects.toThrow(
          'LUTRE_APP_STOPPED',
        )
        await app.close()
        expect(events).toEqual(['shutdown:SIGTERM'])
      } finally {
        await app.close()
      }
    },
  )

  it.each(['Node', 'Bun'] as const)(
    '%sはHTTP未起動でもclose失敗後のserveを拒否する',
    async (name) => {
      const events: string[] = []
      const serve = vi.fn(() => ({ port: 43210, stop: () => {} }))
      if (name === 'Bun')
        vi.stubGlobal('Bun', { env: {}, version: 'test', serve })
      const definition = failingApplication(
        events,
        new Error('lifecycle failed'),
      )
      const app =
        name === 'Node'
          ? await nodeRuntime.create({
              application: definition,
              shutdownHooks: false,
            })
          : await bunRuntime.create({
              application: definition,
              shutdownHooks: false,
            })
      try {
        await expect(app.close()).rejects.toThrow(
          `${name} runtime shutdown failed`,
        )
        await expect(app.serve({ port: 0 })).rejects.toThrow(
          'LUTRE_APP_STOPPED',
        )
        expect(serve).not.toHaveBeenCalled()
        await app.close()
        expect(events).toHaveLength(1)
      } finally {
        await app.close()
      }
    },
  )

  it('NodeはKernelとserverの両方の終了失敗を集約し、Devtools transportも解除する', async () => {
    const closeTransport = vi.fn()
    vi.spyOn(nodeDevtools, 'createNodeDevtoolsSession').mockReturnValue({
      instrumentation: new RuntimeDevtoolsInstrumentation({
        options: {},
        observer: {},
        context: {
          run: (_context, operation) => operation(),
          current: () => undefined,
        },
      }),
      closeTransport,
      dispose: () => {},
    })
    const lifecycleError = new Error('lifecycle failed')
    const serverError = new Error('server failed')
    const app = await nodeRuntime.create({
      application: failingApplication([], lifecycleError),
      shutdownHooks: false,
    })
    const listener = await app.serve({ port: 0 })
    const originalClose = listener.server.close.bind(listener.server)
    listener.server.close = ((callback?: (error?: Error) => void) => {
      callback?.(serverError)
      return listener.server
    }) as typeof listener.server.close
    try {
      const failure = await app.close().catch((value: unknown) => value)
      expect(failure).toBeInstanceOf(AggregateError)
      expect((failure as AggregateError).errors).toEqual([
        expect.objectContaining({
          safeCleanupBoundaryReached: true,
          errors: [lifecycleError],
        }),
        serverError,
      ])
      expect(closeTransport).toHaveBeenCalledOnce()
      await expect(app.serve({ port: 0 })).rejects.toThrow('LUTRE_APP_STOPPED')
    } finally {
      listener.server.close = originalClose
      await app.close()
    }
  })

  it('BunはKernelとnative stopの両方の失敗を集約し、再試行で残ったlistenerを回収する', async () => {
    const lifecycleError = new Error('lifecycle failed')
    const serverError = new Error('server failed')
    const stop = vi
      .fn()
      .mockRejectedValueOnce(serverError)
      .mockResolvedValue(undefined)
    vi.stubGlobal('Bun', {
      env: {},
      version: 'test',
      serve: () => ({ port: 43210, stop }),
    })
    const app = await bunRuntime.create({
      application: failingApplication([], lifecycleError),
      shutdownHooks: false,
    })
    try {
      await app.serve({ port: 0 })
      const failure = await app.close().catch((value: unknown) => value)
      expect((failure as AggregateError).errors).toEqual([
        expect.objectContaining({
          safeCleanupBoundaryReached: true,
          errors: [lifecycleError],
        }),
        serverError,
      ])
      await app.close()
      expect(stop).toHaveBeenCalledTimes(2)
    } finally {
      await app.close()
    }
  })
})
