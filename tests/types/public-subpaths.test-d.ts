import { messagePort } from '@loutrejs/loutre/message-port'
import { task } from '@loutrejs/loutre/tasks'
import { websocket } from '@loutrejs/loutre/websocket'

void messagePort
void task
void websocket

// @ts-expect-error 内部実装はpackage subpathとして公開しない。
await import('@loutrejs/loutre/tasks/extension')
// @ts-expect-error protocol-neutral lifecycle primitiveはpublic APIにしない。
await import('@loutrejs/loutre/runtime/ingress-gate')
