import { ConsoleLoggerBackend, Logger, type LoggerBackend } from './logger.js'
import { provide, type ProviderDescriptor } from './provider.js'
import { token } from './token.js'
import { loggerInstanceBrand, loggerTokenBrand } from './logger-identity.js'

export function isLoggerToken(value: unknown): boolean {
  // Loggerの派生クラスもrootにできるため、継承された印は予約tokenの判定に使わない。
  return (
    typeof value === 'function' &&
    Object.hasOwn(value, loggerTokenBrand) &&
    loggerTokenBrand in value &&
    value[loggerTokenBrand] === true
  )
}

export function isLogger(value: unknown): value is Logger {
  return (
    typeof value === 'object' &&
    value !== null &&
    loggerInstanceBrand in value &&
    value[loggerInstanceBrand] === true
  )
}

export const defaultLoggerToken = token<Logger>('loutre.logger.root')
const defaultBackendToken = token<LoggerBackend>('loutre.logger.backend')

export function defaultLoggerProviders(): readonly ProviderDescriptor[] {
  return [
    provide(defaultBackendToken).useFactory({
      use: () => new ConsoleLoggerBackend(),
    }),
    provide(defaultLoggerToken).useFactory({
      inject: [defaultBackendToken],
      use: (backend: LoggerBackend) => new Logger(backend),
    }),
  ]
}
