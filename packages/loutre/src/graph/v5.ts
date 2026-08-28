import {
  argumentsProvider,
  asModuleInstance,
  defineModule,
  normalizeProvider,
  queueRuntimeToken,
  tokenName,
  type ArgsClass,
  type ModuleInstance,
  type ModuleTemplate,
  type QueueDescriptor,
  type StandardSchemaV1,
  type TaskDescriptor,
  type TriggerDescriptor,
} from '../core/index.js'
import {
  compileApplication as compileLegacyApplication,
  type ApplicationCompilationInput as LegacyApplicationCompilationInput,
} from './graph.js'
import type {
  ApplicationGraphIR as LegacyApplicationGraphIR,
  DependencyEdgeIR as LegacyDependencyEdgeIR,
  DependencyNodeIR as LegacyDependencyNodeIR,
  Diagnostic,
} from './ir.js'
import type {
  ApplicationGraphIR,
  CompilationResult,
  DependencyEdgeIR,
  DependencyNodeIR,
  ExecutionRootIR,
  ProviderIR,
  QueueIR,
  TaskIR,
} from './ir-v5.js'

export interface ApplicationCompilationInput {
  readonly modules: readonly (ModuleInstance | ModuleTemplate<void>)[]
  readonly arguments?: ArgsClass | undefined
  /** Graph v3互換compilerへ渡すためだけに残し、Graph v5へEntrypointを公開しない。 */
  readonly entrypoint?: undefined
  readonly tasks?: readonly TaskDescriptor<any, any>[]
  readonly triggers?: readonly TriggerDescriptor[]
}

