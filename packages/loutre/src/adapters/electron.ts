import {
  binding,
  type ApplicationDefinition,
  type BootstrapArguments,
  type HasMessagePort,
  type InvocationApplication,
  type InvocationBindingOptions,
} from '../application/index.js'
import {
  attachMessagePort,
  type MessagePortProtocolExecution,
  type MessagePortLike,
} from '../message-port/index.js'

type IsAny<TValue> = 0 extends 1 & TValue ? true : false

type MessagePortApplication<TDefinition extends ApplicationDefinition> =
  IsAny<TDefinition> extends true
    ? TDefinition
    : HasMessagePort<TDefinition> extends true
      ? TDefinition
      : never

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
  readonly application: InvocationApplication<TDefinition>
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
  const invocation = binding.invocation({
    application: options.application,
    environment:
      'environment' in options
        ? options.environment
        : typeof process === 'undefined'
          ? undefined
          : process.env,
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
    application: invocation.application,
    close: (signal) => invocation.application.close(signal),
  }
}

function attachElectronMessagePort(
  application: MessagePortProtocolExecution,
  port: MessagePortLike | ElectronMessagePortMainLike,
): void {
  const initialization = application.initialize()
  void initialization.catch(() => undefined)

  if ('addEventListener' in port) {
    attachMessagePort(application, port)
    return
  }
  attachMessagePort(application, {
    postMessage: (value: unknown) => port.postMessage(value),
    addEventListener: (
      _type: string,
      listener: (event: { readonly data: unknown }) => void,
    ) => port.on('message', listener),
    start: () => port.start(),
  })
}
