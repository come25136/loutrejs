import type { LoggerService, LogLevel } from './logger.js'
import { isLogger } from '../core/logger-internal.js'
import {
  loggerInstanceBrand,
  loggerSourceRoot,
} from '../core/logger-identity.js'

export function loggerLifecycleOwner(value: LoggerService): LoggerService
export function loggerLifecycleOwner(value: unknown): unknown
export function loggerLifecycleOwner(value: unknown): unknown {
  if (!isLogger(value) || !(loggerSourceRoot in value)) return value
  let owner: LoggerService = value
  const visited = new Set<LoggerService>()
  while (loggerSourceRoot in owner && !visited.has(owner)) {
    visited.add(owner)
    const root = owner[loggerSourceRoot]
    if (!isLogger(root)) break
    owner = root
  }
  return owner
}

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
  const reference: LoggerService & {
    readonly [loggerSourceRoot]: LoggerService
  } = {
    [loggerInstanceBrand]: true,
    [loggerSourceRoot]: loggerLifecycleOwner(logger),
    backend: logger.backend,
    context,
    ...methods,
    onApplicationDispose: () => logger.onApplicationDispose(),
  }
  Object.setPrototypeOf(reference, Reflect.getPrototypeOf(logger))
  // 凍結した元の実体を対象にすると、出力メソッドとcontextを委譲用に置き換えられない。
  return new Proxy(reference, {
    get(target, property) {
      if (Object.hasOwn(target, property)) return Reflect.get(target, property)
      // private fieldを持つ実装のreceiverをproxyへ置き換えない。
      const value = Reflect.get(logger, property, logger)
      return typeof value === 'function' && property !== 'constructor'
        ? value.bind(logger)
        : value
    },
  })
}
