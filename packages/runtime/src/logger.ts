export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogRecord {
  readonly level: LogLevel
  readonly message: string
  readonly [key: string]: unknown
}

export interface LoggerBackend {
  write(record: LogRecord): void
}

export class ConsoleLoggerBackend implements LoggerBackend {
  write(record: LogRecord): void {
    const target = record.level === 'error' ? console.error : console.log
    target(JSON.stringify(record))
  }
}

export class Logger {
  constructor(
    readonly backend: LoggerBackend = new ConsoleLoggerBackend(),
    readonly context: Readonly<Record<string, unknown>> = {},
  ) {}

  child(context: Readonly<Record<string, unknown>>): Logger {
    return new Logger(this.backend, { ...this.context, ...context })
  }

  debug(message: string, context: Readonly<Record<string, unknown>> = {}): void {
    this.#write('debug', message, context)
  }

  info(message: string, context: Readonly<Record<string, unknown>> = {}): void {
    this.#write('info', message, context)
  }

  warn(message: string, context: Readonly<Record<string, unknown>> = {}): void {
    this.#write('warn', message, context)
  }

  error(message: string, context: Readonly<Record<string, unknown>> = {}): void {
    this.#write('error', message, context)
  }

  #write(
    level: LogLevel,
    message: string,
    context: Readonly<Record<string, unknown>>,
  ): void {
    this.backend.write({ level, message, ...this.context, ...context })
  }
}
