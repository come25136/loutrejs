import { z } from 'zod'
import {
  defineApplication,
  defineEnv,
  defineModule,
  inject,
  provide,
  LoggerToken,
} from '@loutrejs/loutre'
import { http } from '@loutrejs/loutre/http'
import {
  Logger,
  type LoggerBackend,
  type LogRecord,
} from '@loutrejs/loutre/runtime'

class LogEnv extends defineEnv(z.object({ LABEL: z.string() })) {}

export class Backend implements LoggerBackend {
  readonly environment = inject(LogEnv)
  readonly records: LogRecord[] = []
  ready = false
  disposed = false
  onModuleInit() {
    this.ready = true
  }
  write(record: LogRecord) {
    if (!this.ready || this.disposed) throw new Error('Backend is not ready.')
    this.records.push({ ...record, label: this.environment.LABEL })
  }
  onApplicationDispose() {
    this.disposed = true
  }
}

class ApplicationLogger extends Logger {
  constructor(backend = inject(Backend)) {
    super(backend)
  }
}

class WorkerService {
  readonly logger = inject(LoggerToken)
  onModuleInit() {
    this.logger.info('service.init')
  }
  onApplicationShutdown() {
    this.logger.info('service.shutdown')
  }
}

const middleware = http.middleware({
  name: 'LoggingMiddleware',
  factory:
    (logger = inject(LoggerToken)) =>
    async (_context, next) => {
      logger.info('middleware')
      return next()
    },
})
const endpoint = http.implementation({
  name: 'LoggingEndpoint',
  contract: http.contract({
    health: {
      method: 'GET',
      path: '/',
      middlewares: [middleware],
      responses: { ok: { status: 204 } },
    },
  }),
  factory: (logger = inject(LoggerToken)) => ({
    health(context) {
      logger.info('execution')
      return context.response.ok({})
    },
  }),
})
const Logging = defineModule({
  environment: [LogEnv],
  providers: [Backend, provide(LoggerToken).useClass(ApplicationLogger)],
  exports: [LoggerToken],
})
const App = defineModule({ providers: [WorkerService], executions: [endpoint] })

export default defineApplication({
  modules: [App, Logging],
})
