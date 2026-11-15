import {
  type MessagePortResult,
  type MessagePortContext,
  type MessagePortInvocationResult,
  type MessagePortExtensionRuntime,
} from '../contract.js'
import {
  type ExecutionRuntimeBinding,
  type ExecutionKernelRuntime,
  validateSchema,
  resolveExecutionMethod,
} from '../../core/index.js'
import {
  type CompiledMessagePortExecution,
  type CompiledMessagePortRoute,
} from '../compiled.js'
import {
  type MessagePortProcedureName,
  messagePortProcedureName,
} from '../identity.js'
import { type ExecutionNodeId } from '../../core/model/identity.js'
import { IngressGate } from '../../runtime/ingress-gate.js'
import { type EpochMs, expiresAt, epochNow } from '../../core/units.js'
import { match } from 'ts-pattern'
import { isAsyncIterable, createLeasedMessagePortStream } from './stream.js'

function isMessagePortResult(value: unknown): value is MessagePortResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    value.kind === 'message-port-result' &&
    'response' in value &&
    typeof value.response === 'string' &&
    'value' in value
  )
}

function createMessagePortHandler(
  value: unknown,
  name: string,
): (context: MessagePortContext) => Promise<MessagePortResult> {
  if (typeof value !== 'object' || value === null)
    throw new TypeError(
      'MessagePort factoryはhandlerのオブジェクトを返してください。',
    )
  const handler = resolveExecutionMethod(value, name)
  if (!handler)
    throw new TypeError(
      `MessagePort handler ${name}は関数である必要があります。`,
    )
  return async (context) => {
    const result = await handler(context)
    if (!isMessagePortResult(result))
      throw new TypeError(
        `MessagePort handler ${name}はMessagePort resultを返してください。`,
      )
    return result
  }
}

export function createMessagePortRuntime(
  bindings: readonly ExecutionRuntimeBinding<CompiledMessagePortExecution>[],
  applicationRuntime: ExecutionKernelRuntime,
): MessagePortExtensionRuntime {
  const routes = new Map<
    MessagePortProcedureName,
    {
      readonly executionId: ExecutionNodeId
      readonly route: CompiledMessagePortRoute
      readonly handler: (
        context: MessagePortContext,
      ) => MessagePortResult | Promise<MessagePortResult>
    }
  >()
  const ingress = new IngressGate()
  const activeStreams = new Set<{
    abort(reason: unknown, deadline: EpochMs): Promise<void>
  }>()
  for (const binding of bindings) {
    const { execution } = binding
    const handlers = execution.compiled.handler.createResolver(binding)()
    for (const [method, definition] of Object.entries(
      execution.compiled.routes,
    )) {
      routes.set(messagePortProcedureName(method), {
        executionId: execution.id,
        route: definition,
        handler: createMessagePortHandler(handlers, method),
      })
    }
  }
  return {
    async invoke(method, input) {
      const completePendingIngress = ingress.enter()
      if (!completePendingIngress) {
        throw new Error('LUTRE_MESSAGE_PORT_DRAINING')
      }
      const route = routes.get(method)
      if (!route) {
        completePendingIngress()
        throw new Error(`LUTRE_MESSAGE_PORT_METHOD_NOT_FOUND: ${method}`)
      }
      let lease: ReturnType<ExecutionKernelRuntime['beginExecution']>
      try {
        lease = applicationRuntime.beginExecution({
          executionId: route.executionId,
          executionKind: 'message-port.invocation',
          graphNodeId: route.executionId,
          name: method,
        })
      } catch (error) {
        completePendingIngress()
        throw error
      }
      let executionOwnedByStream = false
      try {
        const value = route.route.input
          ? await validateSchema(route.route.input, input)
          : input
        const response = Object.fromEntries(
          Object.keys(route.route.responses).map((name) => [
            name,
            (result: unknown) => ({
              kind: 'message-port-result' as const,
              response: name,
              value: result,
            }),
          ]),
        )
        const invoke = () =>
          route.handler({
            input: value,
            response,
            signal: lease.signal,
          })
        const result = await (lease.run ? lease.run(invoke) : invoke())
        const schema = route.route.responses[result.response]
        if (!schema) {
          throw new Error(
            `LUTRE_MESSAGE_PORT_RESPONSE_UNDECLARED: ${result.response}`,
          )
        }
        return await match(schema)
          .returnType<Promise<MessagePortInvocationResult>>()
          .with({ kind: 'stream' }, async ({ schema: bodySchema }) => {
            if (!isAsyncIterable(result.value))
              throw new TypeError('LUTRE_MESSAGE_PORT_STREAM_REQUIRED')
            const stream = createLeasedMessagePortStream(
              bodySchema,
              result.value,
              lease,
              activeStreams,
            )
            executionOwnedByStream = true
            return { kind: 'stream', response: result.response, value: stream }
          })
          .with({ kind: 'unary' }, async ({ schema: bodySchema }) => ({
            kind: 'unary',
            response: result.response,
            value: await validateSchema(bodySchema, result.value),
          }))
          .exhaustive()
      } catch (error) {
        lease.fail?.(error)
        throw error
      } finally {
        if (!executionOwnedByStream) lease.complete()
        completePendingIngress()
      }
    },
    async drain({ timeoutMs }) {
      ingress.stopAccepting()
      const deadline = expiresAt(epochNow(), timeoutMs)
      await ingress.waitForIdle()
      const reason = new Error('LUTRE_MESSAGE_PORT_DRAINING')
      const results = await Promise.allSettled(
        [...activeStreams].map((stream) => stream.abort(reason, deadline)),
      )
      const errors = results.flatMap((result) =>
        result.status === 'rejected' ? [result.reason] : [],
      )
      if (errors.length > 0) {
        throw new AggregateError(errors, 'MessagePort stream drain failed.')
      }
    },
  }
}
