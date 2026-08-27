export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogRecord {
  readonly timestamp: string
  readonly level: LogLevel
  readonly message: string
  readonly [key: string]: unknown
}

export interface LoggerBackend {
  write(record: LogRecord): void
}

export interface ConsoleLoggerBackendOptions {
  readonly colors?: boolean
  readonly prefix?: string
}

export class ConsoleLoggerBackend implements LoggerBackend {
  readonly #colors: boolean
  readonly #prefix: string

  constructor(options: ConsoleLoggerBackendOptions = {}) {
    this.#colors = options.colors ?? detectConsoleColors()
    this.#prefix = options.prefix ?? 'Loutre'
  }

  write(record: LogRecord): void {
    writeToConsole(
      record.level,
      formatConsoleLogRecord(record, this.#prefix, this.#colors),
    )
  }
}

export class JsonConsoleLoggerBackend implements LoggerBackend {
  write(record: LogRecord): void {
    writeToConsole(record.level, serializeLogRecord(record))
  }
}

class SilentLoggerBackend implements LoggerBackend {
  write(_record: LogRecord): void {}
}

export class Logger {
  constructor(
    readonly backend: LoggerBackend = new ConsoleLoggerBackend(),
    readonly context: Readonly<Record<string, unknown>> = {},
  ) {}

  child(context: Readonly<Record<string, unknown>>): Logger {
    return new Logger(this.backend, { ...this.context, ...context })
  }

  debug(
    message: string,
    context: Readonly<Record<string, unknown>> = {},
  ): void {
    this.#write('debug', message, context)
  }

  info(message: string, context: Readonly<Record<string, unknown>> = {}): void {
    this.#write('info', message, context)
  }

  warn(message: string, context: Readonly<Record<string, unknown>> = {}): void {
    this.#write('warn', message, context)
  }

  error(
    message: string,
    context: Readonly<Record<string, unknown>> = {},
  ): void {
    this.#write('error', message, context)
  }

  #write(
    level: LogLevel,
    message: string,
    context: Readonly<Record<string, unknown>>,
  ): void {
    this.backend.write({
      ...this.context,
      ...context,
      timestamp: new Date().toISOString(),
      level,
      message,
    })
  }
}

export class SilentLogger extends Logger {
  constructor(context: Readonly<Record<string, unknown>> = {}) {
    super(new SilentLoggerBackend(), context)
  }
}

function serializeLogRecord(record: LogRecord): string {
  const seen = new WeakSet<object>()
  try {
    return JSON.stringify(record, (_key, value: unknown) => {
      if (typeof value === 'bigint') return value.toString()
      if (value instanceof Error) {
        return {
          name: value.name,
          message: value.message,
          ...(value.stack === undefined ? {} : { stack: value.stack }),
          ...(value.cause === undefined ? {} : { cause: value.cause }),
        }
      }
      if (value !== null && typeof value === 'object') {
        if (seen.has(value)) return '[Circular]'
        seen.add(value)
      }
      return value
    })
  } catch (error) {
    return JSON.stringify({
      timestamp: record.timestamp,
      level: 'error',
      message: 'Log record serialization failed',
      serializationError:
        error instanceof Error ? error.message : String(error),
    })
  }
}

function writeToConsole(level: LogLevel, value: string): void {
  const target =
    level === 'error'
      ? console.error
      : level === 'warn'
        ? console.warn
        : console.log
  target(value)
}

