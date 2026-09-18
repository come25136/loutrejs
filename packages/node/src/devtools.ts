import { AsyncLocalStorage } from 'node:async_hooks'
import type { ApplicationDefinition } from '@loutrejs/loutre'
import {
  DEVTOOLS_PROTOCOL_VERSION,
  devtoolsOptionsOf,
  serializeDevtoolsError,
  type ProviderMethodInvocationRequest,
  type ProviderPlaygroundRequest,
  type ReplayCapsuleRequest,
  RuntimeDevtoolsInstrumentation,
  type RuntimeDevtoolsContext,
  type RuntimeEvent,
  type RuntimeObserver,
} from '@loutrejs/loutre/devtools'

interface NodeDevtoolsSession {
  readonly instrumentation: RuntimeDevtoolsInstrumentation
  closeTransport(): void
  dispose(): void
}

const maxQueuedEvents = 2_000
const maxBatchEvents = 100

export function createNodeDevtoolsSession(
  application: ApplicationDefinition,
): NodeDevtoolsSession | undefined {
  const options = devtoolsOptionsOf(application.model)
  if (!options || options.enabled === false) return undefined

  const endpoint = process.env.LOUTRE_DEV_ENDPOINT
  const runIdSeed = process.env.LOUTRE_DEV_RUN_ID
  if (!endpoint || !runIdSeed) return undefined
  // Watch wrappers inherit the same environment across child restarts.
  // Give every actual Application process/session a distinct run identity.
  const runId = `${runIdSeed}.${crypto.randomUUID()}`

  const queue: RuntimeEvent[] = []
  let flushScheduled = false
  let closed = false
  const contextStorage = new AsyncLocalStorage<RuntimeDevtoolsContext>()
  const websocket = new WebSocket(endpoint)

  const flush = () => {
    flushScheduled = false
    if (
      closed ||
      websocket.readyState !== WebSocket.OPEN ||
      queue.length === 0
    ) {
      return
    }
    while (queue.length > 0 && websocket.readyState === WebSocket.OPEN) {
      const events = queue.splice(0, maxBatchEvents)
      try {
        websocket.send(
          JSON.stringify({
            type: 'event.batch',
            runId,
            events,
          }),
        )
      } catch {
        // Runtime observation is best-effort. Non-serializable user metadata or
        // transport failures must never affect Application semantics.
      }
    }
  }

  const scheduleFlush = () => {
    if (flushScheduled) return
    flushScheduled = true
    queueMicrotask(flush)
  }

  const enqueue = (event: RuntimeEvent) => {
    if (closed) return
    if (queue.length >= maxQueuedEvents) queue.shift()
    queue.push(event)
    scheduleFlush()
  }

  const observer: RuntimeObserver = {
    runId,
    executionStarted: enqueue,
    executionEnded: enqueue,
    spanStarted: enqueue,
    spanEnded: enqueue,
  }
  const instrumentation = new RuntimeDevtoolsInstrumentation({
    options,
    observer,
    context: {
      run(context, operation) {
        return contextStorage.run(context, operation)
      },
      current() {
        return contextStorage.getStore()
      },
    },
  })

  websocket.addEventListener('open', () => {
    if (closed) return
    websocket.send(
      JSON.stringify({
        type: 'hello',
        protocolVersion: DEVTOOLS_PROTOCOL_VERSION,
        runId,
        application: { runtime: 'node', pid: process.pid },
      }),
    )
    flush()
  })
  websocket.addEventListener('message', (event) => {
    if (closed || typeof event.data !== 'string') return
    const command = parseInspectorCommand(event.data)
    if (!command) return
    void executeInspectorCommand(websocket, instrumentation, command)
  })
  websocket.addEventListener('error', () => {
    // DevTools transport is best-effort and must not affect the Application.
  })

  const closeTransport = () => {
    if (closed) return
    closed = true
    queue.length = 0
    if (
      websocket.readyState === WebSocket.OPEN ||
      websocket.readyState === WebSocket.CONNECTING
    ) {
      websocket.close()
    }
  }

  return {
    instrumentation,
    closeTransport,
    dispose() {
      instrumentation.close()
      closeTransport()
    },
  }
}

type InspectorCommand =
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

async function executeInspectorCommand(
  websocket: WebSocket,
  inspector: RuntimeDevtoolsInstrumentation | undefined,
  command: InspectorCommand,
): Promise<void> {
  if (websocket.readyState !== WebSocket.OPEN) return
  if (!inspector) {
    websocket.send(
      JSON.stringify({
        type: 'command.result',
        requestId: command.request.requestId,
        ok: false,
        error: {
          name: 'RuntimeInspectorUnavailableError',
          message: 'LUTRE_DEVTOOLS_INSPECTOR_UNAVAILABLE',
        },
      }),
    )
    return
  }
  try {
    const result =
      command.type === 'command.replay-capsule'
        ? await inspector.replayCapsule(command.request)
        : command.type === 'command.provider-playground'
          ? await inspector.providerPlayground(command.request)
          : await inspector.invokeProviderMethod(command.request)
    if (websocket.readyState !== WebSocket.OPEN) return
    websocket.send(
      JSON.stringify({
        type: 'command.result',
        requestId: command.request.requestId,
        ok: true,
        result,
      }),
    )
  } catch (error) {
    if (websocket.readyState !== WebSocket.OPEN) return
    websocket.send(
      JSON.stringify({
        type: 'command.result',
        requestId: command.request.requestId,
        ok: false,
        error: serializeDevtoolsError(error),
      }),
    )
  }
}

function parseInspectorCommand(value: string): InspectorCommand | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    return undefined
  }
  if (!isRecord(parsed) || !isRecord(parsed.request)) return undefined
  const request = parsed.request
  if (typeof request.requestId !== 'string') return undefined

  if (parsed.type === 'command.replay-capsule') {
    if (typeof request.capsuleId !== 'string') return undefined
    return {
      type: parsed.type,
      request: {
        requestId: request.requestId,
        capsuleId: request.capsuleId,
        ...('inputOverride' in request
          ? { inputOverride: request.inputOverride }
          : {}),
        ...(typeof request.parentTraceId === 'string'
          ? { parentTraceId: request.parentTraceId }
          : {}),
      },
    }
  }

  if (parsed.type === 'command.provider-playground') {
    if (typeof request.graphNodeId !== 'string') return undefined
    return {
      type: parsed.type,
      request: {
        requestId: request.requestId,
        graphNodeId: request.graphNodeId,
      },
    }
  }

  if (parsed.type === 'command.invoke-provider-method') {
    if (
      typeof request.graphNodeId !== 'string' ||
      typeof request.method !== 'string' ||
      !Array.isArray(request.args)
    ) {
      return undefined
    }
    return {
      type: parsed.type,
      request: {
        requestId: request.requestId,
        graphNodeId: request.graphNodeId,
        method: request.method,
        args: request.args,
      },
    }
  }

  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
