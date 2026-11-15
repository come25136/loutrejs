import { match } from 'ts-pattern'
import type { MessagePortInvocationResult } from './contract.js'
import {
  decodeMessagePortRequest,
  type MessagePortProcedureName,
} from './identity.js'
export interface MessagePortHost {
  invoke(
    method: MessagePortProcedureName,
    input?: unknown,
  ): Promise<MessagePortInvocationResult>
}

export type MessagePortLike = {
  postMessage(value: unknown): void
  start?(): void
  addEventListener(type: 'message', listener: (event: unknown) => void): void
}

export function attachMessagePort(
  host: MessagePortHost,
  port: MessagePortLike,
): void {
  port.addEventListener('message', async (event) => {
    if (typeof event !== 'object' || event === null || !('data' in event))
      return
    const request = decodeMessagePortRequest(event.data)
    if (!request) return
    try {
      const result = await host.invoke(request.procedure, request.input)
      await match(result)
        .with({ kind: 'stream' }, async ({ response, value: stream }) => {
          for await (const value of stream) {
            port.postMessage({ id: request.id, response, value, done: false })
          }
          port.postMessage({ id: request.id, response, done: true })
        })
        .with({ kind: 'unary' }, ({ response, value }) => {
          port.postMessage({ id: request.id, response, value, done: true })
        })
        .exhaustive()
    } catch (error) {
      port.postMessage({
        id: request.id,
        error: error instanceof Error ? error.message : String(error),
        done: true,
      })
    }
  })
  port.start?.()
}
