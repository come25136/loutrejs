import {
  contract,
  defineModule,
  implement,
  procedure,
} from '@loutrejs/core'
import {
  ContextOf,
  ControllerOf,
  createHttpApplication,
  http,
} from '@loutrejs/http'
import {
  HandlerOf,
  MessageContextOf,
  createMessagePortApplication,
  messagePort,
} from '@loutrejs/message-port'
import { z } from 'zod'

export interface DomainEvent {
  readonly sequence: number
  readonly message: string
}

export class EventStreamService {
  async *events(): AsyncIterable<DomainEvent> {
    for (let sequence = 1; sequence <= 3; sequence += 1) {
      yield { sequence, message: `event-${sequence}` }
    }
  }
}

const EventSchema = z.object({
  sequence: z.number().int(),
  message: z.string(),
})

export const EventsContract = contract({
  subscribe: procedure({
    protocols: {
      http: http({
        method: 'GET',
        path: '/events',
        interaction: 'server-stream',
        responses: {
          events: {
            status: 200,
            body: EventSchema,
            stream: 'server',
          },
        },
        pipeline: [http.controller],
      }),
      messagePort: messagePort({
        interaction: 'server-stream',
        responses: {
          events: {
            body: EventSchema,
            stream: 'server',
          },
        },
        pipeline: [messagePort.handler],
      }),
    },
  }),
})

type EventsHttp = ControllerOf<typeof EventsContract, 'http'>

export class EventsController implements EventsHttp {
  constructor(readonly streams: EventStreamService) {}

  subscribe(ctx: ContextOf<EventsHttp, 'subscribe'>) {
    return ctx.response.events({
      body: this.streams.events(),
    })
  }
}

type EventsMessagePort = HandlerOf<typeof EventsContract, 'messagePort'>

export class EventsMessageHandler implements EventsMessagePort {
  constructor(readonly streams: EventStreamService) {}

  subscribe(ctx: MessageContextOf<EventsMessagePort, 'subscribe'>) {
    return ctx.message.events(this.streams.events())
  }
}

export const EventsModule = defineModule(() => ({
  description: 'HTTP server-stream canonical fixture',
  providers: [EventStreamService],
  implementations: [
    implement(EventsContract).for(http).with(EventsController),
    implement(EventsContract).for(messagePort).with(EventsMessageHandler),
  ],
}))

export function createEventsApplication() {
  return createHttpApplication({
    modules: [EventsModule()],
  })
}

export function createEventsMessagePortApplication() {
  return createMessagePortApplication({
    modules: [EventsModule()],
  })
}
