import { runtimeSupportFeatures } from '../runtime/capability.js'
import {
  createKernelApplication,
  type ApplicationDefinition,
  type BootstrapArguments,
  type KernelHostedApplication,
  type RequireApplicationExtension,
} from '../application/index.js'
import type { RuntimeCapabilityBinding } from '../core/index.js'
import {
  messagePortExtension,
  attachMessagePort,
} from '../message-port/index.js'
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
  capabilities: runtimeSupportFeatures([
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
    const hosted: typeof application & {
      readonly messagePort?: MessagePortHostApi
    } = application
    if (!hosted.messagePort)
      throw new Error('LUTRE_RUNTIME_MESSAGE_PORT_REQUIRED')
    return hosted.messagePort.invoke(method, input)
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
  attachMessagePort({ invoke }, normalizeMessagePort(port))
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
