import type { LoggerService, LogLevel } from './logger.js'

export function bindLoggerSource(
  logger: LoggerService,
  source: string,
): LoggerService {
  const context = { ...logger.context, source }
  const bind =
    (level: LogLevel) =>
    (message: string, fields: Readonly<Record<string, unknown>> = {}) =>
      logger[level](message, { source, ...fields })
  const methods = {
    debug: bind('debug'),
    info: bind('info'),
    warn: bind('warn'),
    error: bind('error'),
  }
  return new Proxy(logger, {
    get(target, property) {
      switch (property) {
        case 'context':
          return context
        case 'debug':
          return methods.debug
        case 'info':
          return methods.info
        case 'warn':
          return methods.warn
        case 'error':
          return methods.error
      }
      // private fieldを持つ実装のreceiverをproxyへ置き換えない。
      const value = Reflect.get(target, property, target)
      return typeof value === 'function' && property !== 'constructor'
        ? value.bind(target)
        : value
    },
  })
}
