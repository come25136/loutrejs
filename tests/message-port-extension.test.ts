import { describe, expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import {
  bootstrapApplication,
  defineApplication,
  defineModule,
} from '@loutrejs/loutre'
import { messagePort, type MessagePortHostApi } from '@loutrejs/message-port'

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
})
