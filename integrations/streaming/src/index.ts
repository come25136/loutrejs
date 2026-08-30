import { defineApplication } from '@loutrejs/loutre'
import {
  contract,
  defineModule,
  implementation,
  inject,
} from '@loutrejs/loutre'
import { http } from '@loutrejs/loutre/http'
import { messagePort } from '@loutrejs/loutre/message-port'
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
export const EventsContract = contract([
  http({
    subscribe: {
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
    },
  }),
  messagePort({
    subscribe: {
      interaction: 'server-stream',
      responses: {
        events: {
          body: EventSchema,
          stream: 'server',
        },
      },
      pipeline: [messagePort.handler],
    },
  }),
])
export const EventsController = implementation({
  name: 'EventsController',
  contract: EventsContract,
  protocol: http,
  factory: (streams = inject(EventStreamService)) => ({
    subscribe(ctx) {
      return ctx.response.events({ body: streams.events() })
    },
  }),
})
export const EventsMessageHandler = implementation({
  name: 'EventsMessageHandler',
  contract: EventsContract,
  protocol: messagePort,
  factory: (streams = inject(EventStreamService)) => ({
    subscribe(ctx) {
      return ctx.message.events(streams.events())
    },
  }),
})
export const EventsModule = defineModule(() => ({
  name: 'EventsModule',
  description: 'HTTP server-stream example',
  providers: [EventStreamService],
  implementations: [EventsController, EventsMessageHandler],
}))
export function createEventsDefinition() {
  return defineApplication({
    modules: [EventsModule()],
  })
}
