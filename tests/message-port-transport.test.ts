import { expect, it } from 'vitest'
import {
  attachMessagePort,
  type MessagePortInvocationResult,
} from '@loutrejs/loutre/message-port'

it('unaryの値がAsyncIterableでもtransportがstreamへ解釈し直さない', async () => {
  const value = {
    async *[Symbol.asyncIterator]() {
      yield 1
    },
  }
  const result: MessagePortInvocationResult = {
    kind: 'unary',
    response: 'ok',
    value,
  }
  let receive: (event: unknown) => void = () => {
    throw new Error('listenerがありません。')
  }
  const posted = Promise.withResolvers<unknown>()
  attachMessagePort(
    { invoke: async () => result },
    {
      addEventListener(_event, listener) {
        receive = listener
      },
      postMessage(message) {
        posted.resolve(message)
      },
    },
  )
  receive({ data: { id: 'request', procedure: 'read' } })
  await expect(posted.promise).resolves.toEqual({
    id: 'request',
    response: 'ok',
    value,
    done: true,
  })
})
