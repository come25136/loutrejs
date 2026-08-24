import {
  asModuleInstance,
  type ContextProvidedBeforeTerminal,
  validateSchema,
  type ContractDefinition,
  type ModuleInstance,
  type ModuleTemplate,
  type PipelineItem,
  type ProtocolDescriptor,
  type ProtocolFactory,
  type SchemaOutput,
  type StandardSchemaV1,
  type TerminalLayerDescriptor,
} from '@loutrejs/core'
import {
  assertValidCompilation,
  compileApplication,
  type ApplicationGraphIR,
} from '@loutrejs/graph'
import {
  ApplicationRuntime,
  executePipeline,
  Logger,
  normalizeUnknownError,
} from '@loutrejs/runtime'

export interface MessagePortResponseDefinition {
  readonly body: StandardSchemaV1
  readonly stream?: 'server'
}

export interface MessagePortProtocolDefinition {
  readonly interaction?: 'unary' | 'server-stream'
  readonly responses: Readonly<Record<string, MessagePortResponseDefinition>>
  readonly pipeline: readonly PipelineItem[]
}

export interface MessagePortProtocol<
  TDefinition extends MessagePortProtocolDefinition = MessagePortProtocolDefinition,
> extends ProtocolDescriptor<
    'messagePort',
    MessagePortHandlerContextDefinition<TDefinition>,
    LogicalMessagePortResult
  > {
  readonly definition: TDefinition
}

const handler: TerminalLayerDescriptor<'messagePort'> = Object.freeze({
  kind: 'terminal',
  name: 'messagePort.handler',
  role: 'terminal',
  protocol: 'messagePort',
})

function defineMessagePort<const TDefinition extends MessagePortProtocolDefinition>(
  definition: TDefinition,
): MessagePortProtocol<TDefinition> {
  return {
    kind: 'protocol',
    protocol: 'messagePort',
    interaction: definition.interaction ?? 'unary',
    definition,
  }
}

export const messagePort = Object.assign(defineMessagePort, {
  protocol: 'messagePort' as const,
  handler,
}) satisfies ProtocolFactory<'messagePort'> & {
  <const TDefinition extends MessagePortProtocolDefinition>(
    definition: TDefinition,
  ): MessagePortProtocol<TDefinition>
  readonly handler: TerminalLayerDescriptor<'messagePort'>
}

export interface LogicalMessagePortResult<
  TVariant extends string = string,
  TValue = unknown,
> {
  readonly kind: 'message-port-result'
  readonly variant: TVariant
  readonly value: TValue
}

type ProceduresForMessagePort<TContract extends ContractDefinition> = {
  [K in keyof TContract['procedures']]:
    'messagePort' extends keyof TContract['procedures'][K]['protocols'] ? K : never
}[keyof TContract['procedures']] & string

type ProtocolAt<
  TContract extends ContractDefinition,
  TProcedure extends keyof TContract['procedures'],
> = TContract['procedures'][TProcedure]['protocols']['messagePort' & keyof TContract['procedures'][TProcedure]['protocols']] extends infer TProtocol
  ? TProtocol extends MessagePortProtocol
    ? TProtocol
    : never
  : never

type MessageHelpers<TProtocol extends MessagePortProtocol> = {
  [TVariant in keyof TProtocol['definition']['responses'] & string]: (
    value: TProtocol['definition']['responses'][TVariant] extends {
      readonly stream: 'server'
    }
      ? AsyncIterable<
          SchemaOutput<TProtocol['definition']['responses'][TVariant]['body']>
        >
      : SchemaOutput<TProtocol['definition']['responses'][TVariant]['body']>,
  ) => LogicalMessagePortResult
}

type MessagePortHandlerContextDefinition<
  TDefinition extends MessagePortProtocolDefinition,
> = {
  readonly input: unknown
  readonly message: MessageHelpers<MessagePortProtocol<TDefinition>>
  readonly logger: Logger
} & ContextProvidedBeforeTerminal<TDefinition['pipeline']>

export type MessagePortHandlerContext<TProtocol extends MessagePortProtocol> =
  MessagePortHandlerContextDefinition<TProtocol['definition']>

export type HandlerOf<
  TContract extends ContractDefinition,
  TProtocol extends 'messagePort',
  TProcedures extends ProceduresForMessagePort<TContract> = ProceduresForMessagePort<TContract>,
> = TProtocol extends 'messagePort'
  ? {
      [K in TProcedures]: (
        context: MessagePortHandlerContext<ProtocolAt<TContract, K>>,
      ) => LogicalMessagePortResult | Promise<LogicalMessagePortResult>
    }
  : never

export type MessageContextOf<
  THandler,
  TProcedure extends keyof THandler,
> = THandler[TProcedure] extends (context: infer TContext, ...args: any[]) => any
  ? TContext
  : never

interface Route {
  readonly procedure: string
  readonly protocol: MessagePortProtocol
  readonly implementation: import('@loutrejs/core').Class
}

export interface MessagePortApplication {
  readonly graph: ApplicationGraphIR
  initialize(): Promise<void>
  shutdown(signal?: string): Promise<void>
  invoke(procedure: string, input?: unknown): Promise<LogicalMessagePortResult>
}

