import {
  type WebSocketConnectionDriver,
  type WebSocketCloseInfo,
} from '../contract.js'
import {
  type ExecutionKernelRuntime,
  resolveExecutionMethod,
} from '../../core/index.js'
import { type CompiledWebSocketRoute } from '../compiled.js'
import {
  createWebSocketSessionId,
  negotiatedSubprotocol,
  observedCloseCode,
  type ObservedCloseCode,
} from '../identity.js'
import { WebSocketConnectionNotOpenError } from '../errors.js'
import { encodeMessage, decodeMessages } from './messages.js'

export interface ActiveSession {
  readonly close: (code: number, reason: string) => Promise<void>
  readonly terminate: () => void | Promise<void>
  readonly completion: Promise<void>
}

export function createSession(
  connection: WebSocketConnectionDriver,
  request: Request,
  applicationRuntime: ExecutionKernelRuntime,
  route: CompiledWebSocketRoute,
  input: {
    readonly params: Readonly<Record<string, unknown>>
    readonly query: unknown
    readonly headers: unknown
  },
  handshakeState: Readonly<Record<string, unknown>>,
  lease: ReturnType<ExecutionKernelRuntime['beginExecution']>,
  resolveHandlers: (() => unknown) | undefined,
  runInExecution: (<T>(operation: () => T) => T) | undefined,
): { readonly active: ActiveSession; readonly completion: Promise<void> } {
  const session = Object.freeze({
    id: createWebSocketSessionId(),
    protocol: negotiatedSubprotocol(connection.protocol),
  })
  lease.annotate?.({
    'websocket.session.id': session.id,
    'websocket.protocol': session.protocol,
  })
  let status: 'open' | 'closing' | 'closed' = 'open'
  let transportFailed = false
  let sendTail = Promise.resolve()
  let closeOperation: Promise<void> | undefined
  const closed = connection.closed.then(
    (info) => {
      status = 'closed'
      lease.abort(info)
      return normalizeCloseInfo(info)
    },
    (error: unknown) => {
      status = 'closed'
      lease.fail?.(error)
      lease.abort(error)
      throw error
    },
  )
  const close = (code = 1000, reason = ''): Promise<void> => {
    if (closeOperation) return closeOperation
    if (status === 'closed') return closed.then(() => undefined)
    status = 'closing'
    closeOperation = sendTail
      .catch(() => undefined)
      .then(() => connection.close(code, reason))
      .then(() => closed)
      .then(() => undefined)
    return closeOperation
  }
  const send = (value: unknown): Promise<void> => {
    if (status !== 'open' || transportFailed) {
      return Promise.reject(new WebSocketConnectionNotOpenError())
    }
    const operation = sendTail
      .catch(() => undefined)
      .then(async () => {
        if (status !== 'open' || transportFailed) {
          throw new WebSocketConnectionNotOpenError()
        }
        const message = await encodeMessage(route.messages, value)
        try {
          await connection.send(message)
        } catch (error) {
          transportFailed = true
          throw new WebSocketConnectionNotOpenError(error)
        }
      })
    sendTail = operation
    return operation
  }
  const messages = decodeMessages(connection.messages, route.messages)
  const context = {
    request,
    state: handshakeState,
    session,
    protocol: session.protocol,
    execution: {
      signal: lease.signal,
      annotate: (attributes: Readonly<Record<string, unknown>>) =>
        lease.annotate?.(attributes),
      beginOperation: (
        metadata: Parameters<
          NonNullable<ExecutionKernelRuntime['beginOperation']>
        >[0],
      ) => {
        const begin = () =>
          applicationRuntime.beginOperation?.(metadata) ?? { complete() {} }
        return lease.run ? lease.run(begin) : begin()
      },
    },
    input: {
      ...input,
      ...(route.messages?.input === undefined ? {} : { messages }),
    },
    signal: lease.signal,
    closed,
    close,
    ...(route.messages?.output === undefined ? {} : { send }),
  }
  const completion = (async () => {
    try {
      const handlers = resolveHandlers?.()
      const handler = resolveExecutionMethod(handlers, route.name)
      if (!handler) {
        throw new Error(`LUTRE_WEBSOCKET_HANDLER_MISSING: ${route.name}`)
      }
      const invoke = () => handler(context)
      await (runInExecution ? runInExecution(invoke) : invoke())
      if (status === 'open') await close(1000, '')
    } catch (error) {
      lease.fail?.(error)
      if (status === 'open') await close(1011, '')
    } finally {
      try {
        await closed
      } finally {
        lease.complete()
      }
    }
  })()
  return {
    active: {
      close,
      terminate: () => connection.terminate(),
      completion,
    },
    completion,
  }
}

function normalizeCloseInfo(
  info: WebSocketCloseInfo,
): WebSocketCloseInfo & { readonly code: ObservedCloseCode } {
  return {
    code: observedCloseCode(Number.isInteger(info.code) ? info.code : 1006),
    reason: info.reason ?? '',
    wasClean: info.wasClean === true,
  }
}
