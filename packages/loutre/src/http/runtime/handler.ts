import { type CompiledHttpContractRoute } from '../compiled.js'
import { isHttpHeaders } from '../codecs/response.js'
import { isHttpInputRecord } from '../result.js'
import { type RuntimeHttpHandlers } from './types.js'
import { match as patternMatch } from 'ts-pattern'
import {
  assertDeclaredExecutionMethods,
  resolveExecutionMethod,
} from '../../core/index.js'

export function createHttpHandlers(
  value: unknown,
  routes: readonly CompiledHttpContractRoute[],
): RuntimeHttpHandlers {
  if (!isHttpInputRecord(value)) {
    throw new TypeError('HTTP factoryはhandlerのオブジェクトを返してください。')
  }
  assertDeclaredExecutionMethods(
    value,
    routes.map((route) => route.name),
  )
  const handlers = new Map<string, RuntimeHttpHandlers[string]>()
  for (const { name, definition } of routes) {
    const responses = new Map<object, string>(
      Object.entries(definition.responses)
        .filter(([, response]) => !response.error)
        .map(([key, response]) => [response, key]),
    )
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
      if (!isHttpInputRecord(result) || !isHttpInputRecord(result.schema)) {
        throw new TypeError(
          `HTTP handler ${name} must return a declared response reference.`,
        )
      }
      const response = responses.get(result.schema)
      if (response === undefined)
        throw new TypeError(`Invalid HTTP response reference for ${name}.`)
      const bodySchema = definition.responses[response]!.body
      if (bodySchema && !Object.hasOwn(result, 'body'))
        throw new TypeError(`Missing HTTP response body for ${name}.`)
      if (!bodySchema && result.body !== undefined)
        throw new TypeError(`Undeclared HTTP response body for ${name}.`)
      if (result.headers !== undefined && !isHttpHeaders(result.headers))
        throw new TypeError(`Invalid HTTP response headers for ${name}.`)
      return {
        kind: 'http-result',
        response,
        body: result.body,
        ...(result.headers === undefined ? {} : { headers: result.headers }),
      }
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
