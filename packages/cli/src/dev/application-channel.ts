import type { IncomingMessage, Server } from 'node:http'
import type { Duplex } from 'node:stream'
import type {
  ProviderMethodInvocationRequest,
  ProviderPlaygroundRequest,
  ReplayCapsuleRequest,
  RuntimeEvent,
} from '@loutrejs/loutre/devtools'
import { WebSocketServer, type WebSocket } from 'ws'
import { DEVTOOLS_PROTOCOL_VERSION } from './protocol.js'
import {
  DevtoolsEventStore,
  type DevtoolsApplicationInfo,
} from './event-store.js'
import { isDevtoolsLoopbackRequest } from './security.js'

export const DEVTOOLS_APPLICATION_CHANNEL_PATH = '/__loutre/app'

export interface ApplicationChannelOptions {
  readonly eventStore: DevtoolsEventStore
}

export type DevtoolsApplicationCommand =
  | {
      readonly type: 'command.replay-capsule'
      readonly request: ReplayCapsuleRequest
    }
  | {
      readonly type: 'command.provider-playground'
      readonly request: ProviderPlaygroundRequest
    }
  | {
      readonly type: 'command.invoke-provider-method'
      readonly request: ProviderMethodInvocationRequest
    }

export interface ApplicationChannel {
  command(runId: string, command: DevtoolsApplicationCommand): Promise<unknown>
  close(): Promise<void>
}

interface HelloMessage {
  readonly type: 'hello'
  readonly protocolVersion: number
  readonly runId: string
  readonly application?: DevtoolsApplicationInfo
}

interface EventBatchMessage {
  readonly type: 'event.batch'
  readonly runId: string
  readonly events: readonly RuntimeEvent[]
}

interface CommandResultMessage {
  readonly type: 'command.result'
  readonly requestId: string
  readonly ok: boolean
  readonly result?: unknown
  readonly error?: unknown
}

interface PendingCommand {
  readonly resolve: (value: unknown) => void
  readonly reject: (reason: unknown) => void
  readonly timer: ReturnType<typeof setTimeout>
}

interface ConnectedApplication {
  readonly websocket: WebSocket
  readonly pending: Map<string, PendingCommand>
}

export function attachApplicationChannel(
  server: Server,
  options: ApplicationChannelOptions,
): ApplicationChannel {
  const websocketServer = new WebSocketServer({ noServer: true })
  const applications = new Map<string, ConnectedApplication>()

  const onUpgrade = (
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ) => {
    let pathname: string
    try {
      pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
    } catch {
      socket.destroy()
      return
    }
    if (pathname !== DEVTOOLS_APPLICATION_CHANNEL_PATH) return
    if (!isDevtoolsLoopbackRequest(request)) {
      socket.destroy()
      return
    }
    if (request.headers.origin !== undefined) {
      socket.destroy()
      return
    }
    websocketServer.handleUpgrade(request, socket, head, (websocket) => {
      websocketServer.emit('connection', websocket, request)
    })
  }
  server.on('upgrade', onUpgrade)

  websocketServer.on('connection', (websocket) => {
    attachApplication(websocket, options, applications)
  })

  return {
    command(runId, command) {
      const application = applications.get(runId)
      if (!application || application.websocket.readyState !== 1) {
        return Promise.reject(
          new Error(`LUTRE_DEVTOOLS_RUN_DISCONNECTED: ${runId}`),
        )
      }
      const requestId = command.request.requestId
      if (application.pending.has(requestId)) {
        return Promise.reject(
          new Error(`LUTRE_DEVTOOLS_REQUEST_DUPLICATE: ${requestId}`),
        )
      }
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          application.pending.delete(requestId)
          reject(new Error(`LUTRE_DEVTOOLS_COMMAND_TIMEOUT: ${requestId}`))
        }, 10_000)
        timer.unref()
        application.pending.set(requestId, { resolve, reject, timer })
        try {
          application.websocket.send(JSON.stringify(command))
        } catch (error) {
          clearTimeout(timer)
          application.pending.delete(requestId)
          reject(error)
        }
      })
    },
    async close() {
      server.off('upgrade', onUpgrade)
      for (const application of applications.values()) {
        rejectPending(application, new Error('LUTRE_DEVTOOLS_CHANNEL_CLOSED'))
      }
      applications.clear()
      for (const client of websocketServer.clients) client.terminate()
      await new Promise<void>((resolve, reject) => {
        websocketServer.close((error) => (error ? reject(error) : resolve()))
      })
    },
  }
}

