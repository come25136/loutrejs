import {
  collectInjectedDependencies,
  defineExecution,
  defineExecutionExtension,
  runInInjectionContext,
  validateSchema,
  type ExecutionDefinition,
  type ExecutionKernelRuntime,
  type SchemaOutput,
  type StandardSchemaV1,
} from '@loutrejs/loutre'

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
  drain(): Promise<void>
}

export interface MessagePortHostApi {
  invoke(method: string, input?: unknown): Promise<MessagePortResult>
}

export const messagePortExtension = defineExecutionExtension<
  MessagePortImplementationData & ExecutionDefinition,
  CompiledMessagePortExecution,
  'messagePort',
  MessagePortHostApi,
  MessagePortExtensionRuntime
>({
  kind: 'execution-extension',
  abiVersion: '1',
  name: '@loutrejs/message-port',
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
})

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
  let accepting = true
  const activeStreams = new Set<{
    abort(reason?: unknown): Promise<void>
  }>()
  let pendingIngresses = 0
  const pendingIngressWaiters = new Set<() => void>()
  const trackPendingIngress = () => {
    pendingIngresses += 1
    let completed = false
    return () => {
      if (completed) return
      completed = true
      pendingIngresses -= 1
      if (pendingIngresses !== 0) return
      for (const resolve of pendingIngressWaiters) resolve()
      pendingIngressWaiters.clear()
    }
  }
  const waitForPendingIngresses = () =>
    pendingIngresses === 0
      ? Promise.resolve()
      : new Promise<void>((resolve) => pendingIngressWaiters.add(resolve))
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
      if (!accepting) throw new Error('LUTRE_MESSAGE_PORT_DRAINING')
      const route = routes.get(method)
      if (!route) {
        throw new Error(`LUTRE_MESSAGE_PORT_METHOD_NOT_FOUND: ${method}`)
      }
      const lease = applicationRuntime.beginExecution()
      const completePendingIngress = trackPendingIngress()
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
    async drain() {
      accepting = false
      await waitForPendingIngresses()
      const reason = new Error('LUTRE_MESSAGE_PORT_DRAINING')
      const results = await Promise.allSettled(
        [...activeStreams].map((stream) => stream.abort(reason)),
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
  activeStreams: Set<{ abort(reason?: unknown): Promise<void> }>,
): AsyncIterable<unknown> & { cancel(reason?: unknown): Promise<void> } {
  const iterator = source[Symbol.asyncIterator]()
  let finished = false
  let completed = false
  let inFlightOperations = 0
  let cancellationSettled = true
  let cancellation: Promise<void> | undefined
  let cancellationResult: IteratorResult<unknown> | undefined
  let resolveCompleted!: () => void
  const completedPromise = new Promise<void>((resolve) => {
    resolveCompleted = resolve
  })
  let control: { abort(reason?: unknown): Promise<void> }

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
  const cancel = (reason?: unknown): Promise<void> => {
    if (cancellation) return cancellation
    if (!markFinished()) return completedPromise
    cancellationSettled = false
    cancellation = (async () => {
      let cleanupError: unknown
      try {
        cancellationResult = await iterator.return?.(reason)
      } catch (error) {
        cleanupError = error
      } finally {
        cancellationSettled = true
        completeIfSafe()
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
    async abort(reason) {
      lease.abort(reason)
      await cancel(reason)
    },
  }
  activeStreams.add(control)
  if (lease.signal.aborted) onAbort()
  else lease.signal.addEventListener('abort', onAbort, { once: true })

  const closeAfterError = async (error: unknown): Promise<never> => {
    let cleanupError: unknown
    try {
      await iterator.return?.(error)
    } catch (caught) {
      cleanupError = caught
    } finally {
      markFinished()
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
      await cancel(reason)
      return (
        cancellationResult ?? {
          done: true,
          value: reason,
        }
      )
    },
    async throw(error?: unknown) {
      if (finished) throw error
      inFlightOperations += 1
      try {
        if (!iterator.throw) return await closeAfterError(error)
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

export type MessagePortLike = {
  postMessage(value: unknown): void
  start?(): void
} & Pick<EventTarget, 'addEventListener'>

export function attachMessagePort(
  host: MessagePortHostApi,
  port: MessagePortLike,
): void {
  port.addEventListener('message', async (event) => {
    const request = (event as MessageEvent<unknown>).data as {
      readonly id: string
      readonly procedure: string
      readonly input?: unknown
    }
    try {
      const result = await host.invoke(request.procedure, request.input)
      if (isAsyncIterable(result.value)) {
        for await (const value of result.value) {
          port.postMessage({
            id: request.id,
            response: result.response,
            value,
            done: false,
          })
        }
        port.postMessage({
          id: request.id,
          response: result.response,
          done: true,
        })
      } else {
        port.postMessage({
          id: request.id,
          response: result.response,
          value: result.value,
          done: true,
        })
      }
    } catch (error) {
      port.postMessage({
        id: request.id,
        error: error instanceof Error ? error.message : String(error),
        done: true,
      })
    }
  })
  port.start?.()
}
