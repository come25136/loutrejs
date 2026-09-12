import {
  collectInjectedDependencies,
  defineExecution,
  defineExecutionExtension,
  runInInjectionContext,
  validateSchema,
  type ExecutionDefinition,
  type ExecutionExtension,
  type ExecutionExtensionDrainContext,
  type ExecutionKernelRuntime,
  type SchemaOutput,
  type StandardSchemaV1,
} from '../core/index.js'
import { IngressGate } from '../runtime/ingress-gate.js'
import {
  AsyncIteratorCleanupDeadlineError,
  AsyncIteratorLifecycle,
} from '../runtime/async-iterator-lifecycle.js'

export interface MessagePortServerStreamResponseDefinition {
  readonly body: StandardSchemaV1
  readonly stream: 'server'
}

export type MessagePortResponseDefinition =
  | StandardSchemaV1
  | MessagePortServerStreamResponseDefinition

export interface MessagePortRouteDefinition {
  readonly input?: StandardSchemaV1
  readonly responses: Readonly<Record<string, MessagePortResponseDefinition>>
}

export interface MessagePortContract<
  TRoutes extends Readonly<Record<string, MessagePortRouteDefinition>> =
    Readonly<Record<string, MessagePortRouteDefinition>>,
> {
  readonly kind: 'message-port-contract'
  readonly routes: TRoutes
}

export interface MessagePortResult<
  TVariant extends string = string,
  TValue = unknown,
> {
  readonly kind: 'message-port-result'
  readonly response: TVariant
  readonly value: TValue
}

type MessagePortResponseValue<TResponse extends MessagePortResponseDefinition> =
  TResponse extends MessagePortServerStreamResponseDefinition
    ? AsyncIterable<SchemaOutput<TResponse['body']>>
    : TResponse extends StandardSchemaV1
      ? SchemaOutput<TResponse>
      : never

type ResponseHelpers<TRoute extends MessagePortRouteDefinition> = {
  readonly [TVariant in keyof TRoute['responses'] & string]: (
    value: MessagePortResponseValue<TRoute['responses'][TVariant]>,
  ) => MessagePortResult<
    TVariant,
    MessagePortResponseValue<TRoute['responses'][TVariant]>
  >
}

export interface MessagePortContext<
  TRoute extends MessagePortRouteDefinition = MessagePortRouteDefinition,
> {
  readonly input: TRoute['input'] extends StandardSchemaV1
    ? SchemaOutput<TRoute['input']>
    : unknown
  readonly response: ResponseHelpers<TRoute>
  readonly signal: AbortSignal
}

export type MessagePortHandlers<TContract extends MessagePortContract> = {
  readonly [TName in keyof TContract['routes']]: (
    context: MessagePortContext<TContract['routes'][TName]>,
  ) => MessagePortResult | Promise<MessagePortResult>
}

export interface MessagePortImplementationData<
  TContract extends MessagePortContract = MessagePortContract,
> {
  readonly name: string
  readonly contract: TContract
  readonly factory: () => MessagePortHandlers<TContract>
}

interface CompiledMessagePortExecution {
  readonly routes: MessagePortContract['routes']
  readonly factory: () => Readonly<
    Record<
      string,
      (
        context: MessagePortContext,
      ) => MessagePortResult | Promise<MessagePortResult>
    >
  >
}

export interface MessagePortExtensionRuntime {
  invoke(method: string, input?: unknown): Promise<MessagePortResult>
  drain(context: ExecutionExtensionDrainContext): Promise<void>
}

export interface MessagePortHostApi {
  invoke(method: string, input?: unknown): Promise<MessagePortResult>
}

declare const messagePortExecutionExtensionIdentity: unique symbol

export const messagePortExtension = defineExecutionExtension<
  MessagePortImplementationData & ExecutionDefinition,
  CompiledMessagePortExecution,
  'messagePort',
  MessagePortHostApi,
  MessagePortExtensionRuntime
