import { contract, defineLayer } from '@loutrejs/loutre'
import {
  HandlerOf,
  MessageContextOf,
  messagePort,
} from '@loutrejs/loutre/message-port'
import { z } from 'zod'

interface Session {
  readonly userId: string
}

const sessionLayer = defineLayer({ name: 'message-port-session' }).factory<{
  session: Session
}>(() => async (_ctx, next) => {
  await next({ session: { userId: 'user-1' } })
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
const session: Session = context.state.session
void session
// @ts-expect-error Pipelineがprovideしていないstateは取得できない
context.state.otherSession