function attachApplication(
  websocket: WebSocket,
  options: ApplicationChannelOptions,
  applications: Map<string, ConnectedApplication>,
): void {
  let runId: string | undefined
  let helloReceived = false
  const pending = new Map<string, PendingCommand>()
  const helloTimeout = setTimeout(
    () => websocket.close(1008, 'hello timeout'),
    5_000,
  )
  helloTimeout.unref()

  websocket.on('message', (data, isBinary) => {
    if (isBinary) {
      websocket.close(1003, 'binary messages are not supported')
      return
    }
    const message = parseMessage(data.toString())
    if (!message) {
      websocket.close(1007, 'invalid message')
      return
    }

    if (!helloReceived) {
      if (!isHelloMessage(message)) {
        websocket.close(1008, 'invalid hello')
        return
      }
      if (message.protocolVersion !== DEVTOOLS_PROTOCOL_VERSION) {
        websocket.close(1002, 'unsupported protocol version')
        return
      }
      helloReceived = true
      runId = message.runId
      clearTimeout(helloTimeout)
      const previous = applications.get(runId)
      if (previous && previous.websocket !== websocket) {
        rejectPending(previous, new Error('LUTRE_DEVTOOLS_RUN_REPLACED'))
        previous.websocket.terminate()
      }
      applications.set(runId, { websocket, pending })
      options.eventStore.connectRun(message.runId, message.application ?? {})
      return
    }

    if (isCommandResultMessage(message)) {
      const command = pending.get(message.requestId)
      if (!command) return
      clearTimeout(command.timer)
      pending.delete(message.requestId)
      if (message.ok) command.resolve(message.result)
      else command.reject(commandError(message.error))
      return
    }

    if (!isEventBatchMessage(message) || message.runId !== runId) {
      websocket.close(1008, 'invalid event batch')
      return
    }
    options.eventStore.append(message.runId, message.events)
  })

  websocket.once('close', () => {
    clearTimeout(helloTimeout)
    rejectPending(
      { websocket, pending },
      new Error('LUTRE_DEVTOOLS_RUN_DISCONNECTED'),
    )
    if (runId && applications.get(runId)?.websocket === websocket) {
      applications.delete(runId)
      options.eventStore.stopRun(runId)
    }
  })
}

function rejectPending(application: ConnectedApplication, error: Error): void {
  for (const command of application.pending.values()) {
    clearTimeout(command.timer)
    command.reject(error)
  }
  application.pending.clear()
}

function commandError(value: unknown): Error {
  if (isRecord(value) && typeof value.message === 'string') {
    const error = new Error(value.message)
    if (typeof value.name === 'string') error.name = value.name
    return error
  }
  return new Error('LUTRE_DEVTOOLS_COMMAND_FAILED')
}

function parseMessage(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}

function isHelloMessage(value: unknown): value is HelloMessage {
  return (
    isRecord(value) &&
    value.type === 'hello' &&
    typeof value.protocolVersion === 'number' &&
    typeof value.runId === 'string' &&
    (value.application === undefined || isRecord(value.application))
  )
}

function isEventBatchMessage(value: unknown): value is EventBatchMessage {
  return (
    isRecord(value) &&
    value.type === 'event.batch' &&
    typeof value.runId === 'string' &&
    Array.isArray(value.events) &&
    value.events.every(isRuntimeEvent)
  )
}

function isCommandResultMessage(value: unknown): value is CommandResultMessage {
  return (
    isRecord(value) &&
    value.type === 'command.result' &&
    typeof value.requestId === 'string' &&
    typeof value.ok === 'boolean'
  )
}

function isRuntimeEvent(value: unknown): value is RuntimeEvent {
  return (
    isRecord(value) &&
    typeof value.type === 'string' &&
    [
      'execution.started',
      'execution.ended',
      'span.started',
      'span.ended',
    ].includes(value.type) &&
    typeof value.runId === 'string' &&
    typeof value.seq === 'number' &&
    typeof value.timestamp === 'number' &&
    typeof value.traceId === 'string' &&
    typeof value.spanId === 'string'
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