export function createMessagePortApplication(options: {
  readonly modules: readonly (ModuleInstance | ModuleTemplate<void>)[]
  readonly logger?: Logger
}): MessagePortApplication {
  const roots = options.modules.map(asModuleInstance)
  const graph = assertValidCompilation(compileApplication(roots))
  const applicationLogger = options.logger ?? new Logger()
  const runtime = new ApplicationRuntime(roots, { logger: applicationLogger })
  const logger = applicationLogger.child({ protocol: 'messagePort' })
  const routes = collectRoutes(runtime.graph.modules)
  let initialization: Promise<void> | undefined
  const initialize = () => (initialization ??= runtime.initialize())
  return {
    graph,
    initialize,
    shutdown: (signal) => runtime.shutdown(signal),
    async invoke(procedure, input) {
      const startedAt = Date.now()
      let invocationLogger = logger.child({
        procedure,
        executionId: crypto.randomUUID(),
      })
      try {
        await initialize()
        const route = routes.find((candidate) => candidate.procedure === procedure)
        if (!route) throw new Error(`MessagePort procedureがありません: ${procedure}`)
        invocationLogger = invocationLogger.child({
          source: `${route.implementation.name}.${route.procedure}`,
        })
        const message = Object.fromEntries(
          Object.keys(route.protocol.definition.responses).map((variant) => [
            variant,
            (value: unknown) => ({
              kind: 'message-port-result',
              variant,
              value,
            }),
          ]),
        )
        const context = {
          input,
          message,
          logger: invocationLogger,
        }
        const result = await executePipeline<
          Record<string, unknown>,
          LogicalMessagePortResult
        >(route.protocol.definition.pipeline, {
          context,
          validate: () => undefined,
          terminal: async (_layer, terminalContext) => {
            const target = runtime.container.resolveImplementation(
              route.implementation,
            ) as Record<string, unknown>
            const method = target[route.procedure]
            if (typeof method !== 'function') throw new Error('Handler methodがありません')
            return Reflect.apply(method, target, [terminalContext]) as Promise<LogicalMessagePortResult>
          },
        })
        const finalized = await finalize(route.protocol.definition, result)
        invocationLogger.info('MessagePort invocation completed', {
          event: 'message_port.invocation.completed',
          durationMs: Math.max(0, Date.now() - startedAt),
        })
        return finalized
      } catch (error) {
        const normalized = normalizeUnknownError(error, invocationLogger.context)
        invocationLogger.error('Unhandled application error', {
          event: 'application.error',
          durationMs: Math.max(0, Date.now() - startedAt),
          error: {
            code: normalized.code,
            id: normalized.errorId,
            name: error instanceof Error ? error.name : typeof error,
            message: normalized.message,
            ...(normalized.stack === undefined ? {} : { stack: normalized.stack }),
            ...(normalized.cause === undefined ? {} : { cause: normalized.cause }),
          },
        })
        throw error
      }
    },
  }
}

async function finalize(
  definition: MessagePortProtocolDefinition,
  result: LogicalMessagePortResult,
): Promise<LogicalMessagePortResult> {
  const response = definition.responses[result.variant]
  if (!response) throw new Error(`未宣言variantです: ${result.variant}`)
  if (response.stream === 'server') {
    if (!isAsyncIterable(result.value)) {
      throw new Error('server-stream resultにはAsyncIterableが必要です')
    }
    const source = result.value
    return {
      ...result,
      value: (async function* () {
        for await (const value of source) {
          yield await validateSchema(response.body, value)
        }
      })(),
    }
  }
  return { ...result, value: await validateSchema(response.body, result.value) }
}

function collectRoutes(modules: readonly ModuleInstance[]): Route[] {
  return modules.flatMap((module) =>
    (module.definition.implementations ?? []).flatMap((binding) => {
      if (binding.protocol !== 'messagePort') return []
      const procedures =
        binding.procedures ??
        Object.entries(binding.contract.procedures)
          .filter(([, procedure]) => 'messagePort' in procedure.protocols)
          .map(([name]) => name)
      return procedures.map((procedure) => ({
        procedure,
        protocol: binding.contract.procedures[procedure]!.protocols
          .messagePort as MessagePortProtocol,
        implementation: binding.implementation,
      }))
    }),
  )
}

export interface MessagePortLike {
  postMessage(value: unknown): void
  addEventListener(
    type: string,
    listener: (event: any) => void,
  ): void
  start?(): void
}

export function attachMessagePort(
  application: MessagePortApplication,
  port: MessagePortLike,
): void {
  port.addEventListener('message', async (event) => {
    const request = event.data as {
      readonly id: string
      readonly procedure: string
      readonly input?: unknown
    }
    try {
      const result = await application.invoke(request.procedure, request.input)
      if (isAsyncIterable(result.value)) {
        for await (const value of result.value) {
          port.postMessage({
            id: request.id,
            variant: result.variant,
            value,
            done: false,
          })
        }
        port.postMessage({ id: request.id, variant: result.variant, done: true })
      } else {
        port.postMessage({
          id: request.id,
          variant: result.variant,
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

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Symbol.asyncIterator in value &&
    typeof value[Symbol.asyncIterator] === 'function'
  )
}