export class StaticValidationError extends Error {
  constructor(
    readonly diagnostics: readonly Diagnostic[],
    readonly graph?: ApplicationGraphIR,
  ) {
    super(
      diagnostics
        .map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`)
        .join('\n'),
    )
    this.name = 'StaticValidationError'
  }
}

export function compileApplication(
  input: ApplicationCompilationInput,
): CompilationResult {
  const publicTasks = input.tasks ?? []
  const triggers = input.triggers ?? []
  const tasks = uniqueTasks([
    ...publicTasks,
    ...triggers.map((trigger) => trigger.task),
  ])
  const argumentModule = input.arguments
    ? defineModule(() => ({
        name: '@loutrejs/application-arguments',
        providers: [argumentsProvider(input.arguments!)],
      }))()
    : undefined
  const modules = argumentModule
    ? [...input.modules, argumentModule]
    : input.modules

  const cronTriggers = triggers.filter(
    (
      trigger,
    ): trigger is Extract<TriggerDescriptor, { readonly trigger: 'cron' }> =>
      trigger.trigger === 'cron',
  )
  const queueTriggers = triggers.filter(
    (
      trigger,
    ): trigger is Extract<
      TriggerDescriptor,
      { readonly trigger: 'queue-consumer' }
    > => trigger.trigger === 'queue-consumer',
  )

  const schedules = cronTriggers.map((trigger) => ({
    kind: 'schedule' as const,
    name: trigger.name,
    cron: { expression: trigger.expression, timezone: trigger.timezone },
    entrypoint: trigger.task,
  })) satisfies NonNullable<LegacyApplicationCompilationInput['schedules']>
  const consumers = queueTriggers.map((trigger) => ({
    kind: 'queue-consumer' as const,
    name: trigger.name,
    queue: trigger.queue,
    entrypoint: trigger.task,
  })) satisfies NonNullable<LegacyApplicationCompilationInput['consumers']>
  const queues = uniqueQueues(queueTriggers.map((trigger) => trigger.queue))
  const legacy = compileLegacyApplication({
    modules,
    entrypoints: tasks,
    schedules,
    queues,
    consumers,
  })

  const diagnostics = [
    ...legacy.diagnostics
      .filter(
        (diagnostic) =>
          diagnostic.code !== 'LUTRE_SCHEDULE_DUPLICATE' &&
          diagnostic.code !== 'LUTRE_CONSUMER_DUPLICATE' &&
          diagnostic.code !== 'LUTRE_ENTRYPOINT_DUPLICATE',
      )
      .map(mapLegacyDiagnostic),
    ...validateTaskNames(tasks),
    ...validateTriggerNames(triggers),
    ...validateQueueDrivers(input.modules, queueTriggers),
  ]

  const graph = toGraphV5({
    legacy: legacy.graph,
    input,
    publicTasks,
    tasks,
    triggers,
    queues,
    diagnostics,
    argumentModule,
  })
  return { graph, diagnostics }
}

export function assertValidCompilation(
  result: CompilationResult,
): ApplicationGraphIR {
  if (result.diagnostics.length > 0) {
    throw new StaticValidationError(result.diagnostics, result.graph)
  }
  return result.graph
}

function toGraphV5(options: {
  readonly legacy: LegacyApplicationGraphIR
  readonly input: ApplicationCompilationInput
  readonly publicTasks: readonly TaskDescriptor<any, any>[]
  readonly tasks: readonly TaskDescriptor<any, any>[]
  readonly triggers: readonly TriggerDescriptor[]
  readonly queues: readonly QueueDescriptor[]
  readonly diagnostics: readonly Diagnostic[]
  readonly argumentModule: ModuleInstance | undefined
}): ApplicationGraphIR {
  const {
    legacy,
    input,
    publicTasks,
    tasks,
    triggers,
    queues,
    diagnostics,
    argumentModule,
  } = options
  const syntheticModuleIndex = argumentModule
    ? legacy.modules.findIndex(
        (module) => module.name === '@loutrejs/application-arguments',
      )
    : -1
  const syntheticModuleId =
    syntheticModuleIndex < 0
      ? undefined
      : legacy.modules[syntheticModuleIndex]?.id
  const argumentName = input.arguments?.name
  const remapId = (id: string): string => {
    if (argumentName && id === `class:${argumentName}`)
      return `arguments:${argumentName}`
    if (id.startsWith('entrypoint:'))
      return `task:${id.slice('entrypoint:'.length)}`
    return id
  }
  const nodes = legacy.nodes
    .filter((node) => node.id !== syntheticModuleId)
    .map((node): DependencyNodeIR =>
      mapNode(node, argumentName, remapId, syntheticModuleId),
    )
  const conditionalByToken = collectConditionalInputs(input.modules)
  const edges = legacy.edges.map((edge): DependencyEdgeIR =>
    mapEdge(edge, legacy.nodes, remapId, conditionalByToken),
  )
  const publicSet = new Set(publicTasks)
  const taskIR = tasks.map<TaskIR>((task) => ({
    id: `task:${task.name}`,
    name: task.name,
    public: publicSet.has(task),
  }))
  const executions: ExecutionRootIR[] = [
    ...legacy.executions.flatMap((execution): ExecutionRootIR[] =>
      execution.kind === 'protocol' ? [execution] : [],
    ),
    ...publicTasks.map((task) => ({
      id: `task:${task.name}` as const,
      kind: 'task' as const,
      name: task.name,
    })),
    ...triggers.map(toTriggerExecution),
  ]
  const providers = legacy.providers.map<ProviderIR>((provider) => ({
    token: provider.token,
    kind: provider.kind,
    scope: provider.scope,
    dependencies: provider.dependencies,
  }))
  const modules = legacy.modules.filter(
    (module) => module.id !== syntheticModuleId,
  )
  const capabilities = [
    ...legacy.capabilities.filter(
      (capability) => capability.requiredBy !== syntheticModuleId,
    ),
    ...(input.arguments
      ? [
          {
            name: 'args.runtime',
            scope: 'application' as const,
            requiredBy: 'application',
          },
        ]
      : []),
  ]
  return {
    version: 5,
    modules,
    ...(input.arguments ? { arguments: { name: input.arguments.name } } : {}),
    providers,
    tokens: legacy.tokens,
    contextKeys: legacy.contextKeys,
    contracts: legacy.contracts,
    pipelines: legacy.pipelines,
    implementations: legacy.implementations,
    tasks: taskIR,
    queues: queues.map(toQueueIR),
    executions,
    capabilities,
    hostCapabilities: collectHostCapabilities(input.modules),
    nodes,
    edges,
    diagnostics,
  }
}

function mapNode(
  node: LegacyDependencyNodeIR,
  argumentName: string | undefined,
  remapId: (id: string) => string,
  syntheticModuleId: string | undefined,
): DependencyNodeIR {
  const kind =
    node.kind === 'entrypoint'
      ? 'task'
      : argumentName && node.label === argumentName
        ? 'arguments'
        : node.kind
  const { module, ...rest } = node
  return {
    ...rest,
    id: remapId(node.id),
    kind,
    ...(module === undefined || module === syntheticModuleId ? {} : { module }),
  }
}

function mapEdge(
  edge: LegacyDependencyEdgeIR,
  nodes: readonly LegacyDependencyNodeIR[],
  remapId: (id: string) => string,
  conditionalByToken: ReadonlyMap<
    string,
    { readonly source: 'environment' | 'arguments'; readonly contract: string }
  >,
): DependencyEdgeIR {
  const fromNode = nodes.find((node) => node.id === edge.from)
  const runtimeInput = fromNode
    ? conditionalByToken.get(fromNode.label)
    : undefined
  return {
    from: remapId(edge.from),
    to: remapId(edge.to),
    kind: edge.kind,
    source: edge.source,
    ...(edge.condition
      ? {
          condition: {
            source: runtimeInput?.source ?? 'environment',
            contract: runtimeInput?.contract ?? '',
            key: edge.condition.key,
            equals: edge.condition.equals,
          },
        }
      : {}),
  }
}

function collectConditionalInputs(
  roots: readonly (ModuleInstance | ModuleTemplate<void>)[],
): ReadonlyMap<
  string,
  { readonly source: 'environment' | 'arguments'; readonly contract: string }
> {
  const result = new Map<
    string,
    { readonly source: 'environment' | 'arguments'; readonly contract: string }
  >()
  for (const module of collectModules(roots)) {
    for (const declaration of module.definition.providers ?? []) {
      const provider = normalizeProvider(declaration)
      if (provider.kind !== 'conditional') continue
      result.set(tokenName(provider.provide), {
        source: provider.select.source,
        contract:
          typeof provider.select.contract === 'function'
            ? provider.select.contract.name
            : provider.select.contract.id,
      })
    }
  }
  return result
}

function toTriggerExecution(trigger: TriggerDescriptor): ExecutionRootIR {
  switch (trigger.trigger) {
    case 'cron':
      return {
        id: `trigger:${trigger.name}`,
        kind: 'trigger',
        trigger: 'cron',
        name: trigger.name,
        expression: trigger.expression,
        timezone: trigger.timezone,
        overlap: trigger.overlap,
        task: trigger.task.name,
      }
    case 'fixed-delay':
      return {
        id: `trigger:${trigger.name}`,
        kind: 'trigger',
        trigger: 'fixed-delay',
        name: trigger.name,
        delay: trigger.delay,
        immediate: trigger.immediate,
        task: trigger.task.name,
      }
    case 'queue-consumer':
      return {
        id: `trigger:${trigger.name}`,
        kind: 'trigger',
        trigger: 'queue-consumer',
        name: trigger.name,
        queue: trigger.queue.name,
        task: trigger.task.name,
      }
  }
}

function toQueueIR(queue: QueueDescriptor): QueueIR {
  return {
    id: `queue:${queue.name}`,
    name: queue.name,
    payloadSchema: schemaIdentity(queue.payload),
  }
}

function schemaIdentity(schema: StandardSchemaV1): string {
  const standard = schema['~standard'] as {
    readonly vendor?: unknown
    readonly version?: unknown
  }
  const vendor =
    typeof standard.vendor === 'string' ? standard.vendor : 'standard-schema'
  const version =
    typeof standard.version === 'number' || typeof standard.version === 'string'
      ? String(standard.version)
      : '1'
  return `${vendor}@${version}`
}

function uniqueTasks(
  tasks: readonly TaskDescriptor<any, any>[],
): readonly TaskDescriptor<any, any>[] {
  return [...new Set(tasks)]
}

function uniqueQueues(queues: readonly QueueDescriptor[]): QueueDescriptor[] {
  return [...new Set(queues)]
}

function validateTaskNames(
  tasks: readonly TaskDescriptor<any, any>[],
): Diagnostic[] {
  return validateNames(tasks, 'LUTRE_TASK_001', 'Task')
}

function validateTriggerNames(
  triggers: readonly TriggerDescriptor[],
): Diagnostic[] {
  return validateNames(triggers, 'LUTRE_TRIGGER_DUPLICATE', 'Trigger')
}

function validateNames(
  descriptors: readonly { readonly name: string }[],
  code: string,
  noun: string,
): Diagnostic[] {
  const seen = new Map<string, object>()
  const diagnostics: Diagnostic[] = []
  for (const descriptor of descriptors) {
    const previous = seen.get(descriptor.name)
    if (previous && previous !== descriptor) {
      diagnostics.push({
        code,
        message: `${noun} name ${descriptor.name} is declared by multiple descriptors.`,
        path: descriptor.name,
      })
    }
    seen.set(descriptor.name, descriptor)
  }
  return diagnostics
}

function validateQueueDrivers(
  roots: readonly (ModuleInstance | ModuleTemplate<void>)[],
  triggers: readonly Extract<
    TriggerDescriptor,
    { readonly trigger: 'queue-consumer' }
  >[],
): Diagnostic[] {
  const providers = collectModules(roots).flatMap((module) =>
    (module.definition.providers ?? []).map(normalizeProvider),
  )
  return triggers.flatMap((trigger) => {
    const token = queueRuntimeToken(trigger.queue)
    return providers.some((provider) => provider.provide === token)
      ? []
      : [
          {
            code: 'LUTRE_QUEUE_DRIVER_UNBOUND',
            message: `Queue ${trigger.queue.name} has a consumer trigger but no runtime driver binding.`,
            path: `trigger:${trigger.name}`,
          },
        ]
  })
}

function collectHostCapabilities(
  roots: readonly (ModuleInstance | ModuleTemplate<void>)[],
): string[] {
  return [
    ...new Set(
      collectModules(roots).flatMap((module) =>
        (module.definition.implementations ?? []).flatMap(
          (implementation) => implementation.capabilities,
        ),
      ),
    ),
  ]
}

function collectModules(
  roots: readonly (ModuleInstance | ModuleTemplate<void>)[],
): ModuleInstance[] {
  const result: ModuleInstance[] = []
  const seen = new Set<ModuleInstance>()
  const visit = (candidate: ModuleInstance | ModuleTemplate<void>) => {
    const module = asModuleInstance(candidate)
    if (seen.has(module)) return
    seen.add(module)
    for (const imported of module.definition.imports ?? []) visit(imported)
    result.push(module)
  }
  for (const root of roots) visit(root)
  return result
}

function mapLegacyDiagnostic(diagnostic: Diagnostic): Diagnostic {
  switch (diagnostic.code) {
    case 'LUTRE_ENTRYPOINT_DUPLICATE':
      return { ...diagnostic, code: 'LUTRE_TASK_001' }
    case 'LUTRE_ENTRYPOINT_ASYNC_FACTORY':
      return { ...diagnostic, code: 'LUTRE_TASK_ASYNC_FACTORY' }
    case 'LUTRE_ENTRYPOINT_FACTORY_RESULT':
      return { ...diagnostic, code: 'LUTRE_TASK_FACTORY_RESULT' }
    case 'LUTRE_SCHEDULE_INVALID_CRON':
      return {
        ...diagnostic,
        code: 'LUTRE_TRIGGER_INVALID_CRON',
        path: `trigger:${diagnostic.path}`,
      }
    case 'LUTRE_SCHEDULE_INVALID_TIMEZONE':
      return {
        ...diagnostic,
        code: 'LUTRE_TRIGGER_INVALID_TIMEZONE',
        path: `trigger:${diagnostic.path}`,
      }
    default:
      return diagnostic
  }
}
