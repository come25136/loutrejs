import {
  contract as legacyContract,
  defineApplication,
  defineModule,
  implementation as legacyImplementation,
  inject,
} from '@loutrejs/loutre'
import { http } from '@loutrejs/loutre/http'
import { messagePort as legacyMessagePort } from '@loutrejs/loutre/message-port'
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

export const EventsHttpContract = http.contract({
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
  },
})

export const EventsController = http.implementation({
  name: 'EventsController',
  contract: EventsHttpContract,
  factory: (streams = inject(EventStreamService)) => ({
    subscribe(ctx) {
      return ctx.response.events({ body: streams.events() })
    },
  }),
})

export const EventsMessagePortContract = legacyContract([
  legacyMessagePort({
    subscribe: {
      interaction: 'server-stream',
      responses: {
        events: {
          body: EventSchema,
          stream: 'server',
        },
      },
      pipeline: [legacyMessagePort.handler],
    },
  }),
])

export const EventsMessageHandler = legacyImplementation({
  name: 'EventsMessageHandler',
  contract: EventsMessagePortContract,
  protocol: legacyMessagePort,
  factory: (streams = inject(EventStreamService)) => ({
    subscribe(ctx) {
      return ctx.message.events(streams.events())
    },
  }),
})

export const EventsModule = defineModule(() => ({
  name: 'EventsModule',
  description: 'HTTP server-stream integration',
  providers: [EventStreamService],
  executions: [EventsController],
  implementations: [EventsMessageHandler],
}))

export function createEventsDefinition() {
  return defineApplication({
    modules: [EventsModule()],
  })
}
