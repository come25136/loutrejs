import {
  ConsoleLoggerBackend,
  LoggerService,
  LoggerToken,
  type LoggerBackend,
} from './logger.js'
import { inject } from './injection.js'
import { provide, type ProviderDescriptor } from './provider.js'
import { token } from './token.js'
import {
  loggerInstanceBrand,
  isLoggerTokenIdentity,
} from './logger-identity.js'

export function isLoggerToken(value: unknown): value is typeof LoggerService {
  // Loggerの派生クラスもrootにできるため、継承された印は予約tokenの判定に使わない。
  return isLoggerTokenIdentity(value)
}

export function isLogger(value: unknown): value is LoggerService {
  return (
    typeof value === 'object' &&
    value !== null &&
    loggerInstanceBrand in value &&
    value[loggerInstanceBrand] === true
  )
}

const defaultBackendToken = token<LoggerBackend>('loutre.logger.backend')

class DefaultLogger extends LoggerService {
  constructor(backend = inject(defaultBackendToken)) {
    super(backend)
  }
}

export function defaultLoggerProviders(): readonly ProviderDescriptor[] {
  return [
    provide(defaultBackendToken).useClass(ConsoleLoggerBackend),
    provide(LoggerToken).useClass(DefaultLogger),
  ]
}
