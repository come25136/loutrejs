import {
  delegateExecution,
  type ExecutionDefinition,
  type ExecutionExtension,
  type ExecutionExtensionRuntime,
  type ExecutionNodeId,
} from '@loutrejs/loutre'
import { http } from '@loutrejs/loutre/http'
import {
  websocket,
  type WebSocketExecutionDefinition,
  type WebSocketContract,
  type WebSocketHandlers,
} from '@loutrejs/loutre/websocket'
import { z } from 'zod'

const authentication = http.middleware<{ tenant: string }>({
  name: 'Authentication',
  factory: () => async (_input, next) => next({ tenant: '組織1' }),
})
const contract = websocket.contract({
  api: {
    path: '/api',
    routes: {
      echo: {
        path: '/{room}',
        handshake: {
          params: { room: z.coerce.number() },
          middlewares: [authentication],
        },
        messages: websocket.json({
          input: z.number(),
          output: z.object({ value: z.number() }),
        }),
      },
    },
  },
})

interface Runtime extends ExecutionExtensionRuntime {
  handlers(id: ExecutionNodeId): WebSocketHandlers<typeof contract>
}
declare const target: ExecutionDefinition<
  ExecutionExtension<ExecutionDefinition, unknown, never, {}, Runtime>
>

const delegate = delegateExecution(target, (runtime, id) =>
  runtime.handlers(id),
)
const implementation = websocket.delegate({ contract, delegate })
const execution: WebSocketExecutionDefinition<typeof contract> = implementation
void execution

const handlers: WebSocketHandlers<typeof contract> = {
  async 'api.echo'(context) {
    const tenant: string = context.state.tenant
    const room: number = context.input.params.room
    void [tenant, room]
    // @ts-expect-error 宣言していないstateは公開しない
    context.state.secret
    for await (const message of context.input.messages) {
      if (message.kind === 'valid') {
        const value: number = message.value
        await context.send({ value })
        // @ts-expect-error 出力schemaと異なる値は送信できない
        await context.send({ value: '文字列' })
      }
    }
  },
}
websocket.delegate({
  contract,
  delegate: delegateExecution(target, () => handlers),
})

const ordinary = websocket.implementation({
  contract,
  factory: () => ({
    'api.echo': async (context) => {
      await context.send({ value: context.input.params.room })
    },
  }),
})
const factory: () => WebSocketHandlers<typeof contract> = ordinary.factory
void factory

// @ts-expect-error factoryとdelegateを同時に指定しない
websocket.implementation({ contract, factory: ordinary.factory, delegate })
// @ts-expect-error 通常の実装にはfactoryが必要
websocket.implementation({ contract })
websocket.delegate({
  contract,
  // @ts-expect-error Contractのroute名と異なるhandlerへ委任しない
  delegate: delegateExecution(target, () => ({ other: async () => undefined })),
})
websocket.delegate({
  contract,
  // @ts-expect-error Contractが供給しないstateを要求するhandlerへ委任しない
  delegate: delegateExecution(target, () => ({
    'api.echo': async (_context: { state: { secret: string } }) => undefined,
  })),
})

// @ts-expect-error 委任にはdelegateが必要
websocket.delegate({ contract })
// @ts-expect-error 委任にfactoryは指定しない
websocket.delegate({ contract, delegate, factory: ordinary.factory })
// @ts-expect-error factoryの入口ではdelegateを受け付けない
websocket.implementation({ contract, delegate })

const dynamicHandlers: WebSocketHandlers<WebSocketContract> = {
  endpoint: async (context) => {
    await context.close()
  },
}
void dynamicHandlers
