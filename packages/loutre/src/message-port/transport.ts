export interface MessagePortHost {
  invoke(
    method: string,
    input?: unknown,
  ): Promise<{ readonly response: string; readonly value: unknown }>
}

export type MessagePortLike = {
  postMessage(value: unknown): void
  start?(): void
} & Pick<EventTarget, 'addEventListener'>

export function attachMessagePort(
  host: MessagePortHost,
  port: MessagePortLike,
): void {
  port.addEventListener('message', async (event) => {
    const request = (event as MessageEvent<unknown>).data as {
      readonly id: string
      readonly procedure: string
      readonly input?: unknown
    }
    try {
      const result = await host.invoke(request.procedure, request.input)
      if (isAsyncIterable(result.value)) {
        for await (const value of result.value) {
          port.postMessage({
            id: request.id,
            response: result.response,
            value,
            done: false,
          })
        }
        port.postMessage({
          id: request.id,
          response: result.response,
          done: true,
        })
      } else {
        port.postMessage({
          id: request.id,
          response: result.response,
          value: result.value,
          done: true,
        })
      }
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

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Symbol.asyncIterator in value &&
    typeof value[Symbol.asyncIterator] === 'function'
  )
}
