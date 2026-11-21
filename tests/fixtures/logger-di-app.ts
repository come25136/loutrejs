import { z } from 'zod'
import {
  application,
  env,
  module,
  inject,
  provide,
  LoggerToken,
} from '@loutrejs/loutre'
import { http } from '@loutrejs/loutre/http'
import {
  LoggerService,
  type LoggerBackend,
  type LogRecord,
} from '@loutrejs/loutre/runtime'

class LogEnv extends env(z.object({ LABEL: z.string() })) {}

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

class ApplicationLogger extends LoggerService {
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
const routeContract = http.contract({
  health: {
    method: 'GET',
    path: '/',
    middlewares: [middleware],
    responses: { ok: { status: 204 } },
  },
})
const endpoint = http.implementation({
  name: 'LoggingEndpoint',
  contract: routeContract,
  factory: (logger = inject(LoggerToken)) => ({
    health() {
      logger.info('execution')
      return { schema: routeContract.health.ok }
    },
  }),
})
const Logging = module({
  environment: [LogEnv],
  providers: [Backend, provide(LoggerToken).useClass(ApplicationLogger)],
  exports: [LoggerToken],
})
const App = module({ providers: [WorkerService], executions: [endpoint] })

export default application({
  modules: [App, Logging],
})
