import {
  defineExecution,
  defineExecutionExtension,
  runInInjectionContext,
  validateSchema,
  type ExecutionDefinition,
  type ExecutionKernelRuntime,
  type SchemaOutput,
  type StandardSchemaV1,
  type TokenLike,
  type TokenValue,
} from '@loutrejs/loutre'

export interface MessagePortRouteDefinition {
  readonly input?: StandardSchemaV1
  readonly responses: Readonly<Record<string, StandardSchemaV1>>
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

type ResponseHelpers<TRoute extends MessagePortRouteDefinition> = {
  readonly [TVariant in keyof TRoute['responses'] & string]: (
    value: SchemaOutput<TRoute['responses'][TVariant]>,
  ) => MessagePortResult<TVariant, SchemaOutput<TRoute['responses'][TVariant]>>
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
  TInject extends readonly TokenLike[] = readonly TokenLike[],
> {
  readonly name: string
  readonly contract: TContract
  readonly inject: TInject
  readonly factory: (
    ...dependencies: { [K in keyof TInject]: TokenValue<TInject[K]> }
  ) => MessagePortHandlers<TContract>
}

interface CompiledMessagePortExecution {
  readonly routes: MessagePortContract['routes']
  readonly inject: readonly TokenLike[]
  readonly factory: (
    ...dependencies: any[]
  ) => Readonly<
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
  drain(): void
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
  name: '@loutrejs/message-port',
  compile(definition, context) {
    return {
      kind: 'execution',
      id:
        definition.name ||
        `${context.moduleId}.message-port.${context.definitionIndex}`,
      executionKind: 'message-port.invocation',
      extension: definition.extension,
      dependencies: definition.inject,
      capabilities: [],
      compiled: {
        routes: definition.contract.routes,
        inject: definition.inject,
        factory: definition.factory as CompiledMessagePortExecution['factory'],
      },
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
  project: ({ execution }) => ({
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
  TInject extends readonly TokenLike[] = readonly TokenLike[],
> = MessagePortImplementationData<TContract, TInject> &
  ExecutionDefinition<typeof messagePortExtension>

export function defineMessagePortContract<
  const TRoutes extends Readonly<Record<string, MessagePortRouteDefinition>>,
>(routes: TRoutes): MessagePortContract<TRoutes> {
  return Object.freeze({ kind: 'message-port-contract', routes })
}

export function defineMessagePortImplementation<
  const TContract extends MessagePortContract,
  const TInject extends readonly TokenLike[] = readonly [],
>(definition: {
  readonly name?: string
  readonly contract: TContract
  readonly inject?: TInject
  readonly factory: MessagePortImplementationData<TContract, TInject>['factory']
}): MessagePortExecutionDefinition<TContract, TInject> {
  return defineExecution(messagePortExtension, {
    name: definition.name ?? '',
    contract: definition.contract,
    inject: definition.inject ?? ([] as unknown as TInject),
    factory: definition.factory,
  }) as MessagePortExecutionDefinition<TContract, TInject>
}

export const messagePort = Object.freeze({
  contract: defineMessagePortContract,
  implementation: defineMessagePortImplementation,
  extension: messagePortExtension,
})

function createMessagePortRuntime(
  executions: readonly {
    readonly compiled: CompiledMessagePortExecution
  }[],
  applicationRuntime: ExecutionKernelRuntime,
): MessagePortExtensionRuntime {
  const routes = new Map<
    string,
    {
      readonly definition: MessagePortRouteDefinition
      readonly handler: (
        context: MessagePortContext,
      ) => MessagePortResult | Promise<MessagePortResult>
    }
  >()
  let accepting = true
  for (const execution of executions) {
    const dependencies = execution.compiled.inject.map((token) =>
      applicationRuntime.resolve(token),
    )
    const handlers = runInInjectionContext(
      {
        consumer: {
          kind: 'implementation-consumer',
          id: 'message-port',
          name: 'MessagePort execution',
        },
        resolve: (token) => applicationRuntime.resolve(token),
      },
      () => execution.compiled.factory(...dependencies),
    )
    for (const [method, definition] of Object.entries(
      execution.compiled.routes,
    )) {
      const handler = handlers[method]
      if (handler) routes.set(method, { definition, handler })
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
      try {
        const value = route.definition.input
          ? await validateSchema(route.definition.input, input)
          : input
        const response = Object.fromEntries(
          Object.keys(route.definition.responses).map((name) => [
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
        const schema = route.definition.responses[result.response]
        if (!schema) {
          throw new Error(
            `LUTRE_MESSAGE_PORT_RESPONSE_UNDECLARED: ${result.response}`,
          )
        }
        return {
          ...result,
          value: await validateSchema(schema, result.value),
        }
      } finally {
        lease.complete()
      }
    },
    drain() {
      accepting = false
    },
  }
}
