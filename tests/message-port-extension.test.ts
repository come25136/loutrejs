import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { z } from 'zod'
import {
  bootstrapApplication,
  defineApplication,
  defineModule,
  RuntimeCapabilityRegistry,
  type ExecutionKernelRuntime,
} from '@loutrejs/loutre'
import {
  messagePort,
  messagePortExtension,
  type MessagePortHostApi,
} from '@loutrejs/message-port'

describe('MessagePort Execution Extension', () => {
  it('methodごとのinputとoutputを検証してinvokeする', async () => {
    const contract = messagePort.contract({
      greet: {
        input: z.object({ name: z.string() }),
        responses: { ok: z.object({ message: z.string() }) },
      },
    })
    const handler = messagePort.implementation({
      name: 'greet.message-port',
      contract,
      factory: () => ({
        greet: (context) =>
          context.response.ok({ message: `Hello, ${context.input.name}` }),
      }),
    })
    const Module = defineModule(() => ({ executions: [handler] }))
    const application = await bootstrapApplication({
      application: defineApplication({ modules: [Module()] }),
    })

    expectTypeOf(application.messagePort).toEqualTypeOf<MessagePortHostApi>()
    await expect(
      application.messagePort.invoke('greet', { name: 'Loutre' }),
    ).resolves.toEqual({
      kind: 'message-port-result',
      response: 'ok',
      value: { message: 'Hello, Loutre' },
    })
    await application.close()
  })

  it('Application Model構築後のraw MessagePort Contract mutationをRuntimeへ漏らさない', async () => {
    const route = {
      input: z.string(),
      responses: { ok: z.string() },
    }
    const contract = messagePort.contract({ echo: route })
    const handler = messagePort.implementation({
      name: 'echo.message-port',
      contract,
      factory: () => ({
        echo: (context) => context.response.ok(context.input),
      }),
    })
    const Module = defineModule(() => ({ executions: [handler] }))
    const definition = defineApplication({ modules: [Module()] })

    ;(route as { input: unknown }).input = z.number()
    ;(route.responses as Record<string, unknown>).ok = z.number()

    const application = await bootstrapApplication({ application: definition })
    try {
      await expect(
        application.messagePort.invoke('echo', 'stable'),
      ).resolves.toEqual({
        kind: 'message-port-result',
        response: 'ok',
        value: 'stable',
      })
      await expect(application.messagePort.invoke('echo', 42)).rejects.toThrow()
    } finally {
      await application.close()
    }
  })

  it('server-streamの正常終了・throw・return・cancel・abortでleaseを一度だけ完了する', async () => {
    const cases = [
      {
        name: '正常終了',
        source: async function* () {
          yield 1
        },
        consume: async (value: unknown) => {
          const iterator = (value as AsyncIterable<number>)[
            Symbol.asyncIterator
          ]()
          await expect(iterator.next()).resolves.toMatchObject({ value: 1 })
          await expect(iterator.next()).resolves.toMatchObject({ done: true })
        },
      },
      {
        name: 'throw',
        source: async function* () {
          yield* []
          throw new Error('stream failure')
        },
        consume: async (value: unknown) => {
          const iterator = (value as AsyncIterable<number>)[
            Symbol.asyncIterator
          ]()
          await expect(iterator.next()).rejects.toThrow('stream failure')
        },
      },
      {
        name: 'return',
        source: async function* () {
          yield 1
          yield 2
        },
        consume: async (value: unknown) => {
          const iterator = (value as AsyncIterable<number>)[
            Symbol.asyncIterator
          ]()
          await iterator.next()
          await iterator.return?.()
          await iterator.return?.()
        },
      },
      {
        name: 'cancel',
        source: async function* () {
          yield 1
        },
        consume: async (value: unknown) => {
          const stream = value as AsyncIterable<number> & {
            cancel(reason?: unknown): Promise<void>
          }
          await stream.cancel('consumer cancelled')
          await stream.cancel('consumer cancelled again')
        },
      },
      {
        name: 'abort',
        source: async function* () {
          yield 1
        },
        consume: async (_value: unknown, abort: () => void) => {
          abort()
          await vi.waitFor(() => expect(completed).toBe(1))
        },
      },
    ] as const

    let completed = 0
    for (const testCase of cases) {
      completed = 0
      let controller: AbortController | undefined
      const contract = messagePort.contract({
        values: {
          responses: { ok: { stream: 'server', body: z.number() } },
        },
      })
      const execution = messagePort.implementation({
        name: `stream.${testCase.name}`,
        contract,
        factory: () => ({
          values: (context) => context.response.ok(testCase.source()),
        }),
      })
      const Module = defineModule(() => ({ executions: [execution] }))
      const definition = defineApplication({ modules: [Module()] })
      const group = definition.model.extensions.get(messagePortExtension)!
      const applicationRuntime: ExecutionKernelRuntime = {
        beginExecution() {
          controller = new AbortController()
          return {
            signal: controller.signal,
            abort: (reason) => controller?.abort(reason),
            complete: () => {
              completed += 1
            },
          }
        },
        resolve() {
          return undefined as never
        },
      }
      const runtime = await messagePortExtension.createRuntime({
        executions: group.executions,
        capabilities: new RuntimeCapabilityRegistry(),
        applicationRuntime,
      })
      const result = await runtime.invoke('values')

      expect(completed).toBe(0)
      await testCase.consume(result.value, () =>
        controller?.abort(new Error('aborted')),
      )
      expect(completed).toBe(1)
    }
  })

  it('server-stream consume中のshutdownはctx.signalでpending nextを解放しstream停止完了までProvider cleanupへ進まない', async () => {
    const events: string[] = []
    let notifyStarted!: () => void
    const started = new Promise<void>((resolve) => {
      notifyStarted = resolve
    })
    const contract = messagePort.contract({
      values: {
        responses: { ok: { stream: 'server', body: z.number() } },
      },
    })
    const execution = messagePort.implementation({
      name: 'stream.shutdown',
      contract,
      factory: () => ({
        values: (context) =>
          context.response.ok(
            (async function* () {
              try {
                await new Promise<void>((resolve) => {
                  const onAbort = () => {
                    events.push('signal.aborted')
                    resolve()
                  }
                  if (context.signal.aborted) onAbort()
                  else
                    context.signal.addEventListener('abort', onAbort, {
                      once: true,
                    })
                  notifyStarted()
                })
                yield 1
              } finally {
                events.push('iterator.return')
              }
            })(),
          ),
      }),
    })
    class Resource {
      onModuleDestroy() {
        events.push('provider.destroy')
      }
    }
    const Module = defineModule(() => ({
      providers: [Resource],
      executions: [execution],
    }))
    const application = await bootstrapApplication({
      application: defineApplication({ modules: [Module()] }),
    })
    const result = await application.messagePort.invoke('values')
    const iterator = (result.value as AsyncIterable<number>)[
      Symbol.asyncIterator
    ]()
    const pending = iterator.next()
    await started

    await expect(
      Promise.race([
        application.close(),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error('MessagePort stream drain timed out')),
            250,
          ),
        ),
      ]),
    ).resolves.toBeUndefined()
    await expect(pending).resolves.toMatchObject({ value: 1, done: false })
    expect(events).toEqual([
      'signal.aborted',
      'iterator.return',
      'provider.destroy',
    ])
  })

  it('server-streamのiterator.returnが完了してもin-flight nextが残る間はProvider cleanupへ進まない', async () => {
    const events: string[] = []
    let resolveNext!: (value: IteratorResult<number>) => void
    let markNextStarted!: () => void
    const nextStarted = new Promise<void>((resolve) => {
      markNextStarted = resolve
    })
    const blockedNext = new Promise<IteratorResult<number>>((resolve) => {
      resolveNext = resolve
    })
    const source: AsyncIterable<number> = {
      [Symbol.asyncIterator]() {
        return {
          next() {
            markNextStarted()
            return blockedNext
          },
          async return() {
            events.push('iterator.return')
            return { done: true, value: undefined }
          },
        }
      },
    }
    const contract = messagePort.contract({
      values: {
        responses: { ok: { stream: 'server', body: z.number() } },
      },
    })
    const execution = messagePort.implementation({
      name: 'stream.pending-next',
      contract,
      factory: () => ({
        values: (context) => context.response.ok(source),
      }),
    })
    class Resource {
      onModuleDestroy() {
        events.push('provider.destroy')
      }
    }
    const Module = defineModule(() => ({
      providers: [Resource],
      executions: [execution],
    }))
    const application = await bootstrapApplication({
      application: defineApplication({ modules: [Module()] }),
      forceShutdownTimeoutMs: 10,
    })
    const result = await application.messagePort.invoke('values')
    const iterator = (result.value as AsyncIterable<number>)[
      Symbol.asyncIterator
    ]()
    const pending = iterator.next()
    await nextStarted

    await expect(application.close()).rejects.toThrow(
      'Application shutdown did not reach a safe cleanup boundary.',
    )
    expect(events).toEqual(['iterator.return'])

    resolveNext({ done: true, value: undefined })
    await expect(pending).resolves.toMatchObject({ done: true })
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    await expect(application.close()).resolves.toBeUndefined()
    expect(events).toEqual(['iterator.return', 'provider.destroy'])
  })

  it('server-streamのiterator.returnがpendingでもshutdown timeoutでsafe boundaryを返す', async () => {
    const events: string[] = []
    let resolveReturn!: (value: IteratorResult<number>) => void
    const blockedReturn = new Promise<IteratorResult<number>>((resolve) => {
      resolveReturn = resolve
    })
    const source: AsyncIterable<number> = {
      [Symbol.asyncIterator]() {
        return {
          next: () => new Promise<IteratorResult<number>>(() => undefined),
          return() {
            events.push('iterator.return')
            return blockedReturn
          },
        }
      },
    }
    const contract = messagePort.contract({
      values: {
        responses: { ok: { stream: 'server', body: z.number() } },
      },
    })
    const execution = messagePort.implementation({
      name: 'stream.hanging-return',
      contract,
      factory: () => ({
        values: (context) => context.response.ok(source),
      }),
    })
    class Resource {
      onModuleDestroy() {
        events.push('provider.destroy')
      }
    }
    const Module = defineModule(() => ({
      providers: [Resource],
      executions: [execution],
    }))
    const application = await bootstrapApplication({
      application: defineApplication({ modules: [Module()] }),
      forceShutdownTimeoutMs: 10,
    })
    await application.messagePort.invoke('values')

    await expect(
      Promise.race([
        application.close(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('shutdown hung')), 100),
        ),
      ]),
    ).rejects.toThrow(
      'Application shutdown did not reach a safe cleanup boundary.',
    )
    expect(events).toEqual(['iterator.return'])

    resolveReturn({ done: true, value: undefined })
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    await expect(application.close()).resolves.toBeUndefined()
    expect(events).toEqual(['iterator.return', 'provider.destroy'])
  })
})
