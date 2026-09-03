import { contextKey, contract, layer } from '@loutrejs/loutre'
import {
  HandlerOf,
  MessageContextOf,
  messagePort,
} from '@loutrejs/loutre/message-port'
import { z } from 'zod'
interface Session {
  readonly userId: string
}
interface OtherSession {
  readonly accountId: string
}
const SESSION = contextKey<{ session: Session }>('session')
const OTHER_SESSION = contextKey<{ otherSession: OtherSession }>('otherSession')
const sessionLayer = layer({
  name: 'message-port-session',
  provide: SESSION,
  factory: () => async (_ctx, next) => {
    await next({ session: { userId: 'user-1' } })
  },
})
const Contract = contract([
  messagePort({
    run: {
      responses: {
        ok: { body: z.object({ userId: z.string() }) },
      },
      pipeline: [sessionLayer, messagePort.handler],
    },
  }),
])
type Handler = HandlerOf<typeof Contract, 'messagePort'>
declare const context: MessageContextOf<Handler, 'run'>
const session: Session = context.session
void session
// @ts-expect-error Pipelineがprovideしていないtokenは取得できない
context.otherSession
