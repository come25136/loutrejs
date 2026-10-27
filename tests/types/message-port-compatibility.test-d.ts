import type { MessagePort as NodeMessagePort } from 'node:worker_threads'
import {
  attachMessagePort,
  type MessagePortHost,
  type MessagePortLike,
} from '@loutrejs/loutre/message-port'

declare const host: MessagePortHost
declare const nodePort: NodeMessagePort
declare const browserPort: MessagePort
declare const eventTargetPort: Pick<EventTarget, 'addEventListener'> & {
  postMessage(value: unknown): void
}
declare const messageOnlyPort: {
  postMessage(value: unknown): void
  addEventListener(
    type: 'message',
    listener: (event: { readonly data: unknown }) => void,
  ): void
}

// Node.js 22のEventTarget型と、message専用の型を同じ受信境界へ渡せる。
const ports: readonly MessagePortLike[] = [
  nodePort,
  browserPort,
  eventTargetPort,
  messageOnlyPort,
]
for (const port of ports) attachMessagePort(host, port)