>({
  kind: 'execution-extension',
  abiVersion: '1',
  name: 'loutre:message-port',
  compile(definition, context) {
    return {
      kind: 'execution',
      id:
        definition.name ||
        `${context.moduleId}.message-port.${context.definitionIndex}`,
      executionKind: 'message-port.invocation',
      dependencies: collectInjectedDependencies(
        {
          kind: 'execution',
          id: `message-port:${definition.name || `${context.moduleId}.message-port.${context.definitionIndex}`}`,
          name:
            definition.name ||
            `${context.moduleId}.message-port.${context.definitionIndex}`,
        },
        () => definition.factory(),
      ),
      capabilities: [],
      compiled: Object.freeze({
        routes: snapshotMessagePortRoutes(definition.contract.routes),
        factory: definition.factory as CompiledMessagePortExecution['factory'],
      }),
    }
  },
  validate({ executions }) {
    const methods = new Set<string>()
    return executions.flatMap((execution) =>
      Object.keys(execution.compiled.routes).flatMap((method) => {
        if (!methods.has(method)) {
          methods.add(method)
          return []
        }
        return [
          {
            code: 'LUTRE_MESSAGE_PORT_DUPLICATE_METHOD',
            message: `MessagePort method ${method} is declared more than once.`,
            path: execution.id,
          },
        ]
      }),
    )
  },
  createRuntime({ executions, applicationRuntime }) {
    return createMessagePortRuntime(executions, applicationRuntime)
  },
  projectGraph: ({ execution }) => ({
    methods: Object.keys(execution.compiled.routes),
  }),
  host: {
    namespace: 'messagePort',
    create: ({ runtime }) => ({
      invoke: (method, input) => runtime.invoke(method, input),
    }),
  },
}) as ExecutionExtension<
  MessagePortImplementationData & ExecutionDefinition,
  CompiledMessagePortExecution,
  'messagePort',
  MessagePortHostApi,
  MessagePortExtensionRuntime
> & { readonly [messagePortExecutionExtensionIdentity]: true }

export type MessagePortExecutionDefinition<
  TContract extends MessagePortContract = MessagePortContract,
> = MessagePortImplementationData<TContract> &
  ExecutionDefinition<typeof messagePortExtension>

export function defineMessagePortContract<
  const TRoutes extends Readonly<Record<string, MessagePortRouteDefinition>>,
>(routes: TRoutes): MessagePortContract<TRoutes> {
  return Object.freeze({ kind: 'message-port-contract', routes })
}

export function defineMessagePortImplementation<
  const TContract extends MessagePortContract,
>(definition: {
  readonly name?: string
  readonly contract: TContract
  readonly factory: MessagePortImplementationData<TContract>['factory']
}): MessagePortExecutionDefinition<TContract> {
  return defineExecution(messagePortExtension, {
    name: definition.name ?? '',
    contract: definition.contract,
    factory: definition.factory,
  }) as MessagePortExecutionDefinition<TContract>
}

export const messagePort = Object.freeze({
  contract: defineMessagePortContract,
  implementation: defineMessagePortImplementation,
  extension: messagePortExtension,
})

function snapshotMessagePortRoutes(
  routes: MessagePortContract['routes'],
): MessagePortContract['routes'] {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(routes).map(([name, route]) => [
        name,
        Object.freeze({
          ...(route.input === undefined ? {} : { input: route.input }),
          responses: Object.freeze(
            Object.fromEntries(
              Object.entries(route.responses).map(([response, definition]) => [
                response,
                isMessagePortServerStreamResponse(definition)
                  ? Object.freeze({ ...definition })
                  : definition,
              ]),
            ),
          ),
        }),
      ]),
    ),
  )
}