function formatConsoleLogRecord(
  record: LogRecord,
  prefix: string,
  colors: boolean,
): string {
  const { timestamp, level, message, ...recordContext } = record
  const context: Record<string, unknown> = { ...recordContext }
  const source =
    typeof context.source === 'string'
      ? context.source
      : typeof context.protocol === 'string'
        ? context.protocol
        : undefined
  if (source !== undefined) delete context.source

  const runtimeProcess = getRuntimeProcess()
  const processLabel =
    runtimeProcess?.pid === undefined
      ? `[${prefix}]`
      : `[${prefix}] ${runtimeProcess.pid}`
  const levelLabel = level === 'info' ? 'LOG' : level.toUpperCase()
  const levelColor =
    level === 'error' ? 31 : level === 'warn' ? 33 : level === 'debug' ? 36 : 32
  const sourceLabel =
    source === undefined ? '' : `${paint(`[${source}]`, 33, colors)} `
  const formattedContext = formatLogContext(context)
  const contextSuffix =
    formattedContext === '' ? '' : ` ${paint(formattedContext, 90, colors)}`

  return `${paint(processLabel, 32, colors)}  - ${formatLocalTimestamp(timestamp)}  ${paint(levelLabel.padStart(7), levelColor, colors)} ${sourceLabel}${paint(message, levelColor, colors)}${contextSuffix}`
}

function formatLogContext(context: Readonly<Record<string, unknown>>): string {
  const entries = Object.entries(context)
  if (entries.length === 0) return ''
  return `{ ${entries
    .map(([key, value]) => `${formatLogKey(key)}=${formatLogValue(value)}`)
    .join(', ')} }`
}

function formatLogKey(key: string): string {
  return /^[A-Za-z_$][\w$]*$/u.test(key) ? key : JSON.stringify(key)
}

function formatLogValue(
  value: unknown,
  ancestors = new WeakSet<object>(),
): string {
  try {
    if (value === null) return 'null'
    if (value === undefined) return 'undefined'
    if (typeof value === 'string') {
      return /^[\w./:@+-]+$/u.test(value) ? value : JSON.stringify(value)
    }
    if (typeof value === 'number' || typeof value === 'boolean')
      return String(value)
    if (typeof value === 'bigint') return `${value}n`
    if (typeof value === 'symbol') return String(value)
    if (typeof value === 'function')
      return `[Function ${value.name || 'anonymous'}]`
    if (ancestors.has(value)) return '[Circular]'

    ancestors.add(value)
    try {
      if (value instanceof Date) return value.toISOString()
      if (value instanceof Error) {
        return formatLogValue(
          {
            name: value.name,
            message: value.message,
            ...(value.stack === undefined ? {} : { stack: value.stack }),
            ...(value.cause === undefined ? {} : { cause: value.cause }),
          },
          ancestors,
        )
      }
      if (Array.isArray(value)) {
        return `[${value.map((item) => formatLogValue(item, ancestors)).join(', ')}]`
      }
      return `{ ${Object.entries(value)
        .map(
          ([key, item]) =>
            `${formatLogKey(key)}=${formatLogValue(item, ancestors)}`,
        )
        .join(', ')} }`
    } finally {
      ancestors.delete(value)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return `[Unformattable: ${message}]`
  }
}

function formatLocalTimestamp(timestamp: string): string {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return timestamp
  return (
    [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('/') +
    ` ${[
      String(date.getHours()).padStart(2, '0'),
      String(date.getMinutes()).padStart(2, '0'),
      String(date.getSeconds()).padStart(2, '0'),
    ].join(':')}.${String(date.getMilliseconds()).padStart(3, '0')}`
  )
}

function paint(value: string, color: number, enabled: boolean): string {
  return enabled ? `\u001B[${color}m${value}\u001B[39m` : value
}

interface RuntimeProcess {
  readonly pid?: number
  readonly stdout?: { readonly isTTY?: boolean }
  readonly env?: Readonly<Record<string, string | undefined>>
}

function getRuntimeProcess(): RuntimeProcess | undefined {
  return (
    globalThis as typeof globalThis & { readonly process?: RuntimeProcess }
  ).process
}

function detectConsoleColors(): boolean {
  const runtimeProcess = getRuntimeProcess()
  const environment = runtimeProcess?.env
  if (
    environment?.NO_COLOR !== undefined ||
    environment?.NODE_DISABLE_COLORS !== undefined
  ) {
    return false
  }
  if (environment?.FORCE_COLOR !== undefined) {
    return environment.FORCE_COLOR !== '0'
  }
  return runtimeProcess?.stdout?.isTTY === true
}
