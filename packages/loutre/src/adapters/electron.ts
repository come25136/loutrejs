import {
  createKernelApplication,
  type ApplicationDefinition,
  type BootstrapArguments,
  type KernelHostedApplication,
  type RequireApplicationExtension,
} from '../application/index.js'
import type { RuntimeCapabilityBinding } from '../core/index.js'
import { messagePortExtension } from '../message-port/index.js'
import { assertRuntimeEngine } from '../runtime/engine.js'

type MessagePortApplication<TDefinition extends ApplicationDefinition> =
  RequireApplicationExtension<TDefinition, typeof messagePortExtension>

export interface MessagePortLike {
  postMessage(value: unknown): void
  addEventListener(
    type: 'message',
    listener: (event: { readonly data: unknown }) => void,
  ): void
  start?(): void
}

export interface ElectronMessagePortMainLike {
  postMessage(value: unknown): void
  on(
    type: 'message',
    listener: (event: { readonly data: unknown }) => void,
  ): void
  start(): void
}

export type ElectronAttachOptions<TDefinition extends ApplicationDefinition> = {
  readonly application: MessagePortApplication<TDefinition>
  readonly port: MessagePortLike | ElectronMessagePortMainLike
  readonly environment?: unknown
  readonly capabilities?: readonly RuntimeCapabilityBinding[]
} & BootstrapArguments<TDefinition>

export interface ElectronAttachment<
  TDefinition extends ApplicationDefinition = ApplicationDefinition,
> {
  readonly application: KernelHostedApplication<TDefinition>
  close(signal?: string): Promise<void>
}

export const electronRuntime = {
  runtime: 'electron',
  capabilities: new Set([
    'messagePort.send',
    'messagePort.receive',
    'messagePort.transfer',
    'stream.readable',
    'runtime.longLived',
    'runtime.shutdownHook',
    'env.runtime',
    'crypto.random',
  ]),
  attach,
} as const

function attach<const TDefinition extends ApplicationDefinition>(
  options: ElectronAttachOptions<TDefinition>,
): ElectronAttachment<TDefinition> {
  assertRuntimeEngine('electron')
  if (
    options.application.model.extensions.get(messagePortExtension) === undefined
  ) {
    throw new Error(
      'LUTRE_RUNTIME_MESSAGE_PORT_REQUIRED: electronRuntime.attach() requires the MessagePort Execution Extension.',
    )
  }

  const environment =
    'environment' in options
      ? options.environment
      : typeof process === 'undefined'
        ? undefined
        : process.env
  const application = createKernelApplication<TDefinition>({
    ...options,
    application: options.application,
    environment,
  })
  const initialization = application.init()
  void initialization.catch(() => undefined)
  attachElectronMessagePortInvocation(async (method, input) => {
    await initialization
    const host = (
      application as unknown as {
        readonly messagePort: MessagePortHostApi
      }
    ).messagePort
    return host.invoke(method, input)
  }, options.port)
  return {
    application,
    close: (signal) => application.close(signal),
  }
}

interface MessagePortHostResult {
  readonly response: string
  readonly value: unknown
}

interface MessagePortHostApi {
  invoke(method: string, input?: unknown): Promise<MessagePortHostResult>
}

function attachElectronMessagePortInvocation(
  invoke: (method: string, input?: unknown) => Promise<MessagePortHostResult>,
  port: MessagePortLike | ElectronMessagePortMainLike,
): void {
  const normalized = normalizeMessagePort(port)
  normalized.addEventListener('message', async (event) => {
    const request = event.data as {
      readonly id: string
      readonly procedure: string
      readonly input?: unknown
    }
    try {
      const result = await invoke(request.procedure, request.input)
      if (isAsyncIterable(result.value)) {
        for await (const value of result.value) {
          postToMessagePort(normalized, {
            id: request.id,
            response: result.response,
            value,
            done: false,
          })
        }
        postToMessagePort(normalized, {
          id: request.id,
          response: result.response,
          done: true,
        })
      } else {
        postToMessagePort(normalized, {
          id: request.id,
          response: result.response,
          value: result.value,
          done: true,
        })
      }
    } catch (error) {
      postToMessagePort(normalized, {
        id: request.id,
        error: error instanceof Error ? error.message : String(error),
        done: true,
      })
    }
  })
  normalized.start?.()
}

function postToMessagePort(port: MessagePortLike, value: unknown): void {
  port.postMessage(value)
}

function normalizeMessagePort(
  port: MessagePortLike | ElectronMessagePortMainLike,
): MessagePortLike {
  if ('addEventListener' in port) return port
  return {
    postMessage: (value: unknown) => port.postMessage(value),
    addEventListener: (
      _type: 'message',
      listener: (event: { readonly data: unknown }) => void,
    ) => port.on('message', listener),
    start: () => port.start(),
  }
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Symbol.asyncIterator in value &&
    typeof value[Symbol.asyncIterator] === 'function'
  )
}
