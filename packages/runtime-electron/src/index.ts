import {
  attachMessagePort,
  type MessagePortProtocolExecution,
  type MessagePortLike,
} from '@loutrejs/message-port'

export const electronRuntime = {
  runtime: 'electron-43',
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
} as const

export interface ElectronMessagePortMainLike {
  postMessage(value: unknown): void
  on(type: 'message', listener: (event: { readonly data: unknown }) => void): void
  start(): void
}

export interface ElectronMessagePortOptions {
  readonly environment?: unknown
}

export function attachElectronMessagePort(
  application: MessagePortProtocolExecution,
  port: MessagePortLike | ElectronMessagePortMainLike,
  _options: ElectronMessagePortOptions = {},
): void {
  const initialization = application.initialize()
  void initialization.catch(() => undefined)

  if ('addEventListener' in port) {
    attachMessagePort(application, port)
    return
  }
  attachMessagePort(application, {
    postMessage: (value) => port.postMessage(value),
    addEventListener: (_type, listener) => port.on('message', listener),
    start: () => port.start(),
  })
}
