import { isHttpInputRecord, isHttpExecutionResult } from '../result.js'
import { type RuntimeHttpHandlers } from './types.js'
import { match as patternMatch } from 'ts-pattern'
import { resolveExecutionMethod } from '../../core/index.js'

export function createHttpHandlers(
  value: unknown,
  names: readonly string[],
): RuntimeHttpHandlers {
  if (!isHttpInputRecord(value)) {
    throw new TypeError('HTTP factoryはhandlerのオブジェクトを返してください。')
  }
  const handlers = new Map<string, RuntimeHttpHandlers[string]>()
  for (const name of names) {
    const handler = resolveExecutionMethod(value, name)
    if (!handler) {
      throw new TypeError(`HTTP handler ${name}は関数である必要があります。`)
    }
    handlers.set(name, async (context) => {
      const input = patternMatch(context)
        .with({ kind: 'contract' }, (invocation) => invocation)
        .with({ kind: 'raw' }, () => {
          throw new Error('契約付きHTTP handlerには契約付きcontextが必要です。')
        })
        .exhaustive()
      const result: unknown = await handler(input)
      if (!isHttpExecutionResult(result)) {
        throw new TypeError(
          `HTTP handler ${name}はHTTP resultを返してください。`,
        )
      }
      return result
    })
  }
  return Object.fromEntries(handlers)
}

export function createRawHttpHandlers(
  resolve: () => unknown,
): RuntimeHttpHandlers {
  return {
    async raw(context) {
      const { request, execution, signal, state } = patternMatch(context)
        .with({ kind: 'raw' }, (value) => value)
        .with({ kind: 'contract' }, () => {
          throw new Error('Raw HTTP handlerにはraw contextが必要です。')
        })
        .exhaustive()
      const handler = resolve()
      if (typeof handler !== 'function') {
        throw new TypeError('Raw HTTP handlerは関数である必要があります。')
      }
      const result: unknown = await handler({
        request,
        execution,
        signal,
        state,
      })
      if (!(result instanceof Response)) {
        throw new TypeError('Raw HTTP handlerはResponseを返してください。')
      }
      return result
    },
  }
}
