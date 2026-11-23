import { application, module, inject } from '@loutrejs/loutre'
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
    subscribe() {
      return {
        schema: EventsHttpContract.subscribe.events,
        body: streams.events(),
      }
    },
  }),
})

export const EventsMessagePortContract = messagePort.contract({
  subscribe: {
    responses: {
      events: {
        body: EventSchema,
        stream: 'server',
      },
    },
  },
})

export const EventsMessageHandler = messagePort.implementation({
  name: 'EventsMessageHandler',
  contract: EventsMessagePortContract,
  factory: (streams = inject(EventStreamService)) => ({
    subscribe(ctx) {
      return ctx.response.events(streams.events())
    },
  }),
})

export const EventsHttpModule = module(() => ({
  name: 'EventsHttpModule',
  description: 'HTTP server-stream integration',
  providers: [EventStreamService],
  executions: [EventsController],
}))

export const EventsMessagePortModule = module(() => ({
  name: 'EventsMessagePortModule',
  description: 'MessagePort server-stream integration',
  providers: [EventStreamService],
  executions: [EventsMessageHandler],
}))

export function createEventsHttpDefinition() {
  return application({ modules: [EventsHttpModule()] })
}

export function createEventsMessagePortDefinition() {
  return application({ modules: [EventsMessagePortModule()] })
}
