import { contextKey, contract, layer, procedure } from '@loutrejs/core'
import {
  HandlerOf,
  MessageContextOf,
  messagePort,
} from '@loutrejs/message-port'
import { z } from 'zod'

interface Session {
  readonly userId: string
}

interface OtherSession {
  readonly accountId: string
}

const SESSION = contextKey('session').of<Session>()
const OTHER_SESSION = contextKey('otherSession').of<OtherSession>()
const sessionLayer = layer({
  name: 'message-port-session',
  provides: [SESSION],
  factory: () => async (_ctx, next) => {
    await next({ session: { userId: 'user-1' } })
  },
})

const Contract = contract({
  run: procedure({
    protocols: {
      messagePort: messagePort({
        responses: {
          ok: { body: z.object({ userId: z.string() }) },
        },
        pipeline: [sessionLayer, messagePort.handler],
      }),
    },
  }),
})

type Handler = HandlerOf<typeof Contract, 'messagePort'>
declare const context: MessageContextOf<Handler, 'run'>

const session: Session = context.session
void session

// @ts-expect-error Pipelineがprovideしていないtokenは取得できない
context.otherSession
