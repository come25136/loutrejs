import {
  binding,
  createKernelApplication,
  type ApplicationDefinition,
  type ApplicationExtensionHostApis,
  type BootstrapArguments,
  type HasMessagePort,
  type InvocationApplication,
  type InvocationBindingOptions,
  type KernelHostedApplication,
} from '../application/index.js'
import {
  attachMessagePort,
  type MessagePortProtocolExecution,
  type MessagePortLike,
} from '../message-port/index.js'
import { assertRuntimeEngine } from '../runtime/engine.js'

type IsAny<TValue> = 0 extends 1 & TValue ? true : false

type HasMessagePortExecutionExtension<
  TDefinition extends ApplicationDefinition,
> = 'messagePort' extends keyof ApplicationExtensionHostApis<TDefinition>
  ? true
  : false

type MessagePortApplication<TDefinition extends ApplicationDefinition> =
  IsAny<TDefinition> extends true
    ? TDefinition
    : HasMessagePort<TDefinition> extends true
      ? TDefinition
      : HasMessagePortExecutionExtension<TDefinition> extends true
        ? TDefinition
        : never

type ElectronHostedApplication<TDefinition extends ApplicationDefinition> =
  HasMessagePortExecutionExtension<TDefinition> extends true
    ? KernelHostedApplication<TDefinition>
    : InvocationApplication<TDefinition>

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
} & BootstrapArguments<TDefinition>

export interface ElectronAttachment<
  TDefinition extends ApplicationDefinition = ApplicationDefinition,
> {
  readonly application: ElectronHostedApplication<TDefinition>
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
  const environment =
    'environment' in options
      ? options.environment
      : typeof process === 'undefined'
        ? undefined
        : process.env
  const usesMessagePortExecutionExtension = options.application.model.extensions
    .values()
    .some((group) => group.extension.host?.namespace === 'messagePort')

  if (usesMessagePortExecutionExtension) {
    const application = createKernelApplication({
      application: options.application,
      environment,
      ...('arguments' in options ? { arguments: options.arguments } : {}),
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
      application: application as ElectronHostedApplication<TDefinition>,
      close: (signal) => application.close(signal),
    }
  }

  const invocation = binding.invocation({
    application: options.application,
    environment,
    ...('arguments' in options ? { arguments: options.arguments } : {}),
  } as unknown as InvocationBindingOptions<TDefinition>)
  const messagePort =
    'messagePort' in invocation
      ? (invocation.messagePort as MessagePortProtocolExecution)
      : undefined
  if (!messagePort) {
    void invocation.application.close()
    throw new Error(
      'LUTRE_RUNTIME_MESSAGE_PORT_REQUIRED: electronRuntime.attach() requires a MessagePort-capable Application.',
    )
  }

  attachElectronMessagePort(messagePort, options.port)
  return {
    application:
      invocation.application as ElectronHostedApplication<TDefinition>,
    close: (signal) => invocation.application.close(signal),
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

function attachElectronMessagePort(
  application: MessagePortProtocolExecution,
  port: MessagePortLike | ElectronMessagePortMainLike,
): void {
  const initialization = application.initialize()
  void initialization.catch(() => undefined)

  attachMessagePort(application, normalizeMessagePort(port))
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
      _type: string,
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