function createMessagePortRuntime(
  executions: readonly {
    readonly id: string
    readonly compiled: CompiledMessagePortExecution
  }[],
  applicationRuntime: ExecutionKernelRuntime,
): MessagePortExtensionRuntime {
  const routes = new Map<
    string,
    {
      readonly route: MessagePortRouteDefinition
      readonly handler: (
        context: MessagePortContext,
      ) => MessagePortResult | Promise<MessagePortResult>
    }
  >()
  const ingress = new IngressGate()
  const activeStreams = new Set<{
    abort(reason: unknown, deadline: number): Promise<void>
  }>()
  for (const execution of executions) {
    const handlers = runInInjectionContext(
      {
        consumer: {
          kind: 'execution',
          id: `message-port:${execution.id}`,
          name: execution.id,
        },
        resolve: (token) => applicationRuntime.resolve(token, execution.id),
      },
      () => execution.compiled.factory(),
    )
    for (const [method, definition] of Object.entries(
      execution.compiled.routes,
    )) {
      const handler = handlers[method]
      if (handler) routes.set(method, { route: definition, handler })
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
        lease = applicationRuntime.beginExecution()
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
        const result = await route.handler({
          input: value,
          response,
          signal: lease.signal,
        } as MessagePortContext)
        const schema = route.route.responses[result.response]
        if (!schema) {
          throw new Error(
            `LUTRE_MESSAGE_PORT_RESPONSE_UNDECLARED: ${result.response}`,
          )
        }
        if (isMessagePortServerStreamResponse(schema)) {
          if (!isAsyncIterable(result.value)) {
            throw new TypeError('LUTRE_MESSAGE_PORT_STREAM_REQUIRED')
          }
          const stream = createLeasedMessagePortStream(
            schema.body,
            result.value,
            lease,
            activeStreams,
          )
          executionOwnedByStream = true
          return { ...result, value: stream }
        }
        return {
          ...result,
          value: await validateSchema(schema, result.value),
        }
      } finally {
        if (!executionOwnedByStream) lease.complete()
        completePendingIngress()
      }
    },
    async drain({ timeoutMs }) {
      ingress.stopAccepting()
      const deadline = Date.now() + timeoutMs
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

function createLeasedMessagePortStream(
  schema: StandardSchemaV1,
  source: AsyncIterable<unknown>,
  lease: ReturnType<ExecutionKernelRuntime['beginExecution']>,
  activeStreams: Set<{
    abort(reason: unknown, deadline: number): Promise<void>
  }>,
): AsyncIterable<unknown> & { cancel(reason?: unknown): Promise<void> } {
  const iterator = new AsyncIteratorLifecycle(source[Symbol.asyncIterator]())
  let finished = false
  let completed = false
  let inFlightOperations = 0
  let cancellationSettled = true
  let cancellation: Promise<void> | undefined
  let iteratorCleanup: Promise<void> | undefined
  let iteratorCleanupDeadline: number | undefined
  let iteratorCleanupComplete = false
  let resolveCompleted!: () => void
  const completedPromise = new Promise<void>((resolve) => {
    resolveCompleted = resolve
  })
  let control: {
    abort(reason: unknown, deadline: number): Promise<void>
  }

  const markFinished = () => {
    if (finished) return false
    finished = true
    lease.signal.removeEventListener('abort', onAbort)
    return true
  }
  const completeIfSafe = () => {
    if (
      completed ||
      !finished ||
      !cancellationSettled ||
      inFlightOperations > 0
    ) {
      return
    }
    completed = true
    activeStreams.delete(control)
    try {
      lease.complete()
    } finally {
      resolveCompleted()
    }
  }
  const startIteratorCleanup = (
    reason?: unknown,
    deadline?: number,
  ): Promise<void> => {
    if (iteratorCleanup) {
      if (deadline !== undefined) {
        iteratorCleanupDeadline = Math.min(
          iteratorCleanupDeadline ?? deadline,
          deadline,
        )
      }
      return iteratorCleanup
    }
    if (deadline !== undefined) iteratorCleanupDeadline = deadline
    markFinished()
    if (iteratorCleanupComplete) return Promise.resolve()
    cancellationSettled = false
    const operation = (async () => {
      try {
        await iterator.drain(
          reason,
          () => iteratorCleanupDeadline,
          'MessagePort iterator cleanup exceeded the drain deadline.',
        )
      } catch (error) {
        if (error instanceof AsyncIteratorCleanupDeadlineError) throw error
        iteratorCleanupComplete = true
        cancellationSettled = true
        throw error
      } finally {
        if (iterator.done) iteratorCleanupComplete = true
        if (iteratorCleanupComplete) cancellationSettled = true
        completeIfSafe()
      }
    })()
    iteratorCleanup = operation
    void operation.then(
      () => {
        if (iteratorCleanup === operation) iteratorCleanup = undefined
      },
      () => {
        if (iteratorCleanup === operation) iteratorCleanup = undefined
      },
    )
    return operation
  }
  const cancel = (reason?: unknown): Promise<void> => {
    if (cancellation) return cancellation
    cancellation = (async () => {
      let cleanupError: unknown
      try {
        await startIteratorCleanup(reason)
      } catch (error) {
        cleanupError = error
      }
      await completedPromise
      if (cleanupError !== undefined) throw cleanupError
    })()
    return cancellation
  }
  const onAbort = () => {
    // AbortSignalはasync cleanup errorを返せないため、error伝播が必要なdrainはcontrol.abort()を直接awaitする。
    void cancel(lease.signal.reason).catch(() => undefined)
  }
  control = {
    async abort(reason, deadline) {
      iteratorCleanupDeadline = deadline
      lease.abort(reason)
      const cleanup = startIteratorCleanup(reason, deadline)
      await cleanup
      await completedPromise
    },
  }
  activeStreams.add(control)
  if (lease.signal.aborted) onAbort()
  else lease.signal.addEventListener('abort', onAbort, { once: true })

  const closeAfterError = async (error: unknown): Promise<never> => {
    let cleanupError: unknown
    try {
      await startIteratorCleanup(error)
    } catch (caught) {
      cleanupError = caught
    }
    if (cleanupError !== undefined) {
      throw new AggregateError(
        [error, cleanupError],
        'MessagePort stream validation and cleanup failed.',
        { cause: error },
      )
    }
    throw error
  }
  const validateResult = async (
    result: IteratorResult<unknown>,
  ): Promise<IteratorResult<unknown>> => {
    if (result.done) {
      markFinished()
      return result
    }
    try {
      return {
        done: false,
        value: await validateSchema(schema, result.value),
      }
    } catch (error) {
      return closeAfterError(error)
    }
  }

  const wrapped: AsyncIterator<unknown> = {
    async next() {
      if (finished) return { done: true, value: undefined }
      inFlightOperations += 1
      try {
        return await validateResult(await iterator.next())
      } catch (error) {
        if (finished) throw error
        return await closeAfterError(error)
      } finally {
        inFlightOperations -= 1
        completeIfSafe()
      }
    },
    async return(reason?: unknown) {
      if (finished) return { done: true, value: reason }
      inFlightOperations += 1
      try {
        const result = await iterator.return(reason)
        if (result.done) {
          markFinished()
        }
        return result
      } catch (error) {
        markFinished()
        throw error
      } finally {
        inFlightOperations -= 1
        completeIfSafe()
      }
    },
    async throw(error?: unknown) {
      if (finished) throw error
      inFlightOperations += 1
      try {
        return await validateResult(await iterator.throw(error))
      } catch (caught) {
        if (finished) throw caught
        return await closeAfterError(caught)
      } finally {
        inFlightOperations -= 1
        completeIfSafe()
      }
    },
  }

  return {
    [Symbol.asyncIterator]() {
      return wrapped
    },
    cancel,
  }
}

function isMessagePortServerStreamResponse(
  response: MessagePortResponseDefinition,
): response is MessagePortServerStreamResponseDefinition {
  return (
    typeof response === 'object' &&
    response !== null &&
    'stream' in response &&
    response.stream === 'server' &&
    'body' in response
  )
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Symbol.asyncIterator in value &&
    typeof value[Symbol.asyncIterator] === 'function'
  )
}
