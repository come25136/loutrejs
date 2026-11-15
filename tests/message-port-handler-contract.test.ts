import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  bootstrapApplication,
  defineApplication,
  defineExecution,
  defineModule,
} from '@loutrejs/loutre'
import {
  messagePort,
  messagePortExtension,
  type MessagePortContext,
  type MessagePortHandlers,
} from '@loutrejs/loutre/message-port'

const contract = messagePort.contract({
  echo: { input: z.string(), responses: { ok: z.string() } },
})

type EchoContext = MessagePortContext<typeof contract.routes.echo>

class Handlers {
  #prefix = '応答:'

  echo(context: EchoContext) {
    return context.response.ok(`${this.#prefix}${context.input}`)
  }
}

const factories: Record<string, () => MessagePortHandlers<typeof contract>> = {
  prototype上のmethodを元のinstanceで呼び出す: () => new Handlers(),
  列挙できないmethodを呼び出す: () =>
    Object.defineProperty(
      {
        echo: (context: EchoContext) =>
          context.response.ok(`応答:${context.input}`),
      },
      'echo',
      { enumerable: false },
    ),
  契約外のプロパティを参照しない: () => ({
    echo: (context) => context.response.ok(`応答:${context.input}`),
    metadata: '設定',
    get unrelated() {
      throw new Error('契約外のgetterを参照しました。')
    },
  }),
}

describe('MessagePortのhandler契約', () => {
  it.each(Object.entries(factories))('%s', async (_, factory) => {
    const execution = messagePort.implementation({ contract, factory })
    const application = await bootstrapApplication({
      application: defineApplication({
        modules: [defineModule({ executions: [execution] })],
      }),
    })
    try {
      await expect(
        application.messagePort.invoke('echo', '確認'),
      ).resolves.toEqual({
        kind: 'unary',
        response: 'ok',
        value: '応答:確認',
      })
      await expect(application.messagePort.invoke('metadata')).rejects.toThrow(
        'LUTRE_MESSAGE_PORT_METHOD_NOT_FOUND: metadata',
      )
    } finally {
      await application.close()
    }
  })

  it.each([{}, { echo: null }])(
    '宣言されたhandlerが関数でなければ起動を拒否する: %j',
    async (handlers) => {
      const execution = defineExecution(messagePortExtension, {
        name: 'invalid.message-port',
        contract,
        handler: { kind: 'factory', factory: () => handlers },
      })
      await expect(
        bootstrapApplication({
          application: defineApplication({
            modules: [defineModule({ executions: [execution] })],
          }),
        }),
      ).rejects.toThrow('MessagePort handler echoは関数である必要があります。')
    },
  )
})
